import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const NOTIFICATION_QUEUE = 'ea-notifications';
export const REMINDER_QUEUE = 'ea-document-reminders';

export function redisConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || '6379'),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
  };
}

@Injectable()
export class NotificationQueueService implements OnModuleDestroy {
  readonly notificationQueue?: Queue;
  readonly reminderQueue?: Queue;
  private readonly connection?: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return;
    }
    const prefix = this.config.get<string>('BULLMQ_PREFIX', 'ea');
    this.connection = new Redis(url, { maxRetriesPerRequest: null });
    this.notificationQueue = new Queue(NOTIFICATION_QUEUE, {
      connection: this.connection,
      prefix,
    });
    this.reminderQueue = new Queue(REMINDER_QUEUE, {
      connection: this.connection,
      prefix,
    });
  }

  async enqueueNotification(outboxId: string): Promise<void> {
    if (!this.notificationQueue) {
      return;
    }
    const attempts = this.config.get<number>('PUSH_MAX_ATTEMPTS', 3);
    await this.notificationQueue.add('deliver', { outboxId }, { attempts });
  }

  async enqueueReminder(reminderId: string): Promise<void> {
    if (!this.reminderQueue) {
      return;
    }
    await this.reminderQueue.add('remind', { reminderId }, { attempts: 1 });
  }

  async onModuleDestroy(): Promise<void> {
    await this.notificationQueue?.close();
    await this.reminderQueue?.close();
    await this.connection?.quit();
  }
}
