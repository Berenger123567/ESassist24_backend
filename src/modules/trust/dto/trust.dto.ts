import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AppealStatus,
  ClaimStatus,
  GuaranteeStatus,
  ReputationLevel,
  ReviewStatus,
  SuspicionReason,
  SuspensionStatus,
} from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  quality: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  timeliness: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  behaviour: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  quoteCompliance: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  safety: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  comment?: string;
}

export class CreateReviewReplyDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class CreateReviewContestDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class AdminReviewQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ReviewStatus })
  @IsOptional()
  @IsEnum(ReviewStatus)
  status?: ReviewStatus;
}

export class ClaimQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @ApiPropertyOptional({ description: 'Réclamation avec au moins un dépassement de SLA' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  slaBreached?: boolean;
}

export class GuaranteeQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: GuaranteeStatus })
  @IsOptional()
  @IsEnum(GuaranteeStatus)
  status?: GuaranteeStatus;
}

export class SuspensionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: SuspensionStatus })
  @IsOptional()
  @IsEnum(SuspensionStatus)
  status?: SuspensionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  professionalProfileId?: string;
}

export class CreateClaimDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  missionId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  respondentProfileId?: string;

  @ApiProperty({ minLength: 5, maxLength: 200 })
  @IsString()
  @Length(5, 200)
  subject: string;

  @ApiProperty({ minLength: 20, maxLength: 5000 })
  @IsString()
  @Length(20, 5000)
  description: string;
}

export class ResolveClaimDto {
  @ApiProperty({ minLength: 10, maxLength: 5000 })
  @IsString()
  @Length(10, 5000)
  resolution: string;
}

export class EscalateClaimDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  reason: string;
}

export class SuspendProfessionalDto {
  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @Length(10, 1000)
  reason: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  evidence?: Record<string, unknown>;
}

export class CreateAppealDto {
  @ApiProperty({ minLength: 10, maxLength: 2000 })
  @IsString()
  @Length(10, 2000)
  body: string;
}

export class DecideAppealDto {
  @ApiProperty({ enum: [AppealStatus.ACCEPTED, AppealStatus.REJECTED] })
  @IsEnum([AppealStatus.ACCEPTED, AppealStatus.REJECTED])
  decision: typeof AppealStatus.ACCEPTED | typeof AppealStatus.REJECTED;

  @ApiPropertyOptional({ minLength: 10, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(10, 1000)
  reason?: string;
}

export class ReviewFlagResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ enum: SuspicionReason })
  reason: SuspicionReason;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  detail: Record<string, unknown> | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class ReviewReplyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  reviewId: string;

  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class ReviewContestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  reviewId: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: AppealStatus })
  status: AppealStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;
}

export class ReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  quality: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  timeliness: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  behaviour: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  quoteCompliance: number;

  @ApiProperty({ minimum: 1, maximum: 5 })
  safety: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  weightedScore: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  comment: string | null;

  @ApiProperty({ enum: ReviewStatus })
  status: ReviewStatus;

  @ApiPropertyOptional({ type: ReviewReplyResponseDto, nullable: true })
  response: ReviewReplyResponseDto | null;

  @ApiPropertyOptional({ type: [ReviewFlagResponseDto] })
  flags?: ReviewFlagResponseDto[];

  @ApiPropertyOptional({ type: ReviewContestResponseDto, nullable: true })
  contest?: ReviewContestResponseDto | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class ReviewPageDto {
  @ApiProperty({ type: [ReviewResponseDto] })
  data: ReviewResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class ReputationCountsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  published: number;

  @ApiProperty()
  suspicious: number;

  @ApiProperty()
  contested: number;

  @ApiProperty()
  rejected: number;
}

export class ReputationResponseDto {
  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty({ minimum: 0, maximum: 5 })
  score: number;

  @ApiProperty({ enum: ReputationLevel })
  level: ReputationLevel;

  @ApiProperty()
  missionCount: number;

  @ApiProperty({ type: ReputationCountsDto })
  counts: ReputationCountsDto;

  @ApiProperty({ minimum: 0, maximum: 5 })
  recentScore: number | null;

  @ApiProperty({ description: 'Écart entre le score récent et le score global' })
  trend: number;

  @ApiProperty({ format: 'date-time' })
  generatedAt: Date;
}

export class TrustIndicatorsDto {
  @ApiProperty()
  reviewsTotal: number;

  @ApiProperty()
  reviewsPublished: number;

  @ApiProperty()
  reviewsSuspicious: number;

  @ApiProperty()
  reviewsContested: number;

  @ApiProperty({ minimum: 0, maximum: 5 })
  averageScore: number;

  @ApiProperty()
  claimsTotal: number;

  @ApiProperty({ minimum: 0, maximum: 1 })
  slaBreachRate: number;

  @ApiProperty()
  openClaims: number;

  @ApiProperty()
  activeGuarantees: number;

  @ApiProperty()
  activeSuspensions: number;

  @ApiProperty({ format: 'date-time' })
  generatedAt: Date;
}

export class ClaimResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  number: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  missionId: string | null;

  @ApiProperty({ format: 'uuid' })
  claimantId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  respondentProfileId: string | null;

  @ApiProperty()
  subject: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: ClaimStatus })
  status: ClaimStatus;

  @ApiProperty({ format: 'date-time' })
  ackDueAt: Date;

  @ApiProperty({ format: 'date-time' })
  resolutionDueAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  acknowledgedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  resolvedAt: Date | null;

  @ApiProperty({ description: 'Accusé de réception hors SLA' })
  ackSlaBreached: boolean;

  @ApiProperty({ description: 'Résolution hors SLA' })
  resolutionSlaBreached: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class ClaimPageDto {
  @ApiProperty({ type: [ClaimResponseDto] })
  data: ClaimResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class GuaranteeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty()
  coverageCents: number;

  @ApiProperty()
  currency: string;

  @ApiProperty({ format: 'date-time' })
  validFrom: Date;

  @ApiProperty({ format: 'date-time' })
  validUntil: Date;

  @ApiProperty({ enum: GuaranteeStatus })
  status: GuaranteeStatus;

  @ApiProperty()
  expired: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class GuaranteePageDto {
  @ApiProperty({ type: [GuaranteeResponseDto] })
  data: GuaranteeResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class AppealResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  suspensionId: string;

  @ApiProperty({ format: 'uuid' })
  submittedBy: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: AppealStatus })
  status: AppealStatus;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  decidedBy: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class SuspensionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty()
  reason: string;

  @ApiPropertyOptional({ type: Object, additionalProperties: true, nullable: true })
  evidence: Record<string, unknown> | null;

  @ApiProperty({ format: 'uuid' })
  suspendedBy: string;

  @ApiProperty({ format: 'date-time' })
  startedAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  endsAt: Date | null;

  @ApiProperty({ enum: SuspensionStatus })
  status: SuspensionStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  liftedAt: Date | null;

  @ApiProperty({ type: [AppealResponseDto] })
  appeals: AppealResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class SuspensionPageDto {
  @ApiProperty({ type: [SuspensionResponseDto] })
  data: SuspensionResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class AppealDecisionResponseDto {
  @ApiProperty({ type: AppealResponseDto })
  appeal: AppealResponseDto;

  @ApiProperty({ type: SuspensionResponseDto })
  suspension: SuspensionResponseDto;
}
