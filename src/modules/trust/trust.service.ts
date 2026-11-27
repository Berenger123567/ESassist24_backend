import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppealStatus,
  Claim,
  ClaimStatus,
  GuaranteeStatus,
  MissionStatus,
  NotificationType,
  Prisma,
  ProfessionalStatus,
  QuoteStatus,
  ReputationLevel,
  ReviewStatus,
  RoleCode,
  SuspicionReason,
  SuspensionStatus,
  UserStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { resolveLimit } from '../../common/pagination/pagination';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  AdminReviewQueryDto,
  AppealDecisionResponseDto,
  AppealResponseDto,
  ClaimPageDto,
  ClaimQueryDto,
  ClaimResponseDto,
  CreateAppealDto,
  CreateClaimDto,
  CreateReviewContestDto,
  CreateReviewDto,
  CreateReviewReplyDto,
  DecideAppealDto,
  EscalateClaimDto,
  GuaranteePageDto,
  GuaranteeQueryDto,
  GuaranteeResponseDto,
  ReputationResponseDto,
  ResolveClaimDto,
  ReviewContestResponseDto,
  ReviewFlagResponseDto,
  ReviewPageDto,
  ReviewReplyResponseDto,
  ReviewResponseDto,
  SuspendProfessionalDto,
  SuspensionPageDto,
  SuspensionQueryDto,
  SuspensionResponseDto,
  TrustIndicatorsDto,
} from './dto/trust.dto';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const RECENT_REPUTATION_DAYS = 30;
const LOW_SCORE_THRESHOLD = 2;

const REVIEW_INCLUDE = Prisma.validator<Prisma.ReviewInclude>()({
  response: true,
  contest: true,
  flags: { orderBy: { id: 'asc' } },
});

const SUSPENSION_INCLUDE = Prisma.validator<Prisma.SuspensionInclude>()({
  profile: { select: { id: true, userId: true, status: true, certifiedAt: true } },
  appeals: { orderBy: { createdAt: 'desc' } },
});

type ReviewWithRelations = Prisma.ReviewGetPayload<{ include: typeof REVIEW_INCLUDE }>;
type SuspensionWithRelations = Prisma.SuspensionGetPayload<{ include: typeof SUSPENSION_INCLUDE }>;
type SuspensionWithUser = Prisma.SuspensionGetPayload<{
  include: { profile: { include: { user: true } } };
}>;
type MissionForReview = Prisma.MissionGetPayload<{
  include: { professionalProfile: { select: { id: true; userId: true } } };
}>;
type ClaimSlaRecord = Pick<
  Claim,
  'status' | 'ackDueAt' | 'resolutionDueAt' | 'acknowledgedAt' | 'resolvedAt'
>;

interface ReviewFlagInput {
  reason: SuspicionReason;
  detail: Prisma.InputJsonValue;
}

interface ReputationTier {
  level: ReputationLevel;
  minScore: number;
  minMissions: number;
}

