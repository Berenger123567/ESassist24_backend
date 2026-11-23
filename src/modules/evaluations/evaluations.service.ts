import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EvaluationAssignmentStatus,
  NotificationType,
  Prisma,
  ProfessionalStatus,
  RoleCode,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CertificationBadgeDto,
  CertificationEvaluationDto,
  CertificationResponseDto,
  CertificationSummaryDto,
} from './dto/certification.dto';
import {
  CreateEvaluationAssignmentDto,
  EvaluationAssignmentPageDto,
  EvaluationAssignmentQueryDto,
  EvaluationAssignmentResponseDto,
  EvaluationEvaluatorSummaryDto,
  EvaluationGridSummaryDto,
  EvaluationProfileSummaryDto,
  EvaluationResultResponseDto,
  EvaluationSubmissionResponseDto,
  SaveEvaluationResultsDto,
} from './dto/evaluation-assignment.dto';
import {
  CreateEvaluationCriterionDto,
  CreateEvaluationGridDto,
  EvaluationCriterionResponseDto,
  EvaluationGridPageDto,
  EvaluationGridResponseDto,
  ReplaceEvaluationCriteriaDto,
  UpdateEvaluationGridDto,
} from './dto/evaluation-grid.dto';
import { EvaluatorPageDto, EvaluatorQueryDto } from './dto/evaluator.dto';
import { calculateEvaluationScore, hasDuplicateIds } from './evaluation-score.util';

const CERTIFIED_LABEL = 'Certifié ÉLECTRO ASSIST';

type GridWithCriteria = Prisma.EvaluationGridGetPayload<{ include: { criteria: true } }>;

