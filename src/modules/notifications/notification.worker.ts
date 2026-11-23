import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, NotificationStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PushDispatcher } from '../push/push.dispatcher';
import { NOTIFICATION_QUEUE, redisConnection } from './notification.queue';

interface NotificationJob {
  outboxId: string;
}

@Injectable()
export class NotificationWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private readonly worker?: Worker<NotificationJob>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushDispatcher,
    private readonly config: ConfigService,
  ) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return;
    }
    this.worker = new Worker<NotificationJob>(NOTIFICATION_QUEUE, (job) => this.process(job), {
      connection: redisConnection(url),
      prefix: this.config.get<string>('BULLMQ_PREFIX', 'ea'),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async process(job: Job<NotificationJob>): Promise<void> {
    if (job.name !== 'deliver') {
      return;
    }
    const outbox = await this.prisma.notificationOutbox.findUnique({
      where: { id: job.data.outboxId },
      include: { notification: true },
    });
    if (!outbox || outbox.status === DeliveryStatus.SENT) {
      return;
    }

    const device = outbox.deviceId
      ? await this.prisma.device.findFirst({
          where: { deviceId: outbox.deviceId, userId: outbox.notification.userId },
        })
      : null;

    try {
      if (!device || device.revokedAt || !device.notificationsEnabled) {
        await this.markSent(outbox.id, outbox.notificationId);
        return;
      }
      await this.push.send(
        outbox.channel,
        device,
        outbox.payload as {
          title: string;
          body: string;
          type: string;
          entityId?: string | null;
          route?: string | null;
        },
      );
      await this.markSent(outbox.id, outbox.notificationId);
    } catch (error) {
      const maxAttempts = this.config.get<number>('PUSH_MAX_ATTEMPTS', 3);
      const attempts = outbox.attempts + 1;
      await this.prisma.notificationOutbox.update({
        where: { id: outbox.id },
        data: {
          attempts,
          status: attempts >= maxAttempts ? DeliveryStatus.FAILED : DeliveryStatus.QUEUED,
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'Erreur inconnue',
        },
      });
      this.logger.warn(`Échec push ${outbox.id}: ${String(error)}`);
      if (attempts < maxAttempts) {
        throw error;
      }
    }
  }

  private async markSent(outboxId: string, notificationId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.notificationOutbox.update({
        where: { id: outboxId },
        data: { status: DeliveryStatus.SENT, sentAt: now },
      }),
      this.prisma.notification.update({
        where: { id: notificationId },
        data: { status: NotificationStatus.SENT, sentAt: now },
      }),
    ]);
  }
}