@Injectable()
export class TrustService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async createReview(
    user: AuthUser,
    missionId: string,
    dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    if (!user.roles.includes(RoleCode.CLIENT)) {
      throw new ApiError(
        ERROR_CODES.REVIEW_NOT_ALLOWED,
        403,
        'Seul le client peut évaluer la mission.',
      );
    }

    const mission = await this.prisma.mission.findUnique({
      where: { id: missionId },
      include: { professionalProfile: { select: { id: true, userId: true } } },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_FOUND, 404, 'Mission introuvable.');
    }
    if (mission.clientId !== user.id) {
      throw new ApiError(
        ERROR_CODES.REVIEW_NOT_ALLOWED,
        403,
        'Cette mission n’appartient pas au client connecté.',
      );
    }
    if (mission.status !== MissionStatus.CLOSED) {
      throw new ApiError(
        ERROR_CODES.REVIEW_NOT_ALLOWED,
        409,
        'Seule une mission clôturée peut être évaluée.',
      );
    }
    const ratings = [dto.quality, dto.timeliness, dto.behaviour, dto.quoteCompliance, dto.safety];
    if (ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Les notes doivent être comprises entre 1 et 5.',
      );
    }

    const existing = await this.prisma.review.findUnique({ where: { missionId } });
    if (existing) {
      throw new ApiError(
        ERROR_CODES.REVIEW_ALREADY_EXISTS,
        409,
        'Un avis existe déjà pour cette mission.',
      );
    }

    const { weights, total } = this.scoreWeights();
    const weightedScore = this.round(
      ratings.reduce((sum, value, index) => sum + value * weights[index], 0) / total,
      2,
    );
    const flags = await this.detectReviewFlags(user, mission, dto.comment);
    const status = flags.length > 0 ? ReviewStatus.SUSPICIOUS : ReviewStatus.PUBLISHED;

    const { review, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({
        data: {
          missionId,
          authorId: user.id,
          professionalProfileId: mission.professionalProfileId,
          quality: dto.quality,
          timeliness: dto.timeliness,
          behaviour: dto.behaviour,
          quoteCompliance: dto.quoteCompliance,
          safety: dto.safety,
          weightedScore,
          comment: dto.comment ?? null,
          status,
        },
        include: REVIEW_INCLUDE,
      });
      if (flags.length > 0) {
        await tx.reviewFlag.createMany({
          data: flags.map((flag) => ({
            reviewId: created.id,
            reason: flag.reason,
            detail: flag.detail,
          })),
        });
      }
      await this.audit.write(
        {
          actorId: user.id,
          action: 'REVIEW.CREATED',
          targetType: 'Review',
          targetId: created.id,
          after: {
            status,
            weightedScore,
            flags: flags.map((flag) => flag.reason),
          },
        },
        tx,
      );
      let notificationOutboxIds: string[] = [];
      if (status === ReviewStatus.PUBLISHED) {
        const notification = await this.notifications.createForUser(
          mission.professionalProfile.userId,
          {
            type: NotificationType.REVIEW_RECEIVED,
            title: 'Nouvel avis reçu',
            body: `Un client a publié un avis de ${weightedScore.toFixed(1)}/5.`,
            entityId: created.id,
            route: `/professionals/${mission.professionalProfileId}/reviews`,
          },
          tx,
        );
        notificationOutboxIds = notification.outboxIds;
      }
      return { review: created, outboxIds: notificationOutboxIds };
    });

    await this.notifications.enqueue(outboxIds);
    return this.toReview(review, true);
  }

  async listReviews(
    professionalProfileId: string,
    query: PaginationQueryDto = {},
  ): Promise<ReviewPageDto> {
    await this.assertProfileExists(professionalProfileId);
    const limit = resolveLimit(query.limit);
    const rows = await this.prisma.review.findMany({
      where: { professionalProfileId, status: ReviewStatus.PUBLISHED },
      include: REVIEW_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: page.map((review) => this.toReview(review)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async listReviewsForAdmin(query: AdminReviewQueryDto): Promise<ReviewPageDto> {
    const limit = resolveLimit(query.limit);
    const rows = await this.prisma.review.findMany({
      where: query.status ? { status: query.status } : {},
      include: REVIEW_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: page.map((review) => this.toReview(review, true)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async respondToReview(
    user: AuthUser,
    reviewId: string,
    dto: CreateReviewReplyDto,
  ): Promise<ReviewReplyResponseDto> {
    if (!user.roles.includes(RoleCode.PROFESSIONAL)) {
      throw new ApiError(
        ERROR_CODES.REVIEW_RESPONSE_NOT_ALLOWED,
        403,
        'Réservé au professionnel concerné.',
      );
    }

    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { profile: { select: { userId: true } }, response: true },
    });
    if (!review) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Avis introuvable.');
    }
    if (review.profile.userId !== user.id) {
      throw new ApiError(
        ERROR_CODES.REVIEW_RESPONSE_NOT_ALLOWED,
        403,
        'Cet avis ne concerne pas votre profil.',
      );
    }
    if (review.status !== ReviewStatus.PUBLISHED && review.status !== ReviewStatus.CONTESTED) {
      throw new ApiError(
        ERROR_CODES.REVIEW_RESPONSE_NOT_ALLOWED,
        409,
        'Cet avis ne peut pas recevoir de réponse.',
      );
    }
    if (review.response) {
      throw new ApiError(
        ERROR_CODES.REVIEW_RESPONSE_NOT_ALLOWED,
        409,
        'Une réponse existe déjà pour cet avis.',
      );
    }

    try {
      const { reply, outboxIds } = await this.prisma.$transaction(async (tx) => {
        const created = await tx.reviewResponse.create({
          data: {
            reviewId,
            professionalProfileId: review.professionalProfileId,
            body: dto.body,
          },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: 'REVIEW.RESPONSE_CREATED',
            targetType: 'ReviewResponse',
            targetId: created.id,
          },
          tx,
        );
        const notification = await this.notifications.createForUser(
          review.authorId,
          {
            type: NotificationType.REVIEW_RESPONSE_RECEIVED,
            title: 'Réponse à votre avis',
            body: 'Le professionnel a répondu à votre évaluation.',
            entityId: created.id,
            route: `/reviews/${reviewId}`,
          },
          tx,
        );
        return { reply: created, outboxIds: notification.outboxIds };
      });
      await this.notifications.enqueue(outboxIds);
      return this.toReply(reply);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          ERROR_CODES.REVIEW_RESPONSE_NOT_ALLOWED,
          409,
          'Une réponse existe déjà pour cet avis.',
        );
      }
      throw error;
    }
  }

  async contestReview(
    user: AuthUser,
    reviewId: string,
    dto: CreateReviewContestDto,
  ): Promise<ReviewContestResponseDto> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      include: { profile: { select: { userId: true } }, contest: true },
    });
    if (!review) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Avis introuvable.');
    }
    const allowed =
      review.authorId === user.id ||
      review.profile.userId === user.id ||
      user.roles.includes(RoleCode.ADMIN);
    if (!allowed) {
      throw new ApiError(
        ERROR_CODES.REVIEW_CONTEST_NOT_ALLOWED,
        403,
        'Vous ne pouvez pas contester cet avis.',
      );
    }
    if (review.contest) {
      throw new ApiError(
        ERROR_CODES.REVIEW_CONTEST_NOT_ALLOWED,
        409,
        'Un contest existe déjà pour cet avis.',
      );
    }
    if (
      review.status !== ReviewStatus.PUBLISHED &&
      review.status !== ReviewStatus.SUSPICIOUS &&
      review.status !== ReviewStatus.CONTESTED
    ) {
      throw new ApiError(
        ERROR_CODES.REVIEW_CONTEST_NOT_ALLOWED,
        409,
        'Cet avis ne peut pas être contesté.',
      );
    }

    const contest = await this.prisma.$transaction(async (tx) => {
      await tx.review.update({
        where: { id: reviewId },
        data: { status: ReviewStatus.CONTESTED },
      });
      const created = await tx.reviewContest.create({
        data: { reviewId, authorId: user.id, body: dto.body },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'REVIEW.CONTESTED',
          targetType: 'ReviewContest',
          targetId: created.id,
        },
        tx,
      );
      return created;
    });
    return this.toContest(contest);
  }

  async getReputation(professionalProfileId: string): Promise<ReputationResponseDto> {
    await this.assertProfileExists(professionalProfileId);
    const now = new Date();
    const [reviews, missionCount, statusGroups, lastSnapshot] = await Promise.all([
      this.prisma.review.findMany({
        where: {
          professionalProfileId,
          status: ReviewStatus.PUBLISHED,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.mission.count({
        where: { professionalProfileId, status: MissionStatus.CLOSED },
      }),
      this.prisma.review.groupBy({
        by: ['status'],
        where: { professionalProfileId },
        _count: { _all: true },
      }),
      this.prisma.reputationSnapshot.findFirst({
        where: { professionalProfileId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const score = reviews.length
      ? this.round(
          reviews.reduce((sum, review) => sum + review.weightedScore, 0) / reviews.length,
          2,
        )
      : 0;
    const level = this.resolveLevel(score, missionCount);
    const recentSince = now.getTime() - RECENT_REPUTATION_DAYS * DAY_MS;
    const recent = reviews.filter((review) => review.createdAt.getTime() >= recentSince);
    const recentScore = recent.length
      ? this.round(recent.reduce((sum, review) => sum + review.weightedScore, 0) / recent.length, 2)
      : null;
    const trend = recentScore === null ? 0 : this.round(recentScore - score, 2);

    if (
      !lastSnapshot ||
      lastSnapshot.score !== score ||
      lastSnapshot.level !== level ||
      lastSnapshot.missionCount !== missionCount
    ) {
      await this.prisma.reputationSnapshot.create({
        data: { professionalProfileId, score, level, missionCount },
      });
    }

    return {
      professionalProfileId,
      score,
      level,
      missionCount,
      counts: {
        total: statusGroups.reduce((sum, group) => sum + group._count._all, 0),
        published: this.countByReviewStatus(statusGroups, ReviewStatus.PUBLISHED),
        suspicious: this.countByReviewStatus(statusGroups, ReviewStatus.SUSPICIOUS),
        contested: this.countByReviewStatus(statusGroups, ReviewStatus.CONTESTED),
        rejected: this.countByReviewStatus(statusGroups, ReviewStatus.REJECTED),
      },
      recentScore,
      trend,
      generatedAt: now,
    };
  }

  async getIndicators(): Promise<TrustIndicatorsDto> {
    const now = new Date();
    const [statusGroups, scoreAggregate, claims, activeGuarantees, activeSuspensions] =
      await Promise.all([
        this.prisma.review.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.review.aggregate({
          where: { status: ReviewStatus.PUBLISHED },
          _avg: { weightedScore: true },
        }),
        this.prisma.claim.findMany({
          select: {
            status: true,
            ackDueAt: true,
            resolutionDueAt: true,
            acknowledgedAt: true,
            resolvedAt: true,
          },
        }),
        this.prisma.guarantee.count({
          where: { status: GuaranteeStatus.ACTIVE, validUntil: { gt: now } },
        }),
        this.prisma.suspension.count({ where: { status: SuspensionStatus.ACTIVE } }),
      ]);

    const breached = claims.filter(
      (claim) => this.isAckBreached(claim, now) || this.isResolutionBreached(claim, now),
    ).length;

    return {
      reviewsTotal: statusGroups.reduce((sum, group) => sum + group._count._all, 0),
      reviewsPublished: this.countByReviewStatus(statusGroups, ReviewStatus.PUBLISHED),
      reviewsSuspicious: this.countByReviewStatus(statusGroups, ReviewStatus.SUSPICIOUS),
      reviewsContested: this.countByReviewStatus(statusGroups, ReviewStatus.CONTESTED),
      averageScore: this.round(scoreAggregate._avg.weightedScore ?? 0, 2),
      claimsTotal: claims.length,
      slaBreachRate: claims.length ? this.round(breached / claims.length, 4) : 0,
      openClaims: claims.filter((claim) => claim.status === ClaimStatus.OPEN).length,
      activeGuarantees,
      activeSuspensions,
      generatedAt: now,
    };
  }

  async createClaim(user: AuthUser, dto: CreateClaimDto): Promise<ClaimResponseDto> {
    let mission: Prisma.MissionGetPayload<{
      include: {
        professionalProfile: { select: { id: true; userId: true } };
      };
    }> | null = null;
    let respondentProfileId = dto.respondentProfileId ?? null;
    const recipientUserIds: string[] = [];

    if (dto.missionId) {
      mission = await this.prisma.mission.findUnique({
        where: { id: dto.missionId },
        include: { professionalProfile: { select: { id: true, userId: true } } },
      });
      if (!mission) {
        throw new ApiError(ERROR_CODES.MISSION_NOT_FOUND, 404, 'Mission introuvable.');
      }
      const isClient = mission.clientId === user.id;
      const isProfessional = mission.professionalProfile.userId === user.id;
      if (!isClient && !isProfessional && !user.roles.includes(RoleCode.ADMIN)) {
        throw new ApiError(
          ERROR_CODES.FORBIDDEN,
          403,
          'Vous n’êtes pas participant à cette mission.',
        );
      }
      if (respondentProfileId === null && isClient) {
        respondentProfileId = mission.professionalProfile.id;
      }
      if (isClient) {
        recipientUserIds.push(mission.professionalProfile.userId);
      } else {
        recipientUserIds.push(mission.clientId);
      }
    }

    if (respondentProfileId) {
      const respondent = await this.prisma.professionalProfile.findUnique({
        where: { id: respondentProfileId },
        select: { userId: true },
      });
      if (!respondent) {
        throw new ApiError(
          ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
          404,
          'Profil professionnel introuvable.',
        );
      }
      recipientUserIds.push(respondent.userId);
    } else if (!mission) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Une mission ou un professionnel concerné est requis.',
      );
    }

    const uniqueRecipients = [...new Set(recipientUserIds)].filter((id) => id !== user.id);

    const now = new Date();
    const ackHours = this.config.get<number>('CLAIM_ACK_SLA_HOURS', 2);
    const resolutionHours = this.config.get<number>('CLAIM_RESOLUTION_SLA_HOURS', 72);
    const ackDueAt = new Date(now.getTime() + ackHours * HOUR_MS);
    const resolutionDueAt = new Date(now.getTime() + resolutionHours * HOUR_MS);

    const { claim, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.claim.create({
        data: {
          number: this.claimNumber(now),
          missionId: dto.missionId ?? null,
          claimantId: user.id,
          respondentProfileId,
          subject: dto.subject,
          description: dto.description,
          ackDueAt,
          resolutionDueAt,
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'CLAIM.CREATED',
          targetType: 'Claim',
          targetId: created.id,
        },
        tx,
      );
      const notificationOutboxIds = await this.notifyClaimParticipants(
        created,
        {
          type: NotificationType.CLAIM_OPENED,
          title: 'Réclamation ouverte',
          body: `La réclamation ${created.number} a été ouverte.`,
        },
        tx,
        uniqueRecipients,
      );
      return { claim: created, outboxIds: notificationOutboxIds };
    });

    await this.notifications.enqueue(outboxIds);
    return this.toClaim(claim, now);
  }

  async listMyClaims(user: AuthUser, query: ClaimQueryDto = {}): Promise<ClaimPageDto> {
    const limit = resolveLimit(query.limit);
    const now = new Date();
    const rows = await this.prisma.claim.findMany({
      where: {
        claimantId: user.id,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = page
      .map((claim) => this.toClaim(claim, now))
      .filter((claim) => query.slaBreached === undefined || this.hasSlaBreach(claim));
    return {
      data,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getClaim(user: AuthUser, id: string): Promise<ClaimResponseDto> {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        mission: {
          select: {
            clientId: true,
            professionalProfile: { select: { userId: true } },
          },
        },
        respondent: { select: { userId: true } },
      },
    });
    if (!claim) {
      throw new ApiError(ERROR_CODES.CLAIM_NOT_FOUND, 404, 'Réclamation introuvable.');
    }
    const allowed =
      claim.claimantId === user.id ||
      claim.respondent?.userId === user.id ||
      claim.mission?.clientId === user.id ||
      claim.mission?.professionalProfile.userId === user.id ||
      user.roles.includes(RoleCode.ADMIN);
    if (!allowed) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Réclamation non accessible.');
    }
    return this.toClaim(claim);
  }

  async acknowledgeClaim(admin: AuthUser, id: string): Promise<ClaimResponseDto> {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) {
      throw new ApiError(ERROR_CODES.CLAIM_NOT_FOUND, 404, 'Réclamation introuvable.');
    }
    if (claim.status !== ClaimStatus.OPEN) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Seule une réclamation ouverte peut être accusée réception.',
      );
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.claim.update({
        where: { id },
        data: { status: ClaimStatus.ACKNOWLEDGED, acknowledgedAt: new Date() },
      });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'CLAIM.ACKNOWLEDGED',
          targetType: 'Claim',
          targetId: id,
          after: { status: ClaimStatus.ACKNOWLEDGED },
        },
        tx,
      );
      const notificationOutboxIds = await this.notifyClaimParticipants(
        result,
        {
          type: NotificationType.CLAIM_STATUS_CHANGED,
          title: 'Réclamation prise en charge',
          body: `La réclamation ${result.number} est maintenant prise en charge.`,
        },
        tx,
      );
      return { updated: result, outboxIds: notificationOutboxIds };
    });

    await this.notifications.enqueue(outboxIds);
    return this.toClaim(updated);
  }

  async resolveClaim(admin: AuthUser, id: string, dto: ResolveClaimDto): Promise<ClaimResponseDto> {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) {
      throw new ApiError(ERROR_CODES.CLAIM_NOT_FOUND, 404, 'Réclamation introuvable.');
    }
    if (claim.status === ClaimStatus.RESOLVED || claim.status === ClaimStatus.REJECTED) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Cette réclamation est déjà clôturée.',
      );
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.claim.update({
        where: { id },
        data: { status: ClaimStatus.RESOLVED, resolvedAt: new Date() },
      });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'CLAIM.RESOLVED',
          targetType: 'Claim',
          targetId: id,
          after: { status: ClaimStatus.RESOLVED, resolution: dto.resolution },
        },
        tx,
      );
      const notificationOutboxIds = await this.notifyClaimParticipants(
        result,
        {
          type: NotificationType.CLAIM_STATUS_CHANGED,
          title: 'Réclamation résolue',
          body: `La réclamation ${result.number} a été résolue.`,
        },
        tx,
      );
      return { updated: result, outboxIds: notificationOutboxIds };
    });

    await this.notifications.enqueue(outboxIds);
    return this.toClaim(updated);
  }

  async escalateClaim(
    admin: AuthUser,
    id: string,
    dto: EscalateClaimDto,
  ): Promise<ClaimResponseDto> {
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) {
      throw new ApiError(ERROR_CODES.CLAIM_NOT_FOUND, 404, 'Réclamation introuvable.');
    }
    if (claim.status === ClaimStatus.RESOLVED || claim.status === ClaimStatus.REJECTED) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Une réclamation clôturée ne peut pas être escaladée.',
      );
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.claim.update({
        where: { id },
        data: { status: ClaimStatus.ESCALATED },
      });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'CLAIM.ESCALATED',
          targetType: 'Claim',
          targetId: id,
          after: { status: ClaimStatus.ESCALATED, reason: dto.reason },
        },
        tx,
      );
      const notificationOutboxIds = await this.notifyClaimParticipants(
        result,
        {
          type: NotificationType.CLAIM_STATUS_CHANGED,
          title: 'Réclamation escaladée',
          body: `La réclamation ${result.number} a été escaladée.`,
        },
        tx,
      );
      return { updated: result, outboxIds: notificationOutboxIds };
    });

    await this.notifications.enqueue(outboxIds);
    return this.toClaim(updated);
  }

  async listAdminClaims(query: ClaimQueryDto): Promise<ClaimPageDto> {
    const limit = resolveLimit(query.limit);
    const now = new Date();
    const rows = await this.prisma.claim.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const data = page
      .map((claim) => this.toClaim(claim, now))
      .filter((claim) => query.slaBreached === undefined || this.hasSlaBreach(claim));
    return {
      data,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getGuarantee(missionId: string, user?: AuthUser): Promise<GuaranteeResponseDto> {
    if (user && !user.roles.includes(RoleCode.ADMIN)) {
      const mission = await this.prisma.mission.findUnique({
        where: { id: missionId },
        select: {
          clientId: true,
          professionalProfile: { select: { userId: true } },
        },
      });
      if (
        !mission ||
        (mission.clientId !== user.id && mission.professionalProfile.userId !== user.id)
      ) {
        throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Garantie non accessible.');
      }
    }

    const guarantee = await this.prisma.guarantee.findUnique({ where: { missionId } });
    if (!guarantee) {
      throw new ApiError(ERROR_CODES.GUARANTEE_NOT_FOUND, 404, 'Garantie introuvable.');
    }
    const now = new Date();
    if (
      guarantee.status === GuaranteeStatus.ACTIVE &&
      guarantee.validUntil.getTime() <= now.getTime()
    ) {
      await this.prisma.guarantee.update({
        where: { id: guarantee.id },
        data: { status: GuaranteeStatus.EXPIRED },
      });
      guarantee.status = GuaranteeStatus.EXPIRED;
    }
    if (guarantee.status === GuaranteeStatus.EXPIRED) {
      throw new ApiError(ERROR_CODES.GUARANTEE_EXPIRED, 410, 'La garantie a expiré.');
    }
    return this.toGuarantee(guarantee, now);
  }

  async listAdminGuarantees(query: GuaranteeQueryDto): Promise<GuaranteePageDto> {
    const limit = resolveLimit(query.limit);
    const now = new Date();
    const rows = await this.prisma.guarantee.findMany({
      where: query.status ? { status: query.status } : {},
      orderBy: [{ validUntil: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: page.map((guarantee) => this.toGuarantee(guarantee, now)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async recordMissionClosed(missionId: string, tx: Prisma.TransactionClient): Promise<string[]> {
    const outboxIds: string[] = [];
    const existing = await tx.guarantee.findUnique({ where: { missionId } });
    if (existing) {
      return outboxIds;
    }

    const mission = await tx.mission.findUnique({
      where: { id: missionId },
      select: {
        clientId: true,
        professionalProfile: { select: { userId: true } },
      },
    });
    if (!mission) {
      throw new ApiError(ERROR_CODES.MISSION_NOT_FOUND, 404, 'Mission introuvable.');
    }
    const quote = await tx.quote.findFirst({
      where: { missionId, status: QuoteStatus.ACCEPTED },
      orderBy: { version: 'desc' },
    });
    if (!quote) {
      throw new ApiError(ERROR_CODES.QUOTE_NOT_FOUND, 404, 'Devis accepté introuvable.');
    }

    const now = new Date();
    const days = this.config.get<number>('GUARANTEE_DAYS', 30);
    try {
      const created = await tx.guarantee.create({
        data: {
          missionId,
          coverageCents: quote.totalCents,
          currency: quote.currency,
          validFrom: now,
          validUntil: new Date(now.getTime() + days * DAY_MS),
          status: GuaranteeStatus.ACTIVE,
        },
      });
      await this.audit.write(
        {
          actorId: null,
          action: 'GUARANTEE.CREATED',
          targetType: 'Guarantee',
          targetId: created.id,
          after: { missionId, coverageCents: quote.totalCents },
        },
        tx,
      );
      for (const userId of [mission.clientId, mission.professionalProfile.userId]) {
        const notification = await this.notifications.createForUser(
          userId,
          {
            type: NotificationType.GUARANTEE_ACTIVATED,
            title: 'Garantie activée',
            body: `Une garantie de ${days} jours est active pour cette mission.`,
            entityId: created.id,
            route: `/missions/${missionId}/guarantee`,
          },
          tx,
        );
        outboxIds.push(...notification.outboxIds);
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return outboxIds;
      }
      throw error;
    }
    return outboxIds;
  }

  async suspendProfessional(
    admin: AuthUser,
    professionalProfileId: string,
    dto: SuspendProfessionalDto,
  ): Promise<SuspensionResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      include: { user: true },
    });
    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }
    if (
      profile.status === ProfessionalStatus.SUSPENDED ||
      profile.user.status === UserStatus.SUSPENDED
    ) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Ce professionnel est déjà suspendu.',
      );
    }
    const active = await this.prisma.suspension.findFirst({
      where: {
        professionalProfileId,
        status: { in: [SuspensionStatus.ACTIVE, SuspensionStatus.APPEALED] },
      },
    });
    if (active) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Une suspension active existe déjà.',
      );
    }

    const evidence = {
      ...(dto.evidence ?? {}),
      previousStatus: profile.status,
      previousUserStatus: profile.user.status,
    };
    const { suspension, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.suspension.create({
        data: {
          professionalProfileId,
          reason: dto.reason,
          evidence: evidence as Prisma.InputJsonValue,
          suspendedBy: admin.id,
          endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
          status: SuspensionStatus.ACTIVE,
        },
      });
      await tx.professionalProfile.update({
        where: { id: professionalProfileId },
        data: { status: ProfessionalStatus.SUSPENDED },
      });
      await tx.user.update({
        where: { id: profile.userId },
        data: { status: UserStatus.SUSPENDED },
      });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'SUSPENSION.APPLIED',
          targetType: 'Suspension',
          targetId: created.id,
          after: { reason: dto.reason, professionalProfileId },
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        profile.userId,
        {
          type: NotificationType.SUSPENSION_APPLIED,
          title: 'Compte suspendu',
          body: dto.reason,
          entityId: created.id,
          route: `/suspensions/${created.id}`,
        },
        tx,
      );
      return { suspension: created, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toSuspension(suspension);
  }

  async liftSuspension(admin: AuthUser, id: string): Promise<SuspensionResponseDto> {
    const suspension = await this.prisma.suspension.findUnique({
      where: { id },
      include: { profile: { include: { user: true } }, appeals: true },
    });
    if (!suspension) {
      throw new ApiError(ERROR_CODES.SUSPENSION_NOT_FOUND, 404, 'Suspension introuvable.');
    }
    if (
      suspension.status !== SuspensionStatus.ACTIVE &&
      suspension.status !== SuspensionStatus.APPEALED
    ) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        409,
        'Cette suspension n’est pas active.',
      );
    }

    const { updated, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const result = await this.liftSuspensionInTx(tx, suspension);
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'SUSPENSION.LIFTED',
          targetType: 'Suspension',
          targetId: id,
          after: { status: SuspensionStatus.LIFTED },
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        suspension.profile.userId,
        {
          type: NotificationType.SUSPENSION_LIFTED,
          title: 'Suspension levée',
          body: 'Votre compte professionnel est de nouveau actif.',
          entityId: id,
          route: `/suspensions/${id}`,
        },
        tx,
      );
      return { updated: result, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);
    return this.toSuspension(
      updated,
      suspension.appeals.map((appeal) => this.toAppeal(appeal)),
    );
  }

  async appealSuspension(
    user: AuthUser,
    id: string,
    dto: CreateAppealDto,
  ): Promise<AppealResponseDto> {
    const suspension = await this.prisma.suspension.findUnique({
      where: { id },
      include: { profile: { select: { userId: true } }, appeals: true },
    });
    if (!suspension) {
      throw new ApiError(ERROR_CODES.SUSPENSION_NOT_FOUND, 404, 'Suspension introuvable.');
    }
    if (suspension.profile.userId !== user.id) {
      throw new ApiError(
        ERROR_CODES.APPEAL_NOT_ALLOWED,
        403,
        'Seul le professionnel concerné peut faire appel.',
      );
    }
    if (
      suspension.status !== SuspensionStatus.ACTIVE &&
      suspension.status !== SuspensionStatus.APPEALED
    ) {
      throw new ApiError(
        ERROR_CODES.APPEAL_NOT_ALLOWED,
        409,
        'Cette suspension ne peut pas être contestée.',
      );
    }
    if (suspension.appeals.some((appeal) => appeal.status === AppealStatus.PENDING)) {
      throw new ApiError(ERROR_CODES.APPEAL_NOT_ALLOWED, 409, 'Un appel est déjà en attente.');
    }

    const appeal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.appeal.create({
        data: { suspensionId: id, submittedBy: user.id, body: dto.body },
      });
      await tx.suspension.update({
        where: { id },
        data: { status: SuspensionStatus.APPEALED },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'APPEAL.SUBMITTED',
          targetType: 'Appeal',
          targetId: created.id,
        },
        tx,
      );
      return created;
    });
    return this.toAppeal(appeal);
  }

  async decideAppeal(
    admin: AuthUser,
    suspensionId: string,
    dto: DecideAppealDto,
  ): Promise<AppealDecisionResponseDto> {
    const suspension = await this.prisma.suspension.findUnique({
      where: { id: suspensionId },
      include: { profile: { include: { user: true } }, appeals: true },
    });
    if (!suspension) {
      throw new ApiError(ERROR_CODES.SUSPENSION_NOT_FOUND, 404, 'Suspension introuvable.');
    }
    const appeal = suspension.appeals.find((item) => item.status === AppealStatus.PENDING);
    if (!appeal) {
      throw new ApiError(
        ERROR_CODES.APPEAL_NOT_ALLOWED,
        409,
        'Aucun appel en attente pour cette suspension.',
      );
    }

    const { updatedAppeal, outboxIds } = await this.prisma.$transaction(async (tx) => {
      const decided = await tx.appeal.update({
        where: { id: appeal.id },
        data: {
          status: dto.decision,
          decidedBy: admin.id,
          decidedAt: new Date(),
        },
      });
      if (dto.decision === AppealStatus.ACCEPTED) {
        await this.liftSuspensionInTx(tx, suspension);
      } else {
        await tx.suspension.update({
          where: { id: suspensionId },
          data: { status: SuspensionStatus.ACTIVE },
        });
      }
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'APPEAL.DECIDED',
          targetType: 'Appeal',
          targetId: appeal.id,
          after: { decision: dto.decision, reason: dto.reason ?? null },
        },
        tx,
      );
      const notification = await this.notifications.createForUser(
        appeal.submittedBy,
        {
          type: NotificationType.APPEAL_DECIDED,
          title: 'Décision sur votre appel',
          body:
            dto.decision === AppealStatus.ACCEPTED
              ? 'Votre appel a été accepté et la suspension levée.'
              : 'Votre appel a été rejeté.',
          entityId: appeal.id,
          route: `/suspensions/${suspensionId}`,
        },
        tx,
      );
      return { updatedAppeal: decided, outboxIds: notification.outboxIds };
    });
    await this.notifications.enqueue(outboxIds);

    const updatedSuspension = await this.prisma.suspension.findUniqueOrThrow({
      where: { id: suspensionId },
      include: SUSPENSION_INCLUDE,
    });
    return {
      appeal: this.toAppeal(updatedAppeal),
      suspension: this.toSuspension(updatedSuspension),
    };
  }

  async listAdminSuspensions(query: SuspensionQueryDto): Promise<SuspensionPageDto> {
    const limit = resolveLimit(query.limit);
    const rows = await this.prisma.suspension.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.professionalProfileId
          ? { professionalProfileId: query.professionalProfileId }
          : {}),
      },
      include: SUSPENSION_INCLUDE,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: page.map((suspension: SuspensionWithRelations) => this.toSuspension(suspension)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  private async detectReviewFlags(
    user: AuthUser,
    mission: MissionForReview,
    comment?: string,
  ): Promise<ReviewFlagInput[]> {
    const flags: ReviewFlagInput[] = [];
    const maxPerHour = this.config.get<number>('REVIEW_SUSPICION_MAX_PER_HOUR', 5);
    const since = new Date(Date.now() - HOUR_MS);
    const recent = await this.prisma.review.findMany({
      where: { authorId: user.id, createdAt: { gte: since } },
      select: { weightedScore: true, comment: true },
    });

    if (recent.length >= maxPerHour) {
      flags.push({
        reason: SuspicionReason.VELOCITY,
        detail: { count: recent.length, maxPerHour },
      });
    }
    const lowScoreCount = recent.filter(
      (review) => review.weightedScore <= LOW_SCORE_THRESHOLD,
    ).length;
    if (lowScoreCount >= maxPerHour) {
      flags.push({
        reason: SuspicionReason.LOW_SCORE_BURST,
        detail: {
          count: lowScoreCount,
          maxPerHour,
          threshold: LOW_SCORE_THRESHOLD,
        },
      });
    }
    if (mission.clientId === mission.professionalProfile.userId) {
      flags.push({
        reason: SuspicionReason.SELF_REVIEW,
        detail: { professionalUserId: mission.professionalProfile.userId },
      });
    }

    const normalizedComment = this.normalizeComment(comment);
    if (normalizedComment) {
      const comments = await this.prisma.review.findMany({
        where: { comment: { not: null } },
        select: { id: true, comment: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      const duplicate = comments.find(
        (review) => review.comment && this.normalizeComment(review.comment) === normalizedComment,
      );
      if (duplicate) {
        flags.push({
          reason: SuspicionReason.DUPLICATE_TEXT,
          detail: { reviewId: duplicate.id },
        });
      }
    }

    const duplicatePair = await this.prisma.review.findFirst({
      where: {
        authorId: user.id,
        professionalProfileId: mission.professionalProfileId,
      },
      select: { id: true },
    });
    if (duplicatePair) {
      flags.push({
        reason: SuspicionReason.DUPLICATE_PAIR,
        detail: { reviewId: duplicatePair.id },
      });
    }

    return flags;
  }

  private async assertProfileExists(professionalProfileId: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true },
    });
    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }
  }

  private async liftSuspensionInTx(
    tx: Prisma.TransactionClient,
    suspension: SuspensionWithUser,
  ): Promise<Prisma.SuspensionGetPayload<object>> {
    const evidence = this.asRecord(suspension.evidence);
    const canRestore =
      suspension.profile.user.deletedAt === null &&
      suspension.profile.status !== ProfessionalStatus.REFUSED;
    const updated = await tx.suspension.update({
      where: { id: suspension.id },
      data: {
        status: SuspensionStatus.LIFTED,
        liftedAt: new Date(),
      },
    });
    if (canRestore) {
      const previous = evidence?.previousStatus;
      const restoredStatus =
        this.isProfessionalStatus(previous) &&
        previous !== ProfessionalStatus.SUSPENDED &&
        previous !== ProfessionalStatus.REFUSED
          ? previous
          : suspension.profile.certifiedAt
            ? ProfessionalStatus.CERTIFIED
            : ProfessionalStatus.VERIFIED;
      await tx.professionalProfile.update({
        where: { id: suspension.professionalProfileId },
        data: { status: restoredStatus },
      });
      await tx.user.update({
        where: { id: suspension.profile.userId },
        data: { status: UserStatus.ACTIVE },
      });
    }
    return updated;
  }

  private async notifyClaimParticipants(
    claim: Prisma.ClaimGetPayload<object>,
    input: {
      type: NotificationType;
      title: string;
      body: string;
    },
    tx: Prisma.TransactionClient,
    extraRecipientIds: string[] = [],
  ): Promise<string[]> {
    const recipients = new Set<string>([claim.claimantId, ...extraRecipientIds]);
    if (claim.respondentProfileId) {
      const profile = await tx.professionalProfile.findUnique({
        where: { id: claim.respondentProfileId },
        select: { userId: true },
      });
      if (profile) {
        recipients.add(profile.userId);
      }
    }
    const outboxIds: string[] = [];
    for (const userId of recipients) {
      const notification = await this.notifications.createForUser(
        userId,
        {
          ...input,
          entityId: claim.id,
          route: `/claims/${claim.id}`,
        },
        tx,
      );
      outboxIds.push(...notification.outboxIds);
    }
    return outboxIds;
  }

  private scoreWeights(): { weights: number[]; total: number } {
    const raw = this.config.get<string>('REVIEW_SCORE_WEIGHTS', '30,20,15,15,20');
    const weights = raw.split(',').map((part) => Number(part.trim()));
    if (weights.length !== 5 || weights.some((weight) => !Number.isFinite(weight) || weight <= 0)) {
      throw new ApiError(
        ERROR_CODES.INTERNAL_ERROR,
        500,
        'Configuration des pondérations d’avis invalide.',
      );
    }
    return { weights, total: weights.reduce((sum, weight) => sum + weight, 0) };
  }

  private reputationTiers(): ReputationTier[] {
    const raw = this.config.get<string>(
      'REPUTATION_LEVELS',
      'BRONZE:0:0,ARGENT:4.5:20,OR:4.7:50,PLATINE:4.9:100',
    );
    const tiers = raw
      .split(',')
      .map((part) => {
        const [level, minScoreRaw, minMissionsRaw] = part.split(':');
        return {
          level: level as ReputationLevel,
          minScore: Number(minScoreRaw),
          minMissions: Number(minMissionsRaw),
        };
      })
      .filter(
        (tier) =>
          Object.values(ReputationLevel).includes(tier.level) &&
          Number.isFinite(tier.minScore) &&
          Number.isFinite(tier.minMissions),
      )
      .sort((a, b) => b.minScore - a.minScore || b.minMissions - a.minMissions);
    if (tiers.length === 0) {
      throw new ApiError(
        ERROR_CODES.INTERNAL_ERROR,
        500,
        'Configuration des niveaux de réputation invalide.',
      );
    }
    return tiers;
  }

  private resolveLevel(score: number, missionCount: number): ReputationLevel {
    const eligible = this.reputationTiers().find(
      (tier) => score >= tier.minScore && missionCount >= tier.minMissions,
    );
    return eligible?.level ?? ReputationLevel.BRONZE;
  }

  private countByReviewStatus(
    groups: Array<{ status: ReviewStatus; _count: { _all: number } }>,
    status: ReviewStatus,
  ): number {
    return groups.find((group) => group.status === status)?._count._all ?? 0;
  }

  private claimNumber(now: Date): string {
    const day = now.toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `CLM-${day}-${suffix}`;
  }

  private isAckBreached(claim: ClaimSlaRecord, now: Date): boolean {
    const reference = claim.acknowledgedAt ?? claim.resolvedAt ?? now;
    return reference.getTime() > claim.ackDueAt.getTime();
  }

  private isResolutionBreached(claim: ClaimSlaRecord, now: Date): boolean {
    if (claim.resolvedAt) {
      return claim.resolvedAt.getTime() > claim.resolutionDueAt.getTime();
    }
    if (claim.status === ClaimStatus.RESOLVED || claim.status === ClaimStatus.REJECTED) {
      return false;
    }
    return now.getTime() > claim.resolutionDueAt.getTime();
  }

  private hasSlaBreach(claim: ClaimResponseDto): boolean {
    return claim.ackSlaBreached || claim.resolutionSlaBreached;
  }

  private normalizeComment(comment?: string | null): string | null {
    if (!comment) {
      return null;
    }
    const normalized = comment.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalized.length > 0 ? normalized : null;
  }

  private round(value: number, digits: number): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  private asRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private isProfessionalStatus(value: unknown): value is ProfessionalStatus {
    return Object.values(ProfessionalStatus).includes(value as ProfessionalStatus);
  }

  private toReview(review: ReviewWithRelations, includeModeration = false): ReviewResponseDto {
    return {
      id: review.id,
      missionId: review.missionId,
      authorId: review.authorId,
      professionalProfileId: review.professionalProfileId,
      quality: review.quality,
      timeliness: review.timeliness,
      behaviour: review.behaviour,
      quoteCompliance: review.quoteCompliance,
      safety: review.safety,
      weightedScore: review.weightedScore,
      comment: review.comment,
      status: review.status,
      response: review.response ? this.toReply(review.response) : null,
      ...(includeModeration
        ? {
            flags: review.flags.map((flag) => this.toFlag(flag)),
            contest: review.contest ? this.toContest(review.contest) : null,
          }
        : {}),
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
    };
  }

  private toFlag(flag: Prisma.ReviewFlagGetPayload<object>): ReviewFlagResponseDto {
    return {
      id: flag.id.toString(),
      reason: flag.reason,
      detail: this.asRecord(flag.detail),
      createdAt: flag.createdAt,
    };
  }

  private toReply(reply: Prisma.ReviewResponseGetPayload<object>): ReviewReplyResponseDto {
    return {
      id: reply.id,
      reviewId: reply.reviewId,
      professionalProfileId: reply.professionalProfileId,
      body: reply.body,
      createdAt: reply.createdAt,
    };
  }

  private toContest(contest: Prisma.ReviewContestGetPayload<object>): ReviewContestResponseDto {
    return {
      id: contest.id,
      reviewId: contest.reviewId,
      authorId: contest.authorId,
      body: contest.body,
      status: contest.status,
      decidedAt: contest.decidedAt,
      createdAt: contest.createdAt,
    };
  }

  private toClaim(claim: Prisma.ClaimGetPayload<object>, now = new Date()): ClaimResponseDto {
    return {
      id: claim.id,
      number: claim.number,
      missionId: claim.missionId,
      claimantId: claim.claimantId,
      respondentProfileId: claim.respondentProfileId,
      subject: claim.subject,
      description: claim.description,
      status: claim.status,
      ackDueAt: claim.ackDueAt,
      resolutionDueAt: claim.resolutionDueAt,
      acknowledgedAt: claim.acknowledgedAt,
      resolvedAt: claim.resolvedAt,
      ackSlaBreached: this.isAckBreached(claim, now),
      resolutionSlaBreached: this.isResolutionBreached(claim, now),
      createdAt: claim.createdAt,
      updatedAt: claim.updatedAt,
    };
  }

  private toGuarantee(
    guarantee: Prisma.GuaranteeGetPayload<object>,
    now = new Date(),
  ): GuaranteeResponseDto {
    return {
      id: guarantee.id,
      missionId: guarantee.missionId,
      coverageCents: guarantee.coverageCents,
      currency: guarantee.currency,
      validFrom: guarantee.validFrom,
      validUntil: guarantee.validUntil,
      status: guarantee.status,
      expired:
        guarantee.status === GuaranteeStatus.EXPIRED ||
        guarantee.validUntil.getTime() <= now.getTime(),
      createdAt: guarantee.createdAt,
    };
  }

  private toAppeal(appeal: Prisma.AppealGetPayload<object>): AppealResponseDto {
    return {
      id: appeal.id,
      suspensionId: appeal.suspensionId,
      submittedBy: appeal.submittedBy,
      body: appeal.body,
      status: appeal.status,
      decidedBy: appeal.decidedBy,
      decidedAt: appeal.decidedAt,
      createdAt: appeal.createdAt,
    };
  }

  private toSuspension(
    suspension: Prisma.SuspensionGetPayload<object>,
    appeals: AppealResponseDto[] = [],
  ): SuspensionResponseDto {
    return {
      id: suspension.id,
      professionalProfileId: suspension.professionalProfileId,
      reason: suspension.reason,
      evidence: this.asRecord(suspension.evidence),
      suspendedBy: suspension.suspendedBy,
      startedAt: suspension.startedAt,
      endsAt: suspension.endsAt,
      status: suspension.status,
      liftedAt: suspension.liftedAt,
      appeals,
      createdAt: suspension.createdAt,
    };
  }
}
