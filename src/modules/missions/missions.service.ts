import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MissionEventType,
  MissionStatus,
  Prisma,
  ProfessionalStatus,
  ProposalStatus,
  RoleCode,
  ServiceRequestStatus,
  UserStatus,
} from '@prisma/client';
import { hash as hashSecret, verify as verifySecret } from '@node-rs/argon2';
import { randomInt } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ArrivalCodeResponseDto,
  CreateProposalDto,
  MissionPageDto,
  MissionResponseDto,
  ProposalPageDto,
  ProposalResponseDto,
  ReassignMissionDto,
} from './dto/mission.dto';
const ELIGIBLE_PROFESSIONAL_STATUSES: ProfessionalStatus[] = [
  ProfessionalStatus.VERIFIED,
  ProfessionalStatus.CERTIFIED,
];

const TERMINAL_MISSION_STATUSES: MissionStatus[] = [
  MissionStatus.COMPLETED,
  MissionStatus.CLOSED,
  MissionStatus.CANCELLED,
];

type MissionRecord = Prisma.MissionGetPayload<object>;

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async createProposal(
    user: AuthUser,
    requestId: string,
    dto: CreateProposalDto,
  ): Promise<ProposalResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId: user.id },
      include: { user: { select: { status: true } } },
    });
    if (
      !profile ||
      profile.user.status !== UserStatus.ACTIVE ||
      !ELIGIBLE_PROFESSIONAL_STATUSES.includes(profile.status)
    ) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_NOT_ELIGIBLE,
        403,
        'Profil professionnel non éligible.',
      );
    }

    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_FOUND, 404, 'Demande introuvable.');
    }
    if (request.status !== ServiceRequestStatus.OPEN) {
      throw new ApiError(
        ERROR_CODES.PROPOSAL_REQUEST_CLOSED,
        409,
        'Cette demande n’accepte plus de propositions.',
      );
    }

    try {
      const { proposal, outboxIds } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.serviceProposal.create({
          data: {
            requestId,
            professionalProfileId: profile.id,
            message: dto.message,
          },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: 'SERVICE_PROPOSAL.CREATED',
            targetType: 'ServiceProposal',
            targetId: created.id,
          },
          tx,
        );
        const notification = await this.notifications.createForUser(
          request.clientId,
          {
            type: 'PROPOSAL_RECEIVED',
            title: 'Nouvelle proposition',
            body: 'Un professionnel vérifié a répondu à votre demande.',
            entityId: created.id,
            route: `/service-requests/${requestId}/proposals`,
          },
          tx,
        );
        return { proposal: created, outboxIds: notification.outboxIds };
      });
      await this.notifications.enqueue(outboxIds);
      return proposal;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          ERROR_CODES.PROPOSAL_ALREADY_EXISTS,
          409,
          'Vous avez déjà proposé vos services sur cette demande.',
        );
      }
      throw error;
    }
  }

  async listProposals(user: AuthUser, requestId: string): Promise<ProposalPageDto> {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!request) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_FOUND, 404, 'Demande introuvable.');
    }
    if (request.clientId !== user.id && !user.roles.includes(RoleCode.ADMIN)) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_OWNED, 403, 'Demande non accessible.');
    }
    const data = await this.prisma.serviceProposal.findMany({
      where: { requestId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: data.map((proposal) => proposal), nextCursor: null };
  }

  async acceptProposal(user: AuthUser, proposalId: string): Promise<MissionResponseDto> {
    const proposal = await this.prisma.serviceProposal.findUnique({
      where: { id: proposalId },
      include: {
        request: true,
        professionalProfile: { include: { user: { select: { id: true } } } },
      },
    });
    if (!proposal) {
      throw new ApiError(ERROR_CODES.PROPOSAL_NOT_FOUND, 404, 'Proposition introuvable.');
    }
    if (proposal.request.clientId !== user.id) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_OWNED, 403, 'Demande non accessible.');
    }
    if (proposal.request.status !== ServiceRequestStatus.OPEN) {
      throw new ApiError(ERROR_CODES.PROPOSAL_REQUEST_CLOSED, 409, 'Demande déjà traitée.');
    }
    if (proposal.status !== ProposalStatus.PENDING) {
      throw new ApiError(ERROR_CODES.INVALID_STATUS_TRANSITION, 409, 'Proposition déjà traitée.');
    }

    const { mission, outboxIds } = await this.prisma.$transaction(async (tx) => {
      await tx.serviceProposal.updateMany({
        where: { requestId: proposal.requestId, id: { not: proposalId } },
        data: { status: ProposalStatus.REJECTED },
      });
      await tx.serviceProposal.update({
        where: { id: proposalId },
        data: { status: ProposalStatus.ACCEPTED },
      });
      await tx.serviceRequest.update({
        where: { id: proposal.requestId },
        data: { status: ServiceRequestStatus.MATCHED },
      });
      const created = await tx.mission.create({
        data: {
          requestId: proposal.requestId,
          proposalId,
          clientId: proposal.request.clientId,
          professionalProfileId: proposal.professionalProfileId,
          status: MissionStatus.ACCEPTED,
          conversation: {
            create: {
              participants: {
                create: [
                  { userId: proposal.request.clientId },
                  { userId: proposal.professionalProfile.user.id },
                ],
              },
            },
          },
          events: {
            create: [
              { type: MissionEventType.CREATED, actorId: user.id },
              { type: MissionEventType.ACCEPTED, actorId: user.id },
            ],
          },
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.CREATED',
          targetType: 'Mission',
          targetId: created.id,
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        proposal.professionalProfile.user.id,
        {
          type: 'MISSION_CREATED',
          title: 'Mission acceptée',
          body: 'Le client a accepté votre proposition.',
          entityId: created.id,
          route: `/missions/${created.id}`,
        },
        tx,
      );
      return { mission: created, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toMission(mission);
  }

  async listMissions(user: AuthUser): Promise<MissionPageDto> {
    const data = await this.prisma.mission.findMany({
      where: {
        OR: [{ clientId: user.id }, { professionalProfile: { userId: user.id } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { data: data.map((mission) => this.toMission(mission)), nextCursor: null };
  }

  async getMission(user: AuthUser, id: string): Promise<MissionResponseDto> {
    const mission = await this.getParticipantMission(user, id);
    return this.toMission(mission);
  }

  async generateArrivalCode(user: AuthUser, missionId: string): Promise<ArrivalCodeResponseDto> {
    const mission = await this.getParticipantMission(user, missionId);
    if (mission.professionalProfile.userId !== user.id) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_PARTICIPANT, 403, 'Réservé au professionnel.');
    }
    if (mission.status !== MissionStatus.ACCEPTED) {
      throw new ApiError(
        ERROR_CODES.ARRIVAL_CODE_NOT_READY,
        409,
        'Le code d’arrivée ne peut plus être généré.',
      );
    }

    const ttlSeconds = this.config.get<number>('ARRIVAL_CODE_TTL_SECONDS', 600);
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashSecret(code);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.prisma.$transaction(async (tx) => {
      await tx.mission.update({
        where: { id: missionId },
        data: {
          arrivalCodeHash: codeHash,
          arrivalCodeExpiresAt: expiresAt,
          arrivalCodeAttempts: 0,
          arrivalCodeUsedAt: null,
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.ARRIVAL_CODE_GENERATED',
          targetType: 'Mission',
          targetId: missionId,
        },
        tx,
      );
    });

    const notification = await this.notifications.createForUser(mission.clientId, {
      type: 'ARRIVAL_CODE_READY',
      title: 'Code d’arrivée',
      body: `Votre professionnel vous a envoyé le code ${code}.`,
      entityId: missionId,
      route: `/missions/${missionId}/arrival-code`,
    });
    await this.notifications.enqueue(notification.outboxIds);

    return { missionId, code, expiresInSeconds: ttlSeconds };
  }

  async verifyArrivalCode(
    user: AuthUser,
    missionId: string,
    code: string,
  ): Promise<MissionResponseDto> {
    const mission = await this.getParticipantMission(user, missionId);
    if (mission.clientId !== user.id) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_PARTICIPANT, 403, 'Réservé au client.');
    }
    if (mission.status !== MissionStatus.ACCEPTED) {
      throw new ApiError(ERROR_CODES.MISSION_INVALID_TRANSITION, 409, 'Mission déjà vérifiée.');
    }
    if (!mission.arrivalCodeHash || !mission.arrivalCodeExpiresAt) {
      throw new ApiError(ERROR_CODES.ARRIVAL_CODE_NOT_READY, 409, 'Aucun code en attente.');
    }
    if (mission.arrivalCodeUsedAt) {
      throw new ApiError(ERROR_CODES.ARRIVAL_CODE_ALREADY_USED, 409, 'Code déjà utilisé.');
    }
    if (mission.arrivalCodeExpiresAt.getTime() <= Date.now()) {
      throw new ApiError(ERROR_CODES.ARRIVAL_CODE_EXPIRED, 400, 'Code d’arrivée expiré.');
    }
    const maxAttempts = this.config.get<number>('ARRIVAL_CODE_MAX_ATTEMPTS', 3);
    if (mission.arrivalCodeAttempts >= maxAttempts) {
      throw new ApiError(ERROR_CODES.ARRIVAL_CODE_MAX_ATTEMPTS, 429, 'Trop de tentatives.');
    }

    let valid = false;
    try {
      valid = await verifySecret(mission.arrivalCodeHash, code);
    } catch {
      valid = false;
    }
    if (!valid) {
      await this.prisma.mission.update({
        where: { id: missionId },
        data: { arrivalCodeAttempts: { increment: 1 } },
      });
      throw new ApiError(ERROR_CODES.ARRIVAL_CODE_INVALID, 400, 'Code d’arrivée invalide.');
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.mission.update({
        where: { id: missionId },
        data: {
          status: MissionStatus.CODE_VERIFIED,
          arrivalCodeUsedAt: new Date(),
        },
      });
      await tx.missionEvent.create({
        data: { missionId, type: MissionEventType.CODE_VERIFIED, actorId: user.id },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.ARRIVAL_CODE_VERIFIED',
          targetType: 'Mission',
          targetId: missionId,
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        mission.professionalProfile.userId,
        {
          type: 'ARRIVAL_CODE_VERIFIED',
          title: 'Code vérifié',
          body: 'Le client a validé votre arrivée.',
          entityId: missionId,
          route: `/missions/${missionId}`,
        },
        tx,
      );
      return { updated: result, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toMission(updated);
  }

  async reassign(
    user: AuthUser,
    missionId: string,
    dto: ReassignMissionDto,
  ): Promise<MissionResponseDto> {
    if (!user.roles.includes(RoleCode.ADMIN)) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Droits insuffisants.');
    }
    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: {
        professionalProfile: { include: { user: { select: { id: true } } } },
        conversation: true,
      },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_FOUND, 404, 'Mission introuvable.');
    }
    if (TERMINAL_MISSION_STATUSES.includes(mission.status)) {
      throw new ApiError(
        ERROR_CODES.MISSION_INVALID_TRANSITION,
        409,
        'Cette mission ne peut plus être réassignée.',
      );
    }

    const nextProfile = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.professionalProfileId },
      include: { user: { select: { id: true, status: true } } },
    });
    if (
      !nextProfile ||
      nextProfile.user.status !== UserStatus.ACTIVE ||
      !ELIGIBLE_PROFESSIONAL_STATUSES.includes(nextProfile.status)
    ) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_NOT_ELIGIBLE,
        422,
        'Nouveau professionnel non éligible.',
      );
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.mission.update({
        where: { id: missionId },
        data: {
          professionalProfileId: nextProfile.id,
          previousProfessionalId: mission.professionalProfileId,
        },
      });
      await tx.missionEvent.create({
        data: {
          missionId,
          type: MissionEventType.REASSIGNED,
          actorId: user.id,
          metadata: { reason: dto.reason } as Prisma.InputJsonValue,
        },
      });
      if (mission.conversation) {
        await tx.conversationParticipant.deleteMany({
          where: {
            conversationId: mission.conversation.id,
            userId: mission.professionalProfile.user.id,
          },
        });
        await tx.conversationParticipant.upsert({
          where: {
            conversationId_userId: {
              conversationId: mission.conversation.id,
              userId: nextProfile.user.id,
            },
          },
          update: {},
          create: {
            conversationId: mission.conversation.id,
            userId: nextProfile.user.id,
          },
        });
      }
      await this.audit.write(
        {
          actorId: user.id,
          action: 'MISSION.PROFESSIONAL_REASSIGNED',
          targetType: 'Mission',
          targetId: missionId,
          after: {
            previousProfessionalId: mission.professionalProfileId,
            professionalProfileId: nextProfile.id,
            reason: dto.reason,
          },
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        nextProfile.user.id,
        {
          type: 'PROFESSIONAL_REASSIGNED',
          title: 'Mission reassigned',
          body: dto.reason,
          entityId: missionId,
          route: `/missions/${missionId}`,
        },
        tx,
      );
      return { updated: result, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toMission(updated);
  }

  async getMissionForParticipant(
    user: AuthUser,
    id: string,
  ): Promise<
    MissionRecord & {
      professionalProfile: { userId: string };
    }
  > {
    return this.getParticipantMission(user, id);
  }

  private async getParticipantMission(
    user: AuthUser,
    id: string,
  ): Promise<
    MissionRecord & {
      professionalProfile: { userId: string };
    }
  > {
    const mission = await this.prisma.mission.findUnique({
      where: { id },
      include: { professionalProfile: { select: { userId: true } } },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_FOUND, 404, 'Mission introuvable.');
    }
    if (mission.clientId !== user.id && mission.professionalProfile.userId !== user.id) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_PARTICIPANT, 403, 'Mission non accessible.');
    }
    return mission;
  }

  private toMission(mission: MissionRecord): MissionResponseDto {
    return {
      id: mission.id,
      requestId: mission.requestId,
      proposalId: mission.proposalId,
      clientId: mission.clientId,
      professionalProfileId: mission.professionalProfileId,
      status: mission.status,
      previousProfessionalId: mission.previousProfessionalId,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
    };
  }
}
