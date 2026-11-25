import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ConversationPageDto,
  ConversationResponseDto,
  MessagePageDto,
  MessageResponseDto,
  SendMessageDto,
} from './dto/messaging.dto';

type ParticipantConversation = Prisma.ConversationGetPayload<{
  include: { mission: { include: { professionalProfile: { select: { userId: true } } } } };
}>;

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listConversations(user: AuthUser): Promise<ConversationPageDto> {
    const data = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId: user.id } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 50,
    });
    return {
      data: data.map((conversation) => this.toConversation(conversation)),
      nextCursor: null,
    };
  }

  async listMessages(
    user: AuthUser,
    conversationId: string,
    after?: string,
    limit = 50,
  ): Promise<MessagePageDto> {
    await this.assertParticipant(user, conversationId);
    const afterId = this.parseMessageId(after);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(afterId !== null ? { id: { gt: afterId } } : {}),
      },
      orderBy: { id: 'asc' },
      take: Math.min(Math.max(limit, 1), 100) + 1,
    });
    const hasMore = rows.length > Math.min(Math.max(limit, 1), 100);
    const page = hasMore ? rows.slice(0, Math.min(Math.max(limit, 1), 100)) : rows;
    return {
      data: page.map((message) => this.toMessage(message)),
      nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
    };
  }

  async sendMessage(
    user: AuthUser,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<MessageResponseDto> {
    const conversation = await this.assertParticipant(user, conversationId);
    const recipientId =
      conversation.mission.clientId === user.id
        ? conversation.mission.professionalProfile.userId
        : conversation.mission.clientId;

    const { message, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: { conversationId, senderId: user.id, body: dto.body },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        data: { lastReadMessageId: created.id, lastReadAt: created.createdAt },
      });
      const notification = await this.notifications.createForUser(
        recipientId,
        {
          type: NotificationType.MESSAGE_RECEIVED,
          title: 'Nouveau message',
          body: dto.body.slice(0, 200),
          entityId: conversationId,
          route: `/conversations/${conversationId}`,
        },
        tx,
      );
      return { message: created, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toMessage(message);
  }

  async markRead(
    user: AuthUser,
    conversationId: string,
    messageId: string,
  ): Promise<{ read: true }> {
    await this.assertParticipant(user, conversationId);
    const id = this.parseMessageId(messageId);
    if (id === null) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Identifiant de message invalide.');
    }
    const message = await this.prisma.message.findFirst({
      where: { id, conversationId, deletedAt: null },
      select: { id: true },
    });
    if (!message) {
      throw new ApiError(ERROR_CODES.MESSAGE_NOT_FOUND, 404, 'Message introuvable.');
    }
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: user.id } },
      data: { lastReadMessageId: id, lastReadAt: new Date() },
    });
    return { read: true };
  }

  async deleteMessage(user: AuthUser, messageId: string): Promise<{ deleted: true }> {
    const id = this.parseMessageId(messageId);
    if (id === null) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Identifiant de message invalide.');
    }
    const message = await this.prisma.message.findUnique({ where: { id } });
    if (!message || message.deletedAt) {
      throw new ApiError(ERROR_CODES.MESSAGE_NOT_FOUND, 404, 'Message introuvable.');
    }
    if (message.senderId !== user.id) {
      throw new ApiError(ERROR_CODES.MESSAGE_NOT_OWNED, 403, 'Message non accessible.');
    }
    await this.assertParticipant(user, message.conversationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.message.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MESSAGE.SOFT_DELETED',
          targetType: 'Message',
          targetId: id.toString(),
        },
        tx,
      );
    });
    return { deleted: true };
  }

  async assertParticipant(
    user: AuthUser,
    conversationId: string,
  ): Promise<ParticipantConversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        mission: { include: { professionalProfile: { select: { userId: true } } } },
      },
    });
    if (!conversation) {
      throw new ApiError(ERROR_CODES.CONVERSATION_NOT_FOUND, 404, 'Conversation introuvable.');
    }
    const member = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: user.id } },
    });
    if (
      !member ||
      (conversation.mission.clientId !== user.id &&
        conversation.mission.professionalProfile.userId !== user.id)
    ) {
      throw new ApiError(
        ERROR_CODES.CONVERSATION_NOT_PARTICIPANT,
        403,
        'Conversation non accessible.',
      );
    }
    return conversation;
  }

  private parseMessageId(value?: string): bigint | null {
    if (!value) {
      return null;
    }
    try {
      return BigInt(value);
    } catch {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de message invalide.');
    }
  }

  private toMessage(message: Prisma.MessageGetPayload<object>): MessageResponseDto {
    return {
      id: message.id.toString(),
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: message.body,
      deletedAt: message.deletedAt,
      createdAt: message.createdAt,
    };
  }

  private toConversation(
    conversation: Prisma.ConversationGetPayload<object>,
  ): ConversationResponseDto {
    return {
      id: conversation.id,
      missionId: conversation.missionId,
      lastMessageAt: conversation.lastMessageAt,
    };
  }
}
