import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationAssignmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EvaluationCriterionResponseDto } from './evaluation-grid.dto';

export class CreateEvaluationAssignmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  profileId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  evaluatorId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  gridId: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class EvaluationAssignmentQueryDto {
  @ApiPropertyOptional({ enum: EvaluationAssignmentStatus })
  @IsOptional()
  @IsEnum(EvaluationAssignmentStatus)
  status?: EvaluationAssignmentStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  evaluatorId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  profileId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class EvaluationResultInputDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  criterionId: string;

  @ApiProperty({ example: 25, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  score: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class SaveEvaluationResultsDto {
  @ApiProperty({ type: [EvaluationResultInputDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => EvaluationResultInputDto)
  results: EvaluationResultInputDto[];
}

export class EvaluationProfileSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'VERIFIED' })
  status: string;
}

export class EvaluationGridSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ELEC-BATIMENT-V1' })
  code: string;

  @ApiProperty({ example: 'Grille électricité bâtiment' })
  label: string;

  @ApiProperty({ example: 70 })
  passScore: number;
}

export class EvaluationEvaluatorSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '+22900000000' })
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;
}

export class EvaluationResultResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  criterionId: string;

  @ApiProperty({ example: 'SECURITE' })
  criterionCode: string;

  @ApiProperty({ example: 'Sécurité électrique' })
  criterionLabel: string;

  @ApiProperty({ example: 25 })
  score: number;

  @ApiProperty({ example: 30 })
  maxScore: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  comment: string | null;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class EvaluationSubmissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 85 })
  score: number;

  @ApiProperty({ example: true })
  passed: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class EvaluationAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: EvaluationAssignmentStatus })
  status: EvaluationAssignmentStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  dueAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  submittedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ type: EvaluationGridSummaryDto })
  grid: EvaluationGridSummaryDto;

  @ApiProperty({ type: EvaluationProfileSummaryDto })
  profile: EvaluationProfileSummaryDto;

  @ApiProperty({ type: EvaluationEvaluatorSummaryDto })
  evaluator: EvaluationEvaluatorSummaryDto;

  @ApiProperty({ type: [EvaluationCriterionResponseDto] })
  criteria: EvaluationCriterionResponseDto[];

  @ApiProperty({ type: [EvaluationResultResponseDto] })
  results: EvaluationResultResponseDto[];

  @ApiPropertyOptional({ type: EvaluationSubmissionResponseDto, nullable: true })
  submission: EvaluationSubmissionResponseDto | null;
}

export class EvaluationAssignmentPageDto {
  @ApiProperty({ type: [EvaluationAssignmentResponseDto] })
  data: EvaluationAssignmentResponseDto[];

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  nextCursor: string | null;
}
