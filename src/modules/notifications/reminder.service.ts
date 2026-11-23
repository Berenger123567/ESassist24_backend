import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentEventType, DocumentStatus, RoleCode } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { NotificationQueueService } from './notification.queue';

@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
    private readonly queue: NotificationQueueService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('VERIFICATION_REMINDERS_ENABLED', 'true') !== 'true') {
      return;
    }
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  async run(): Promise<void> {
    await this.expireDocuments();
    await this.createReminders();
  }

  private scheduleNext(): void {
    const cron = this.config.get<string>('VERIFICATION_REMINDER_CRON', '0 6 * * *').split(' ');
    const minute = Number(cron[0] ?? '0');
    const hour = Number(cron[1] ?? '6');
    const now = new Date();
    const next = new Date(now);
    next.setHours(Number.isInteger(hour) ? hour : 6, Number.isInteger(minute) ? minute : 0, 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    this.timer = setTimeout(() => {
      void this.run().finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
    this.timer.unref?.();
  }

  private thresholds(): number[] {
    return this.config
      .get<string>('VERIFICATION_REMINDER_DAYS', '30,14,7,1,0')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0);
  }

  private async expireDocuments(): Promise<void> {
    const now = new Date();
    const expired = await this.prisma.document.findMany({
      where: { expiresAt: { lte: now }, status: { not: DocumentStatus.EXPIRED } },
      select: { id: true, ownerId: true, fileName: true },
    });
    if (expired.length === 0) {
      return;
    }

    await this.prisma.$transaction([
      ...expired.map((document) =>
        this.prisma.documentEvent.create({
          data: {
            documentId: document.id,
            type: DocumentEventType.EXPIRED,
            actorId: null,
            metadata: { expiredAt: now.toISOString() },
          },
        }),
      ),
      this.prisma.document.updateMany({
        where: { id: { in: expired.map((document) => document.id) } },
        data: { status: DocumentStatus.EXPIRED },
      }),
    ]);

    for (const document of expired) {
      const created = await this.notifications.createForUser(document.ownerId, {
        type: 'DOCUMENT_EXPIRED',
        title: 'Document expiré',
        body: 'Un de vos documents a expiré. Veuillez en déposer un nouveau.',
        entityId: document.id,
        route: '/pro/documents',
      });
      await this.notifications.enqueue(created.outboxIds);
    }
  }

  private async createReminders(): Promise<void> {
    const thresholds = this.thresholds();
    if (thresholds.length === 0) {
      return;
    }
    const maxDays = Math.max(...thresholds);
    const now = new Date();
    const horizon = new Date(now.getTime() + maxDays * 24 * 60 * 60 * 1000);
    const documents = await this.prisma.document.findMany({
      where: {
        expiresAt: { gt: now, lte: horizon },
        status: { not: DocumentStatus.EXPIRED },
      },
      select: { id: true, ownerId: true, fileName: true, expiresAt: true },
    });
    const adminIds = await this.adminIds();

    for (const document of documents) {
      if (!document.expiresAt) {
        continue;
      }
      for (const thresholdDays of thresholds) {
        const scheduledFor = new Date(
          document.expiresAt.getTime() - thresholdDays * 24 * 60 * 60 * 1000,
        );
        if (scheduledFor.getTime() > now.getTime()) {
          continue;
        }
        const existing = await this.prisma.documentReminder.findUnique({
          where: {
            documentId_thresholdDays: {
              documentId: document.id,
              thresholdDays,
            },
          },
        });
        if (existing) {
          continue;
        }
        const reminder = await this.prisma.documentReminder.create({
          data: { documentId: document.id, thresholdDays, scheduledFor },
        });
        await this.queue.enqueueReminder(reminder.id);

        const created = await this.notifications.createForUser(document.ownerId, {
          type: thresholdDays === 0 ? 'DOCUMENT_EXPIRED' : 'DOCUMENT_EXPIRING',
          title: thresholdDays === 0 ? 'Document expiré' : 'Document bientôt expiré',
          body: `Votre document expire dans ${thresholdDays} jour(s).`,
          entityId: document.id,
          route: '/pro/documents',
        });
        await this.notifications.enqueue(created.outboxIds);

        if (thresholdDays === 7 || thresholdDays === 0) {
          for (const adminId of adminIds) {
            const alert = await this.notifications.createForUser(adminId, {
              type: 'ADMIN_DOCUMENT_EXPIRING',
              title: 'Alerte expiration documentaire',
              body: `Le document ${document.fileName} arrive à expiration.`,
              entityId: document.id,
              route: '/admin/verifications',
            });
            await this.notifications.enqueue(alert.outboxIds);
          }
        }
      }
    }
  }

  private async adminIds(): Promise<string[]> {
    const role = await this.prisma.role.findUnique({ where: { code: RoleCode.ADMIN } });
    if (!role) {
      return [];
    }
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId: role.id },
      select: { userId: true },
    });
    return userRoles.map((userRole) => userRole.userId);
  }
}
