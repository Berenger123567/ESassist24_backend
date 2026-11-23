import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error';
import { ERROR_CODES } from '../errors/error-codes';
import { ContextualRequest } from '../middleware/request-context.middleware';
import { AuthUser } from '../types/auth-user';
import { RATE_LIMIT_KEY, RouteRateLimitOptions } from '../decorators/route-rate-limit.decorator';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RouteRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RouteRateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? {
      max: 'ADMIN_RATE_LIMIT_MAX',
      windowSeconds: 'ADMIN_RATE_LIMIT_WINDOW_SECONDS',
    };

    const max = this.resolveNumber(options.max, 120);
    const windowSeconds = this.resolveNumber(options.windowSeconds, 60);
    const request = context.switchToHttp().getRequest<ContextualRequest & { user?: AuthUser }>();
    const route = request.route?.path ?? request.path;
    const identity = request.user?.id ?? request.ip ?? 'anonymous';
    const key = `${request.method}:${route}:${identity}`;
    const now = Date.now();
    const current = this.buckets.get(key);

    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      this.prune(now);
      return true;
    }

    if (current.count >= max) {
      throw new ApiError(ERROR_CODES.RATE_LIMITED, 429, 'Trop de requêtes sur cette route.');
    }

    current.count += 1;
    return true;
  }

  private resolveNumber(value: number | string | undefined, fallback: number): number {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      const fromConfig = Number(this.config.get<string>(value));
      if (Number.isFinite(fromConfig) && fromConfig > 0) {
        return fromConfig;
      }
      const direct = Number(value);
      if (Number.isFinite(direct) && direct > 0) {
        return direct;
      }
    }
    return fallback;
  }

  private prune(now: number): void {
    if (this.buckets.size < 500) {
      return;
    }
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
