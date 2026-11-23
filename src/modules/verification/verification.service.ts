import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ProfessionalStatus,
  VerificationDecisionType,
  VerifiedReasonCode,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { signDocumentToken } from '../documents/document-signature.util';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { VerificationDecisionDto } from './dto/verification-decision.dto';
import { VerificationDecisionResponseDto } from './dto/verification-decision-response.dto';
import {
  VerificationDetailDto,
  VerificationDocumentDto,
  VerificationPageDto,
  VerificationSummaryDto,
} from './dto/verification-response.dto';
import { VerificationQueryDto } from './dto/verification-query.dto';
import { computeSla, getSlaConfig } from './sla.util';

const PROFILE_INCLUDE = Prisma.validator<Prisma.ProfessionalProfileInclude>()({
  user: { select: { id: true, phone: true, firstName: true, lastName: true } },
  specialties: { include: { specialty: { select: { code: true, label: true } } } },
  zones: { include: { zone: { select: { code: true, name: true } } } },
});

type ProfileWithRelations = Prisma.ProfessionalProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly idempotency: IdempotencyService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: VerificationQueryDto): Promise<VerificationPageDto> {
    const statuses = this.parseStatuses(query.status ?? 'PENDING');
    const sort = query.sort === 'newest' ? 'desc' : 'asc';
    const limit = query.limit ?? 20;
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { status: { in: statuses } },
      include: PROFILE_INCLUDE,
      orderBy: [{ submittedAt: sort }, { id: 'asc' }],
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const documentsByUser = await this.loadDocuments(profiles.map((profile) => profile.user.id));
    let data = profiles.map((profile) =>
      this.toSummary(profile, documentsByUser.get(profile.user.id) ?? []),
    );
    if (query.overdue !== undefined) {
      data = data.filter((item) => item.overdue === query.overdue);
    }
    const hasMore = profiles.length > limit;
    return {
      data: data.slice(0, limit),
      nextCursor: hasMore && data.length > 0 ? data[data.length - 1].profileId : null,
    };
  }

  async getById(id: string): Promise<VerificationDetailDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id },
      include: PROFILE_INCLUDE,
    });
    if (!profile) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Dossier de vérification introuvable.');
    }
    const documents = await this.loadDocuments([profile.user.id]);
    const summary = this.toSummary(profile, documents.get(profile.user.id) ?? []);
    return {
      ...summary,
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      experienceYears: profile.experienceYears,
      bio: profile.bio,
      decidedAt: profile.decidedAt,
      decisionReason: profile.decisionReason,
      complementRequestedAt: profile.complementRequestedAt,
      complementDueAt: profile.complementDueAt,
    };
  }

  async decide(
    admin: AuthUser,
    profileId: string,
    dto: VerificationDecisionDto,
    idempotencyKey: string,
    request: ContextualRequest,
  ): Promise<VerificationDecisionResponseDto> {
    const reasonText = this.validateDecision(dto);
    const requestHash = createHash('sha256')
      .update(JSON.stringify({ profileId, adminId: admin.id, dto, reasonText }))
      .digest('hex');
    let outboxIds: string[] = [];

    const result = await this.idempotency.execute(
      'verification-decision',
      admin.id,
      idempotencyKey,
      requestHash,
      async (tx) => {
        const profile = await tx.professionalProfile.findUnique({ where: { id: profileId } });
        if (!profile) {
          throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Dossier de vérification introuvable.');
        }
        if (
          profile.status !== ProfessionalStatus.PENDING &&
          !(
            dto.decision === VerificationDecisionType.COMPLEMENT_REQUESTED &&
            profile.complementRequestedAt !== null
          )
        ) {
          throw new ApiError(
            ERROR_CODES.VERIFICATION_CONFLICT,
            409,
            'Ce dossier a déjà reçu une décision définitive.',
          );
        }

        const graceDays = this.config.get<number>('VERIFICATION_COMPLEMENT_GRACE_DAYS', 30);
        const now = new Date();
        const complementDueAt =
          dto.decision === VerificationDecisionType.COMPLEMENT_REQUESTED
            ? new Date(now.getTime() + graceDays * 86_400_000)
            : null;
        const status =
          dto.decision === VerificationDecisionType.VERIFIED
            ? ProfessionalStatus.VERIFIED
            : dto.decision === VerificationDecisionType.REFUSED
              ? ProfessionalStatus.REFUSED
              : ProfessionalStatus.PENDING;

        const decision = await tx.verificationDecision.create({
          data: {
            profileId: profile.id,
            adminId: admin.id,
            decision: dto.decision,
            reasonCode: dto.reasonCode,
            reasonText,
            requestedItems: dto.requestedItems
              ? (dto.requestedItems as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            complementDueAt,
            idempotencyKey,
            requestHash,
          },
        });

        await tx.professionalProfile.update({
          where: { id: profile.id },
          data: {
            status,
            decidedAt: status === ProfessionalStatus.PENDING ? null : now,
            decisionReason: reasonText,
            complementRequestedAt:
              dto.decision === VerificationDecisionType.COMPLEMENT_REQUESTED ? now : null,
            complementDueAt,
          },
        });

        const notification = await this.notifications.createForUser(
          profile.userId,
          {
            type:
              dto.decision === VerificationDecisionType.VERIFIED
                ? 'VERIFICATION_APPROVED'
                : dto.decision === VerificationDecisionType.REFUSED
                  ? 'VERIFICATION_REFUSED'
                  : 'COMPLEMENT_REQUESTED',
            title:
              dto.decision === VerificationDecisionType.VERIFIED
                ? 'Profil vérifié'
                : dto.decision === VerificationDecisionType.REFUSED
                  ? 'Profil refusé'
                  : 'Complément requis',
            body: reasonText,
            entityId: profile.id,
            route: '/pro/profile',
            data: { decision: dto.decision, reasonCode: dto.reasonCode },
          },
          tx,
        );
        outboxIds = notification.outboxIds;

        await this.audit.writeFromRequest(
          request,
          admin,
          {
            action: `VERIFICATION.${dto.decision}`,
            targetType: 'ProfessionalProfile',
            targetId: profile.id,
            before: { status: profile.status, submittedAt: profile.submittedAt },
            after: { status, reasonCode: dto.reasonCode, reasonText, complementDueAt },
          },
          tx,
        );

        return {
          decisionId: decision.id,
          profileId: profile.id,
          decision: dto.decision,
          profileStatus: status,
          complementDueAt,
          replayed: false,
        } satisfies VerificationDecisionResponseDto;
      },
    );

    if (!result.replayed) {
      await this.notifications.enqueue(outboxIds);
    }
    return { ...result.response, replayed: result.replayed };
  }

  async createAdminViewUrl(
    admin: AuthUser,
    documentId: string,
    request: ContextualRequest,
  ): Promise<{
    documentId: string;
    viewUrl: string;
    method: 'GET';
    expiresInSeconds: number;
  }> {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || !document.storageKey) {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_AVAILABLE, 404, 'Document indisponible.');
    }
    if (!['SUBMITTED', 'APPROVED'].includes(document.status)) {
      throw new ApiError(
        ERROR_CODES.DOCUMENT_NOT_AVAILABLE,
        409,
        'Ce document ne peut pas encore être consulté.',
      );
    }
    const expiresInSeconds = this.config.get<number>('VERIFICATION_VIEW_URL_TTL_SECONDS', 300);
    const token = signDocumentToken(
      {
        purpose: 'download',
        documentId: document.id,
        storageKey: document.storageKey,
        sessionId: admin.sessionId,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
      this.config.get<string>('DOCUMENT_SIGNING_SECRET', ''),
    );

    await this.audit.writeFromRequest(request, admin, {
      action: 'DOCUMENT.VIEW_LINK_ISSUED',
      targetType: 'Document',
      targetId: document.id,
      after: { expiresInSeconds, purpose: 'admin-view' },
    });

    return {
      documentId: document.id,
      viewUrl: `/api/v1/admin/documents/view/${token}`,
      method: 'GET',
      expiresInSeconds,
    };
  }

  private validateDecision(dto: VerificationDecisionDto): string {
    const htmlStripped = (dto.reasonText ?? '').replace(/<[^>]*>/g, '').trim();
    if (dto.reasonText && htmlStripped !== dto.reasonText.trim()) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Le motif ne doit pas contenir de HTML.',
      );
    }

    if (dto.decision === VerificationDecisionType.VERIFIED) {
      if (dto.reasonCode !== VerifiedReasonCode.VERIFIED_OK) {
        throw new ApiError(
          ERROR_CODES.VALIDATION_ERROR,
          400,
          'Une vérification acceptée exige le motif VERIFIED_OK.',
        );
      }
      return 'Vérification documentaire conforme.';
    }

    if (dto.reasonCode === VerifiedReasonCode.VERIFIED_OK) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'VERIFIED_OK est réservé aux vérifications acceptées.',
      );
    }
    if (htmlStripped.length < 20 || htmlStripped.length > 1000) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Le motif doit contenir entre 20 et 1000 caractères.',
      );
    }
    if (
      dto.decision === VerificationDecisionType.COMPLEMENT_REQUESTED &&
      (!dto.requestedItems || dto.requestedItems.length === 0)
    ) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Au moins une pièce à fournir est requise.',
      );
    }
    return htmlStripped;
  }

  private parseStatuses(raw: string): ProfessionalStatus[] {
    const values = raw
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const allowed = Object.values(ProfessionalStatus) as string[];
    const invalid = values.filter((value) => !allowed.includes(value));
    if (invalid.length > 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Statut de vérification invalide.', {
        invalid,
      });
    }
    return values as ProfessionalStatus[];
  }

  private toSummary(
    profile: ProfileWithRelations,
    documents: Prisma.DocumentGetPayload<object>[],
  ): VerificationSummaryDto {
    const sla = getSlaConfig(this.config);
    const info = computeSla(profile.submittedAt, sla);
    return {
      id: profile.id,
      profileId: profile.id,
      phone: profile.user.phone,
      status: profile.status,
      submittedAt: profile.submittedAt,
      slaDueAt: info.dueAt,
      ageDays: info.ageDays,
      overdue: info.overdue,
      specialties: profile.specialties.map((item) => item.specialty.code),
      zones: profile.zones.map((item) => item.zone.code),
      documents: documents.map((document) => this.toDocumentDto(document)),
    };
  }

  private async loadDocuments(
    userIds: string[],
  ): Promise<Map<string, Prisma.DocumentGetPayload<object>[]>> {
    const result = new Map<string, Prisma.DocumentGetPayload<object>[]>();
    if (userIds.length === 0) {
      return result;
    }
    const documents = await this.prisma.document.findMany({
      where: { ownerId: { in: userIds } },
      orderBy: { createdAt: 'desc' },
    });
    for (const userId of userIds) {
      result.set(
        userId,
        documents.filter((document) => document.ownerId === userId),
      );
    }
    return result;
  }

  private toDocumentDto(document: Prisma.DocumentGetPayload<object>): VerificationDocumentDto {
    return {
      id: document.id,
      type: document.type,
      status: document.status,
      fileName: document.fileName,
      uploadedAt: document.uploadedAt,
      expiresAt: document.expiresAt,
    };
  }
}
