import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

interface CounterResult {
  count: number;
  retryAfterSeconds: number;
}

interface CounterStore {
  increment(key: string, windowSeconds: number): Promise<CounterResult>;
  acquireCooldown(key: string, seconds: number): Promise<number | null>;
}

class MemoryCounterStore implements CounterStore {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  async increment(key: string, windowSeconds: number): Promise<CounterResult> {
    const now = Date.now();
    const entry = this.entries.get(key);
    const current =
      entry && entry.expiresAt > now ? entry : { count: 0, expiresAt: now + windowSeconds * 1000 };

    current.count += 1;
    this.entries.set(key, current);

    return {
      count: current.count,
      retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
    };
  }

  async acquireCooldown(key: string, seconds: number): Promise<number | null> {
    const now = Date.now();
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > now) {
      return Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));
    }
    this.entries.set(key, { count: 1, expiresAt: now + seconds * 1000 });
    return null;
  }
}

class RedisCounterStore implements CounterStore {
  constructor(private readonly client: Redis) {}

  async increment(key: string, windowSeconds: number): Promise<CounterResult> {
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('TTL', KEYS[1])
      if ttl < 0 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
        ttl = tonumber(ARGV[1])
      end
      return { current, ttl }
    `;
    const [count, ttl] = (await this.client.eval(script, 1, key, String(windowSeconds))) as [
      number,
      number,
    ];

    return { count: Number(count), retryAfterSeconds: Math.max(1, Number(ttl)) };
  }

  async acquireCooldown(key: string, seconds: number): Promise<number | null> {
    const result = await this.client.set(key, '1', 'EX', seconds, 'NX');
    if (result === 'OK') {
      return null;
    }
    const ttl = await this.client.ttl(key);
    return ttl > 0 ? ttl : seconds;
  }
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private store: CounterStore;
  private fallback: MemoryCounterStore | null = null;
  private redis: Redis | null = null;
  private readonly phoneLimit: number;
  private readonly ipLimit: number;
  private readonly windowSeconds = 3600;

  constructor(private readonly config: ConfigService) {
    this.phoneLimit = this.config.get<number>('OTP_MAX_PER_PHONE_PER_HOUR', 5);
    this.ipLimit = this.config.get<number>('OTP_MAX_PER_IP_PER_HOUR', 10);

    const redisUrl = this.config.get<string>('REDIS_URL');
    if (redisUrl && this.config.get<string>('NODE_ENV') !== 'test') {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (attempt) => (attempt > 2 ? null : 200),
      });
      this.redis.on('error', () => undefined);
      this.store = new RedisCounterStore(this.redis);
    } else {
      this.store = new MemoryCounterStore();
    }
  }

  get cooldownSeconds(): number {
    return this.config.get<number>('OTP_REQUEST_COOLDOWN_SECONDS', 60);
  }

  async assertOtpRequestAllowed(phone: string, ip?: string): Promise<void> {
    const cooldown = await this.run((store) =>
      store.acquireCooldown(`otp:cooldown:${phone}`, this.cooldownSeconds),
    );
    if (cooldown !== null) {
      throw this.rateLimited(cooldown);
    }

    const phoneCounter = await this.run((store) =>
      store.increment(`otp:phone:${phone}`, this.windowSeconds),
    );
    if (phoneCounter.count > this.phoneLimit) {
      throw this.rateLimited(phoneCounter.retryAfterSeconds);
    }

    if (ip) {
      const ipCounter = await this.run((store) =>
        store.increment(`otp:ip:${ip}`, this.windowSeconds),
      );
      if (ipCounter.count > this.ipLimit) {
        throw this.rateLimited(ipCounter.retryAfterSeconds);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      this.redis.disconnect();
    }
  }

  private async run<T>(operation: (store: CounterStore) => Promise<T>): Promise<T> {
    try {
      return await operation(this.store);
    } catch (error) {
      if (!this.redis) {
        throw error;
      }
      this.logger.warn('Redis indisponible, bascule sur le limiteur en mémoire.');
      this.fallback ??= new MemoryCounterStore();
      this.store = this.fallback;
      return operation(this.store);
    }
  }

  private rateLimited(retryAfterSeconds: number): ApiError {
    return new ApiError(
      ERROR_CODES.OTP_RATE_LIMITED,
      429,
      'Trop de tentatives. Réessayez plus tard.',
      {
        retryAfterSeconds,
      },
    );
  }
}
