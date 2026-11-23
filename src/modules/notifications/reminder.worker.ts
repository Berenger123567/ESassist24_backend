import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { REMINDER_QUEUE, redisConnection } from './notification.queue';

interface ReminderJob {
  reminderId: string;
}

@Injectable()
export class ReminderWorkerService implements OnModuleDestroy {
  private readonly worker?: Worker<ReminderJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return;
    }
    this.worker = new Worker<ReminderJob>(REMINDER_QUEUE, (job) => this.process(job), {
      connection: redisConnection(url),
      prefix: this.config.get<string>('BULLMQ_PREFIX', 'ea'),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<ReminderJob>): Promise<void> {
    if (job.name !== 'remind') {
      return;
    }
    await this.prisma.documentReminder.updateMany({
      where: { id: job.data.reminderId, status: { not: DeliveryStatus.SENT } },
      data: { status: DeliveryStatus.SENT, sentAt: new Date() },
    });
  }
}
