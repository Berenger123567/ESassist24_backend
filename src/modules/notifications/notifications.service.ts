import { Injectable } from '@nestjs/common';
import { Notification, NotificationStatus, NotificationType, Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { NotificationPageDto, NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationQueueService } from './notification.queue';

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string | null;
  route?: string | null;
  data?: Record<string, unknown> | null;
}

export interface CreatedNotification {
  id: string;
  outboxIds: string[];
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: NotificationQueueService,
  ) {}

  async createForUser(
    userId: string,
    input: CreateNotificationInput,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<CreatedNotification> {
    const notification = await client.notification.create({
      data: {
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body.slice(0, 1000),
        entityId: input.entityId ?? null,
        route: input.route ?? null,
        data: input.data ? (input.data as Prisma.InputJsonValue) : Prisma.JsonNull,
      },
    });

    const devices = await client.device.findMany({
      where: { userId, revokedAt: null, notificationsEnabled: true },
    });
    const outboxIds: string[] = [];
    for (const device of devices) {
      const outbox = await client.notificationOutbox.create({
        data: {
          notificationId: notification.id,
          deviceId: device.deviceId,
          channel: device.pushProvider,
          payload: {
            title: notification.title,
            body: notification.body,
            type: notification.type,
            entityId: notification.entityId,
            route: notification.route,
          } as Prisma.InputJsonValue,
        },
      });
      outboxIds.push(outbox.id);
    }

    return { id: notification.id, outboxIds };
  }

  async enqueue(outboxIds: string[]): Promise<void> {
    for (const outboxId of outboxIds) {
      await this.queue.enqueueNotification(outboxId);
    }
  }

  async list(userId: string, query: NotificationQueryDto): Promise<NotificationPageDto> {
    const where: Prisma.NotificationWhereInput = { userId };
    if (query.unreadOnly) {
      where.status = { not: NotificationStatus.READ };
    }
    if (query.cursor) {
      const cursorDate = new Date(query.cursor);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de notification invalide.');
      }
      where.createdAt = { lt: cursorDate };
    }

    const limit = query.limit ?? 50;
    const notifications = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = notifications.length > limit;
    const page = hasMore ? notifications.slice(0, limit) : notifications;
    return {
      data: page.map((notification) => this.toResponse(notification)),
      nextCursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  async markRead(userId: string, id: string): Promise<NotificationResponseDto> {
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Notification introuvable.');
    }
    const updated = await this.prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });
    return this.toResponse(updated);
  }

  private toResponse(notification: Notification): NotificationResponseDto {
    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      entityId: notification.entityId,
      route: notification.route,
      status: notification.status,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    };
  }
}
