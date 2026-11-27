import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MissionEventType,
  MissionStatus,
  NotificationType,
  Prisma,
  QuoteStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { MissionsService } from '../missions/missions.service';
import { assertMissionTransition } from '../missions/mission-status';
import { NotificationsService } from '../notifications/notifications.service';
import { LedgerService } from '../payments/ledger.service';
import { TrustService } from '../trust/trust.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthorizeEmergencyDto,
  ChecklistItemDto,
  CreateMissionEventDto,
  CreateMissionPositionDto,
  CreateQuoteDto,
  CreateServiceReportDto,
  MissionEventResponseDto,
  MissionStatusUpdateDto,
  PositionAckDto,
  QuotePageDto,
  QuoteResponseDto,
  ServiceReportResponseDto,
} from './dto/closure.dto';

const ACTIVE_MISSION_STATUSES: MissionStatus[] = [
  MissionStatus.ACCEPTED,
  MissionStatus.CODE_VERIFIED,
  MissionStatus.PENDING_QUOTE,
  MissionStatus.WORK_AUTHORIZED,
];

const QUOTE_EDITABLE_STATUSES: MissionStatus[] = [
  MissionStatus.CODE_VERIFIED,
  MissionStatus.PENDING_QUOTE,
];

@Injectable()
export class ClosureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly missions: MissionsService,
    private readonly config: ConfigService,
    private readonly ledger: LedgerService,
    private readonly trust: TrustService,
  ) {}

  async createQuote(
    user: AuthUser,
    missionId: string,
    dto: CreateQuoteDto,
  ): Promise<QuoteResponseDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertProfessional(mission.professionalProfile.userId, user);
    if (!QUOTE_EDITABLE_STATUSES.includes(mission.status)) {
      throw new ApiError(
        ERROR_CODES.MISSION_INVALID_TRANSITION,
        409,
        'Cette mission n’accepte plus de devis.',
      );
    }
    const accepted = await this.prisma.quote.findFirst({
      where: { missionId, status: QuoteStatus.ACCEPTED },
    });
    if (accepted) {
      throw new ApiError(ERROR_CODES.QUOTE_SUPERSEDED, 409, 'Un devis est déjà accepté.');
    }
    const validUntil = new Date(dto.validUntil);
    if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= Date.now()) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Date d’expiration invalide.');
    }
    const aggregate = await this.prisma.quote.aggregate({
      where: { missionId },
      _max: { version: true },
    });
    const version = (aggregate._max.version ?? 0) + 1;
    const totalCents = dto.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCents,
      0,
    );

    const { quote, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.quote.create({
        data: {
          missionId,
          version,
          status: QuoteStatus.SUBMITTED,
          validUntil,
          totalCents,
          currency: 'XOF',
          notes: dto.notes ?? null,
          lines: {
            create: dto.lines.map((line, index) => ({
              label: line.label,
              quantity: line.quantity,
              unitPriceCents: line.unitPriceCents,
              sortOrder: index,
            })),
          },
        },
        include: { lines: true },
      });
      await tx.mission.update({
        where: { id: missionId },
        data: { status: MissionStatus.PENDING_QUOTE },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'QUOTE.SUBMITTED',
          targetType: 'Quote',
          targetId: created.id,
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        mission.clientId,
        {
          type: NotificationType.QUOTE_SUBMITTED,
          title: 'Devis reçu',
          body: `Devis version ${version} en attente de validation.`,
          entityId: created.id,
          route: `/missions/${missionId}/quotes`,
        },
        tx,
      );
      return { quote: created, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toQuote(quote);
  }

  async listQuotes(user: AuthUser, missionId: string): Promise<QuotePageDto> {
    await this.missions.getMissionForParticipant(user, missionId);
    const data = await this.prisma.quote.findMany({
      where: { missionId },
      include: { lines: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    return { data: data.map((quote) => this.toQuote(quote)), nextCursor: null };
  }

  async acceptQuote(user: AuthUser, quoteId: string): Promise<MissionStatusUpdateDto> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { mission: true },
    });
    if (!quote) {
      throw new ApiError(ERROR_CODES.QUOTE_NOT_FOUND, 404, 'Devis introuvable.');
    }
    this.assertClient(quote.mission.clientId, user);
    if (quote.status !== QuoteStatus.SUBMITTED) {
      throw new ApiError(ERROR_CODES.QUOTE_NOT_SUBMITTED, 409, 'Devis non soumis.');
    }
    if (quote.validUntil.getTime() <= Date.now()) {
      await this.prisma.quote.update({
        where: { id: quoteId },
        data: { status: QuoteStatus.EXPIRED },
      });
      throw new ApiError(ERROR_CODES.QUOTE_EXPIRED, 400, 'Devis expiré.');
    }
    const accepted = await this.prisma.quote.findFirst({
      where: { missionId: quote.missionId, status: QuoteStatus.ACCEPTED },
    });
    if (accepted) {
      throw new ApiError(ERROR_CODES.QUOTE_SUPERSEDED, 409, 'Un devis est déjà accepté.');
    }
    assertMissionTransition(quote.mission.status, MissionStatus.WORK_AUTHORIZED);

    const { mission, outboxIds } = await this.prisma.$transaction(async (tx) => {
      await tx.quote.updateMany({
        where: {
          missionId: quote.missionId,
          id: { not: quoteId },
          status: QuoteStatus.SUBMITTED,
        },
        data: { status: QuoteStatus.SUPERSEDED },
      });
      await tx.quote.update({
        where: { id: quoteId },
        data: { status: QuoteStatus.ACCEPTED },
      });
      const updated = await tx.mission.update({
        where: { id: quote.missionId },
        data: { status: MissionStatus.WORK_AUTHORIZED },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'QUOTE.ACCEPTED',
          targetType: 'Quote',
          targetId: quoteId,
        },
        tx,
      );
      const professional = await tx.professionalProfile.findUnique({
        where: { id: updated.professionalProfileId },
        select: { userId: true },
      });
      const notification = await this.notifications.createForUser(
        professional!.userId,
        {
          type: NotificationType.QUOTE_ACCEPTED,
          title: 'Devis accepté',
          body: `Le devis version ${quote.version} a été accepté.`,
          entityId: quoteId,
          route: `/missions/${quote.missionId}`,
        },
        tx,
      );
      return { mission: updated, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return { id: mission.id, status: mission.status };
  }

  async rejectQuote(user: AuthUser, quoteId: string): Promise<MissionStatusUpdateDto> {
    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      include: { mission: true },
    });
    if (!quote) {
      throw new ApiError(ERROR_CODES.QUOTE_NOT_FOUND, 404, 'Devis introuvable.');
    }
    this.assertClient(quote.mission.clientId, user);
    if (quote.status !== QuoteStatus.SUBMITTED) {
      throw new ApiError(ERROR_CODES.QUOTE_NOT_SUBMITTED, 409, 'Devis non soumis.');
    }

    const { mission, outboxIds } = await this.prisma.$transaction(async (tx) => {
      await tx.quote.update({ where: { id: quoteId }, data: { status: QuoteStatus.REJECTED } });
      let updated = quote.mission;
      if (quote.mission.status === MissionStatus.CODE_VERIFIED) {
        assertMissionTransition(quote.mission.status, MissionStatus.PENDING_QUOTE);
        updated = await tx.mission.update({
          where: { id: quote.missionId },
          data: { status: MissionStatus.PENDING_QUOTE },
        });
      }
      await this.audit.write(
        {
          actorId: user.id,
          action: 'QUOTE.REJECTED',
          targetType: 'Quote',
          targetId: quoteId,
        },
        tx,
      );
      const professional = await tx.professionalProfile.findUnique({
        where: { id: updated.professionalProfileId },
        select: { userId: true },
      });
      const notification = await this.notifications.createForUser(
        professional!.userId,
        {
          type: NotificationType.QUOTE_REJECTED,
          title: 'Devis refusé',
          body: `Le devis version ${quote.version} a été refusé.`,
          entityId: quoteId,
          route: `/missions/${quote.missionId}/quotes`,
        },
        tx,
      );
      return { mission: updated, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return { id: mission.id, status: mission.status };
  }

  async authorizeEmergency(
    user: AuthUser,
    missionId: string,
    dto: AuthorizeEmergencyDto,
  ): Promise<MissionStatusUpdateDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertClient(mission.clientId, user);
    assertMissionTransition(mission.status, MissionStatus.WORK_AUTHORIZED);

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.mission.update({
        where: { id: missionId },
        data: { status: MissionStatus.WORK_AUTHORIZED },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.WORK_AUTHORIZED',
          targetType: 'Mission',
          targetId: missionId,
          after: { reason: dto.reason },
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        mission.professionalProfile.userId,
        {
          type: NotificationType.WORK_AUTHORIZED,
          title: 'Travaux autorisés',
          body: dto.reason,
          entityId: missionId,
          route: `/missions/${missionId}`,
        },
        tx,
      );
      return { updated: result, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return { id: updated.id, status: updated.status };
  }

  async createEvent(
    user: AuthUser,
    missionId: string,
    dto: CreateMissionEventDto,
  ): Promise<MissionEventResponseDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertProfessional(mission.professionalProfile.userId, user);
    if (dto.type !== MissionEventType.DEPARTED && dto.type !== MissionEventType.ARRIVED) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Type d’événement interdit.');
    }
    if (!ACTIVE_MISSION_STATUSES.includes(mission.status)) {
      throw new ApiError(ERROR_CODES.MISSION_INVALID_TRANSITION, 409, 'Mission inactive.');
    }
    const event = await this.prisma.missionEvent.create({
      data: { missionId, type: dto.type, actorId: user.id },
    });
    return { id: event.id.toString(), type: event.type, createdAt: event.createdAt };
  }

  async createPosition(
    user: AuthUser,
    missionId: string,
    dto: CreateMissionPositionDto,
  ): Promise<PositionAckDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertProfessional(mission.professionalProfile.userId, user);
    if (!ACTIVE_MISSION_STATUSES.includes(mission.status)) {
      throw new ApiError(ERROR_CODES.POSITION_NOT_ALLOWED, 409, 'Suivi de position indisponible.');
    }
    const intervalSeconds = this.config.get<number>('MISSION_POSITION_INTERVAL_SECONDS', 30);
    const last = await this.prisma.missionPosition.findFirst({
      where: { missionId },
      orderBy: { recordedAt: 'desc' },
    });
    const now = Date.now();
    if (last && now - last.recordedAt.getTime() < intervalSeconds * 1000) {
      throw new ApiError(
        ERROR_CODES.POSITION_TOO_SOON,
        429,
        `Positions espacées d’au moins ${intervalSeconds} secondes.`,
      );
    }
    await this.prisma.missionPosition.create({
      data: {
        missionId,
        lat: this.roundPosition(dto.lat),
        lng: this.roundPosition(dto.lng),
        accuracyMeters: dto.accuracyMeters ?? null,
        recordedAt: new Date(now),
      },
    });
    return { stored: true, precisionDigits: 3 };
  }

  async createReport(
    user: AuthUser,
    missionId: string,
    dto: CreateServiceReportDto,
  ): Promise<ServiceReportResponseDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertProfessional(mission.professionalProfile.userId, user);
    if (mission.status !== MissionStatus.WORK_AUTHORIZED) {
      throw new ApiError(
        ERROR_CODES.MISSION_INVALID_TRANSITION,
        409,
        'La Mission doit être autorisée avant le rapport.',
      );
    }
    const existing = await this.prisma.serviceReport.findUnique({ where: { missionId } });
    if (existing) {
      throw new ApiError(ERROR_CODES.MISSION_ALREADY_COMPLETED, 409, 'Rapport déjà déposé.');
    }
    if (dto.checklist.some((item) => item.critical && !item.passed)) {
      throw new ApiError(
        ERROR_CODES.CHECKLIST_CRITICAL_FAILED,
        400,
        'Un point critique de la checklist a échoué.',
      );
    }
    assertMissionTransition(mission.status, MissionStatus.COMPLETED);

    const { report, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.serviceReport.create({
        data: {
          missionId,
          authorId: user.id,
          summary: dto.summary,
          checklist: dto.checklist as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.mission.update({
        where: { id: missionId },
        data: { status: MissionStatus.COMPLETED },
      });
      await tx.missionEvent.create({
        data: { missionId, type: MissionEventType.COMPLETED, actorId: user.id },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.REPORT_SUBMITTED',
          targetType: 'ServiceReport',
          targetId: created.id,
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        mission.clientId,
        {
          type: NotificationType.REPORT_READY,
          title: 'Rapport disponible',
          body: 'Le professionnel a déposé son rapport d’intervention.',
          entityId: created.id,
          route: `/missions/${missionId}/report`,
        },
        tx,
      );
      return { report: created, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toReport(report);
  }

  async getReport(user: AuthUser, missionId: string): Promise<ServiceReportResponseDto> {
    await this.missions.getMissionForParticipant(user, missionId);
    const report = await this.prisma.serviceReport.findUnique({ where: { missionId } });
    if (!report) {
      throw new ApiError(ERROR_CODES.REPORT_NOT_FOUND, 404, 'Rapport introuvable.');
    }
    return this.toReport(report);
  }

  async closeMission(user: AuthUser, missionId: string): Promise<MissionStatusUpdateDto> {
    const mission = await this.missions.getMissionForParticipant(user, missionId);
    this.assertClient(mission.clientId, user);
    if (mission.status !== MissionStatus.COMPLETED) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_COMPLETED, 409, 'Mission non terminée.');
    }
    const report = await this.prisma.serviceReport.findUnique({ where: { missionId } });
    if (!report) {
      throw new ApiError(ERROR_CODES.REPORT_INCOMPLETE, 409, 'Rapport manquant.');
    }
    assertMissionTransition(mission.status, MissionStatus.CLOSED);

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      await this.ledger.recordMissionCommission(user, missionId, tx);
      const guaranteeOutboxIds = await this.trust.recordMissionClosed(missionId, tx);
      const result = await tx.mission.update({
        where: { id: missionId },
        data: { status: MissionStatus.CLOSED },
      });
      await tx.missionEvent.create({
        data: { missionId, type: MissionEventType.CLOSED, actorId: user.id },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.CLOSED',
          targetType: 'Mission',
          targetId: missionId,
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        mission.professionalProfile.userId,
        {
          type: NotificationType.MISSION_CLOSED,
          title: 'Mission clôturée',
          body: 'Le client a clôturé la mission.',
          entityId: missionId,
          route: `/missions/${missionId}`,
        },
        tx,
      );
      return {
        updated: result,
        outboxIds: [...notification.outboxIds, ...guaranteeOutboxIds],
      };
    });
    await this.notifications.enqueue(outboxIds);
    return { id: updated.id, status: updated.status };
  }

  private assertClient(clientId: string, user: AuthUser): void {
    if (clientId !== user.id) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_OWNED, 403, 'Réservé au client.');
    }
  }

  private assertProfessional(professionalUserId: string, user: AuthUser): void {
    if (professionalUserId !== user.id) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_PARTICIPANT, 403, 'Réservé au professionnel.');
    }
  }

  private roundPosition(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private toQuote(quote: Prisma.QuoteGetPayload<{ include: { lines: true } }>): QuoteResponseDto {
    return {
      id: quote.id,
      missionId: quote.missionId,
      version: quote.version,
      status: quote.status,
      validUntil: quote.validUntil,
      totalCents: quote.totalCents,
      currency: quote.currency,
      notes: quote.notes,
      lines: quote.lines.map((line) => ({
        id: line.id,
        label: line.label,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        sortOrder: line.sortOrder,
      })),
      createdAt: quote.createdAt,
    };
  }

  private toReport(report: Prisma.ServiceReportGetPayload<object>): ServiceReportResponseDto {
    return {
      id: report.id,
      missionId: report.missionId,
      summary: report.summary,
      checklist: report.checklist as unknown as ChecklistItemDto[],
      createdAt: report.createdAt,
    };
  }
}