type AssignmentWithRelations = Prisma.EvaluationAssignmentGetPayload<{
  include: {
    grid: { include: { criteria: true } };
    profile: true;
    evaluator: true;
    results: { include: { criterion: true } };
    submission: true;
  };
}>;

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async listGrids(): Promise<EvaluationGridPageDto> {
    const grids = await this.prisma.evaluationGrid.findMany({
      include: { criteria: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return { data: grids.map((grid) => this.toGridResponse(grid)) };
  }

  async getGrid(id: string): Promise<EvaluationGridResponseDto> {
    const grid = await this.findGrid(id);
    return this.toGridResponse(grid);
  }

  async createGrid(
    admin: AuthUser,
    dto: CreateEvaluationGridDto,
    request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    const grid = await this.prisma.$transaction(async (tx) => {
      const created = await tx.evaluationGrid.create({
        data: {
          code: dto.code,
          label: dto.label,
          description: dto.description ?? null,
          passScore: dto.passScore ?? this.defaultPassScore(),
          active: dto.active ?? true,
        },
        include: { criteria: true },
      });
      await this.audit.writeFromRequest(
        request,
        admin,
        {
          action: 'EVALUATION.GRID_CREATED',
          targetType: 'EvaluationGrid',
          targetId: created.id,
          after: this.toGridResponse(created),
        },
        tx,
      );
      return created;
    });
    return this.toGridResponse(grid);
  }

  async updateGrid(
    admin: AuthUser,
    id: string,
    dto: UpdateEvaluationGridDto,
    request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    const existing = await this.findGrid(id);
    if (
      dto.label === undefined &&
      dto.description === undefined &&
      dto.passScore === undefined &&
      dto.active === undefined
    ) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Aucune modification fournie.');
    }

    const grid = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationGrid.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          ...(dto.passScore !== undefined ? { passScore: dto.passScore } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          version: { increment: 1 },
        },
        include: { criteria: { orderBy: { sortOrder: 'asc' } } },
      });
      await this.audit.writeFromRequest(
        request,
        admin,
        {
          action: 'EVALUATION.GRID_UPDATED',
          targetType: 'EvaluationGrid',
          targetId: id,
          before: this.toGridResponse(existing),
          after: this.toGridResponse(updated),
        },
        tx,
      );
      return updated;
    });
    return this.toGridResponse(grid);
  }

  async replaceCriteria(
    admin: AuthUser,
    id: string,
    dto: ReplaceEvaluationCriteriaDto,
    request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    const existing = await this.findGrid(id);
    const assignments = await this.prisma.evaluationAssignment.count({ where: { gridId: id } });
    if (assignments > 0) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_GRID_LOCKED,
        409,
        'Cette grille est utilisée par une assignation et ne peut plus être modifiée.',
      );
    }
    this.validateCriteria(dto.criteria);

    const grid = await this.prisma.$transaction(async (tx) => {
      await tx.evaluationCriterion.deleteMany({ where: { gridId: id } });
      await tx.evaluationCriterion.createMany({
        data: dto.criteria.map((criterion, index) => ({
          gridId: id,
          code: criterion.code,
          label: criterion.label,
          description: criterion.description ?? null,
          weight: criterion.weight,
          sortOrder: criterion.sortOrder ?? index,
          active: criterion.active ?? true,
        })),
      });
      const updated = await tx.evaluationGrid.update({
        where: { id },
        data: { version: { increment: 1 } },
        include: { criteria: { orderBy: { sortOrder: 'asc' } } },
      });
      await this.audit.writeFromRequest(
        request,
        admin,
        {
          action: 'EVALUATION.GRID_CRITERIA_REPLACED',
          targetType: 'EvaluationGrid',
          targetId: id,
          before: { criteria: existing.criteria },
          after: { criteria: updated.criteria },
        },
        tx,
      );
      return updated;
    });
    return this.toGridResponse(grid);
  }

  async listEvaluators(query: EvaluatorQueryDto): Promise<EvaluatorPageDto> {
    const users = await this.prisma.userRole.findMany({
      where: {
        role: { code: RoleCode.EVALUATOR },
        user: query.search
          ? {
              OR: [
                { phone: { contains: query.search } },
                { firstName: { contains: query.search, mode: 'insensitive' } },
                { lastName: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : undefined,
      },
      include: { user: true },
      take: query.limit ?? 50,
      orderBy: { user: { firstName: 'asc' } },
    });

    const counts = await this.prisma.evaluationAssignment.groupBy({
      by: ['evaluatorId', 'status'],
      _count: { _all: true },
    });

    return {
      data: users.map(({ user }) => {
        const activeAssignments = counts
          .filter(
            (count) =>
              count.evaluatorId === user.id &&
              count.status !== EvaluationAssignmentStatus.SUBMITTED,
          )
          .reduce((total, count) => total + count._count._all, 0);
        const completedAssignments = counts
          .filter(
            (count) =>
              count.evaluatorId === user.id &&
              count.status === EvaluationAssignmentStatus.SUBMITTED,
          )
          .reduce((total, count) => total + count._count._all, 0);
        return {
          userId: user.id,
          phone: user.phone,
          firstName: user.firstName,
          lastName: user.lastName,
          activeAssignments,
          completedAssignments,
        };
      }),
    };
  }

  async assign(
    admin: AuthUser,
    dto: CreateEvaluationAssignmentDto,
    request: ContextualRequest,
  ): Promise<EvaluationAssignmentResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: dto.profileId },
    });
    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }
    if (profile.status === ProfessionalStatus.CERTIFIED) {
      throw new ApiError(
        ERROR_CODES.CERTIFICATION_NOT_ELIGIBLE,
        409,
        'Ce professionnel est déjà certifié.',
      );
    }
    if (profile.status !== ProfessionalStatus.VERIFIED) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_PROFILE_NOT_VERIFIED,
        409,
        'Seuls les profils vérifiés peuvent être évalués.',
      );
    }

    const grid = await this.findGrid(dto.gridId);
    if (!grid.active) {
      throw new ApiError(ERROR_CODES.EVALUATION_GRID_INACTIVE, 409, 'Cette grille est inactive.');
    }

    const evaluatorRole = await this.prisma.userRole.findFirst({
      where: { userId: dto.evaluatorId, role: { code: RoleCode.EVALUATOR } },
    });
    if (!evaluatorRole) {
      throw new ApiError(ERROR_CODES.EVALUATOR_NOT_FOUND, 404, 'Évaluateur introuvable.', {
        evaluatorId: dto.evaluatorId,
      });
    }

    const dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.dueAt && (Number.isNaN(dueAt?.getTime()) || (dueAt?.getTime() ?? 0) <= Date.now())) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_DUE_DATE_INVALID,
        422,
        'La date d’échéance doit être dans le futur.',
      );
    }

    const existing = await this.prisma.evaluationAssignment.findFirst({
      where: {
        profileId: dto.profileId,
        status: { not: EvaluationAssignmentStatus.SUBMITTED },
      },
    });
    if (existing) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_ALREADY_ASSIGNED,
        409,
        'Une évaluation est déjà en cours pour ce profil.',
      );
    }

    const assignment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.evaluationAssignment.create({
        data: {
          gridId: dto.gridId,
          profileId: dto.profileId,
          evaluatorId: dto.evaluatorId,
          assignedByAdminId: admin.id,
          dueAt,
          notes: dto.notes ?? null,
        },
      });
      const notification = await this.notifications.createForUser(
        dto.evaluatorId,
        {
          type: NotificationType.EVALUATION_ASSIGNED,
          title: 'Nouvelle évaluation assignée',
          body: `Une évaluation vous a été assignée pour la grille ${grid.code}.`,
          entityId: created.id,
          route: `/evaluator/assignments/${created.id}`,
          data: { assignmentId: created.id, gridId: grid.id },
        },
        tx,
      );
      await this.audit.writeFromRequest(
        request,
        admin,
        {
          action: 'EVALUATION.ASSIGNED',
          targetType: 'EvaluationAssignment',
          targetId: created.id,
          after: {
            assignmentId: created.id,
            profileId: dto.profileId,
            evaluatorId: dto.evaluatorId,
            gridId: dto.gridId,
          },
        },
        tx,
      );
      return { created, outboxIds: notification.outboxIds };
    });

    await this.notifications.enqueue(assignment.outboxIds);
    return this.getAssignment(assignment.created.id);
  }

  async listAssignments(query: EvaluationAssignmentQueryDto): Promise<EvaluationAssignmentPageDto> {
    const where: Prisma.EvaluationAssignmentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.evaluatorId) where.evaluatorId = query.evaluatorId;
    if (query.profileId) where.profileId = query.profileId;

    const limit = query.limit ?? 50;
    const assignments = await this.prisma.evaluationAssignment.findMany({
      where,
      include: this.assignmentInclude(),
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = assignments.length > limit;
    const page = hasMore ? assignments.slice(0, limit) : assignments;
    return {
      data: page.map((assignment) => this.toAssignmentResponse(assignment)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getAssignment(id: string): Promise<EvaluationAssignmentResponseDto> {
    const assignment = await this.prisma.evaluationAssignment.findUnique({
      where: { id },
      include: this.assignmentInclude(),
    });
    if (!assignment) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_ASSIGNMENT_NOT_FOUND,
        404,
        'Assignation introuvable.',
      );
    }
    return this.toAssignmentResponse(assignment);
  }

  async listMyAssignments(
    evaluator: AuthUser,
    query: EvaluationAssignmentQueryDto,
  ): Promise<EvaluationAssignmentPageDto> {
    const where: Prisma.EvaluationAssignmentWhereInput = { evaluatorId: evaluator.id };
    if (query.status) where.status = query.status;
    const limit = query.limit ?? 50;
    const assignments = await this.prisma.evaluationAssignment.findMany({
      where,
      include: this.assignmentInclude(),
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = assignments.length > limit;
    const page = hasMore ? assignments.slice(0, limit) : assignments;
    return {
      data: page.map((assignment) => this.toAssignmentResponse(assignment)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getMyAssignment(evaluator: AuthUser, id: string): Promise<EvaluationAssignmentResponseDto> {
    const assignment = await this.prisma.evaluationAssignment.findUnique({
      where: { id },
      include: this.assignmentInclude(),
    });
    if (!assignment || assignment.evaluatorId !== evaluator.id) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_NOT_ASSIGNED_TO_EVALUATOR,
        404,
        'Assignation introuvable.',
      );
    }
    return this.toAssignmentResponse(assignment);
  }

  async saveResults(
    evaluator: AuthUser,
    id: string,
    dto: SaveEvaluationResultsDto,
    request: ContextualRequest,
  ): Promise<EvaluationAssignmentResponseDto> {
    const assignment = await this.requireOwnedAssignment(evaluator, id);
    this.validateResults(assignment, dto);

    await this.prisma.$transaction(async (tx) => {
      for (const result of dto.results) {
        await tx.evaluationResult.upsert({
          where: {
            assignmentId_criterionId: { assignmentId: id, criterionId: result.criterionId },
          },
          create: {
            assignmentId: id,
            criterionId: result.criterionId,
            score: result.score,
            comment: result.comment ?? null,
          },
          update: {
            score: result.score,
            comment: result.comment ?? null,
          },
        });
      }
      await tx.evaluationAssignment.update({
        where: { id },
        data: { status: EvaluationAssignmentStatus.IN_PROGRESS },
      });
      await this.audit.writeFromRequest(
        request,
        evaluator,
        {
          action: 'EVALUATION.RESULTS_SAVED',
          targetType: 'EvaluationAssignment',
          targetId: id,
          after: { results: dto.results },
        },
        tx,
      );
    });

    return this.getMyAssignment(evaluator, id);
  }

  async submit(
    evaluator: AuthUser,
    id: string,
    request: ContextualRequest,
  ): Promise<EvaluationSubmissionResponseDto> {
    const assignment = await this.requireOwnedAssignment(evaluator, id);
    const resultRows = await this.prisma.evaluationResult.findMany({ where: { assignmentId: id } });
    const computation = calculateEvaluationScore(
      assignment.grid.criteria.map((criterion) => ({
        id: criterion.id,
        weight: criterion.weight,
        active: criterion.active,
      })),
      resultRows.map((result) => ({ criterionId: result.criterionId, score: result.score })),
    );
    if (computation.missingCriterionIds.length > 0) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_INCOMPLETE,
        422,
        'Tous les critères actifs doivent être évalués avant la soumission.',
        { missingCriterionIds: computation.missingCriterionIds },
      );
    }
    if (computation.invalidCriterionIds.length > 0 || computation.invalidScoreIds.length > 0) {
      throw new ApiError(ERROR_CODES.EVALUATION_SCORE_INVALID, 422, 'Score ou critère invalide.');
    }

    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: assignment.profileId },
    });
    if (!profile || profile.status === ProfessionalStatus.CERTIFIED) {
      throw new ApiError(
        ERROR_CODES.CERTIFICATION_NOT_ELIGIBLE,
        409,
        'Ce profil n’est plus éligible à la certification.',
      );
    }
    if (profile.status !== ProfessionalStatus.VERIFIED) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_PROFILE_NOT_VERIFIED,
        409,
        'Seuls les profils vérifiés peuvent être certifiés.',
      );
    }

    const passed = computation.score >= assignment.grid.passScore;
    const outcome = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationAssignment.updateMany({
        where: {
          id,
          status: { not: EvaluationAssignmentStatus.SUBMITTED },
        },
        data: {
          status: EvaluationAssignmentStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(
          ERROR_CODES.EVALUATION_ALREADY_SUBMITTED,
          409,
          'Cette évaluation a déjà été soumise.',
        );
      }

      const submission = await tx.evaluationSubmission.create({
        data: {
          assignmentId: id,
          evaluatorId: evaluator.id,
          score: computation.score,
          passed,
        },
      });

      if (passed) {
        await tx.professionalProfile.update({
          where: { id: assignment.profileId },
          data: {
            status: ProfessionalStatus.CERTIFIED,
            certifiedAt: new Date(),
            evaluationSubmissionId: submission.id,
          },
        });
      }

      const notification = await this.notifications.createForUser(
        profile.userId,
        {
          type: passed
            ? NotificationType.CERTIFICATION_OBTAINED
            : NotificationType.EVALUATION_SUBMITTED,
          title: passed ? 'Certification obtenue' : 'Évaluation terminée',
          body: passed
            ? `${CERTIFIED_LABEL} : votre évaluation est réussie.`
            : 'Votre évaluation a été soumise.',
          entityId: submission.id,
          route: '/pro/certification',
          data: { submissionId: submission.id, score: computation.score, passed },
        },
        tx,
      );

      await this.audit.writeFromRequest(
        request,
        evaluator,
        {
          action: 'EVALUATION.SUBMITTED',
          targetType: 'EvaluationAssignment',
          targetId: id,
          after: {
            submissionId: submission.id,
            score: computation.score,
            passed,
            profileStatus: passed ? ProfessionalStatus.CERTIFIED : profile.status,
          },
        },
        tx,
      );
      if (passed) {
        await this.audit.write(
          {
            actorId: evaluator.id,
            actorRole: RoleCode.EVALUATOR,
            action: 'CERTIFICATION.OBTAINED',
            targetType: 'ProfessionalProfile',
            targetId: assignment.profileId,
            after: { certifiedAt: new Date(), badge: CERTIFIED_LABEL },
            ip: request.ip,
            requestId: request.requestId,
          },
          tx,
        );
      }
      return { submission, outboxIds: notification.outboxIds };
    });

    await this.notifications.enqueue(outcome.outboxIds);
    return this.toSubmissionResponse(outcome.submission);
  }

  async getCertification(userId: string): Promise<CertificationResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: {
        certificationSubmission: {
          include: { assignment: { include: { grid: true } } },
        },
      },
    });
    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }

    const certified = profile.status === ProfessionalStatus.CERTIFIED;
    const badge = certified ? this.badge() : null;
    const evaluation = profile.certificationSubmission
      ? this.toCertificationEvaluation(profile.certificationSubmission)
      : null;
    return {
      status: certified ? ProfessionalStatus.CERTIFIED : profile.status,
      label: certified ? CERTIFIED_LABEL : null,
      isDiploma: false,
      certifiedAt: profile.certifiedAt,
      badge,
      evaluation,
    };
  }

  getCertificationSummary(
    status: ProfessionalStatus,
    certifiedAt: Date | null,
  ): CertificationSummaryDto {
    const certified = status === ProfessionalStatus.CERTIFIED;
    return {
      status: certified ? ProfessionalStatus.CERTIFIED : status,
      label: certified ? CERTIFIED_LABEL : null,
      certifiedAt,
      isDiploma: false,
    };
  }

  private async findGrid(id: string): Promise<GridWithCriteria> {
    const grid = await this.prisma.evaluationGrid.findUnique({
      where: { id },
      include: { criteria: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!grid) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_GRID_NOT_FOUND,
        404,
        'Grille d’évaluation introuvable.',
      );
    }
    return grid;
  }

  private validateCriteria(criteria: CreateEvaluationCriterionDto[]): void {
    const codes = criteria.map((criterion) => criterion.code);
    if (hasDuplicateIds(codes)) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_GRID_CRITERIA_INVALID,
        422,
        'Les codes de critères doivent être uniques.',
      );
    }
    const totalWeight = criteria
      .filter((criterion) => criterion.active !== false)
      .reduce((total, criterion) => total + criterion.weight, 0);
    if (totalWeight !== 100) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_GRID_CRITERIA_INVALID,
        422,
        'La somme des poids des critères actifs doit valoir 100.',
        { totalWeight },
      );
    }
  }

  private validateResults(
    assignment: AssignmentWithRelations,
    dto: SaveEvaluationResultsDto,
  ): void {
    const activeCriteria = new Map(
      assignment.grid.criteria
        .filter((criterion) => criterion.active)
        .map((criterion) => [criterion.id, criterion]),
    );
    const ids = dto.results.map((result) => result.criterionId);
    if (hasDuplicateIds(ids)) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_SCORE_INVALID,
        422,
        'Un critère ne peut être évalué qu’une seule fois.',
      );
    }
    for (const result of dto.results) {
      const criterion = activeCriteria.get(result.criterionId);
      if (!criterion) {
        throw new ApiError(
          ERROR_CODES.EVALUATION_SCORE_INVALID,
          422,
          'Critère de la grille introuvable ou inactif.',
          { criterionId: result.criterionId },
        );
      }
      if (result.score < 0 || result.score > criterion.weight) {
        throw new ApiError(
          ERROR_CODES.EVALUATION_SCORE_INVALID,
          422,
          'Le score dépasse le poids du critère.',
          { criterionId: result.criterionId, maxScore: criterion.weight },
        );
      }
    }
  }

  private async requireOwnedAssignment(
    evaluator: AuthUser,
    id: string,
  ): Promise<AssignmentWithRelations> {
    const assignment = await this.prisma.evaluationAssignment.findUnique({
      where: { id },
      include: this.assignmentInclude(),
    });
    if (!assignment || assignment.evaluatorId !== evaluator.id) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_NOT_ASSIGNED_TO_EVALUATOR,
        404,
        'Assignation introuvable.',
      );
    }
    if (assignment.status === EvaluationAssignmentStatus.SUBMITTED) {
      throw new ApiError(
        ERROR_CODES.EVALUATION_ALREADY_SUBMITTED,
        409,
        'Cette évaluation a déjà été soumise.',
      );
    }
    return assignment;
  }

  private assignmentInclude() {
    return {
      grid: { include: { criteria: { orderBy: { sortOrder: 'asc' as const } } } },
      profile: true,
      evaluator: true,
      results: { include: { criterion: true } },
      submission: true,
    } satisfies Prisma.EvaluationAssignmentInclude;
  }

  private defaultPassScore(): number {
    const configured = Number(this.config.get('EVALUATION_PASS_PERCENT') ?? 70);
    return Number.isInteger(configured) && configured >= 1 && configured <= 100 ? configured : 70;
  }

  private badge(): CertificationBadgeDto {
    return { label: CERTIFIED_LABEL, kind: 'BADGE', isDiploma: false };
  }

  private toCertificationEvaluation(
    submission: Prisma.EvaluationSubmissionGetPayload<{
      include: { assignment: { include: { grid: true } } };
    }>,
  ): CertificationEvaluationDto {
    return {
      submissionId: submission.id,
      assignmentId: submission.assignmentId,
      gridCode: submission.assignment.grid.code,
      score: submission.score,
      passed: submission.passed,
      submittedAt: submission.createdAt,
    };
  }

  private toGridResponse(grid: GridWithCriteria): EvaluationGridResponseDto {
    return {
      id: grid.id,
      code: grid.code,
      label: grid.label,
      description: grid.description,
      version: grid.version,
      passScore: grid.passScore,
      active: grid.active,
      criteria: grid.criteria.map((criterion) => this.toCriterionResponse(criterion)),
      createdAt: grid.createdAt,
      updatedAt: grid.updatedAt,
    };
  }

  private toCriterionResponse(criterion: {
    id: string;
    code: string;
    label: string;
    description: string | null;
    weight: number;
    sortOrder: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): EvaluationCriterionResponseDto {
    return {
      id: criterion.id,
      code: criterion.code,
      label: criterion.label,
      description: criterion.description,
      weight: criterion.weight,
      sortOrder: criterion.sortOrder,
      active: criterion.active,
      createdAt: criterion.createdAt,
      updatedAt: criterion.updatedAt,
    };
  }

  private toAssignmentResponse(
    assignment: AssignmentWithRelations,
  ): EvaluationAssignmentResponseDto {
    const grid: EvaluationGridSummaryDto = {
      id: assignment.grid.id,
      code: assignment.grid.code,
      label: assignment.grid.label,
      passScore: assignment.grid.passScore,
    };
    const profile: EvaluationProfileSummaryDto = {
      id: assignment.profile.id,
      userId: assignment.profile.userId,
      status: assignment.profile.status,
    };
    const evaluator: EvaluationEvaluatorSummaryDto = {
      id: assignment.evaluator.id,
      phone: assignment.evaluator.phone,
      firstName: assignment.evaluator.firstName,
      lastName: assignment.evaluator.lastName,
    };
    const results: EvaluationResultResponseDto[] = assignment.results.map((result) => ({
      id: result.id,
      criterionId: result.criterionId,
      criterionCode: result.criterion.code,
      criterionLabel: result.criterion.label,
      score: result.score,
      maxScore: result.criterion.weight,
      comment: result.comment,
      updatedAt: result.updatedAt,
    }));
    return {
      id: assignment.id,
      status: assignment.status,
      dueAt: assignment.dueAt,
      notes: assignment.notes,
      submittedAt: assignment.submittedAt,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      grid,
      profile,
      evaluator,
      criteria: assignment.grid.criteria.map((criterion) => this.toCriterionResponse(criterion)),
      results,
      submission: assignment.submission ? this.toSubmissionResponse(assignment.submission) : null,
    };
  }

  private toSubmissionResponse(submission: {
    id: string;
    score: number;
    passed: boolean;
    createdAt: Date;
  }): EvaluationSubmissionResponseDto {
    return {
      id: submission.id,
      score: submission.score,
      passed: submission.passed,
      createdAt: submission.createdAt,
    };
  }
}
