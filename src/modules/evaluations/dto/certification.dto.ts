import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CertificationBadgeDto {
  @ApiProperty({ example: 'Certifié ÉLECTRO ASSIST' })
  label: string;

  @ApiProperty({ example: 'BADGE' })
  kind: string;

  @ApiProperty({ example: false })
  isDiploma: boolean;
}

export class CertificationEvaluationDto {
  @ApiProperty({ format: 'uuid' })
  submissionId: string;

  @ApiProperty({ format: 'uuid' })
  assignmentId: string;

  @ApiProperty({ example: 'ELEC-BATIMENT-V1' })
  gridCode: string;

  @ApiProperty({ example: 85 })
  score: number;

  @ApiProperty({ example: true })
  passed: boolean;

  @ApiProperty({ format: 'date-time' })
  submittedAt: Date;
}

export class CertificationSummaryDto {
  @ApiProperty({ example: 'CERTIFIED' })
  status: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  label: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  certifiedAt: Date | null;

  @ApiProperty({ example: false })
  isDiploma: boolean;
}

export class CertificationResponseDto {
  @ApiProperty({ example: 'CERTIFIED' })
  status: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  label: string | null;

  @ApiProperty({ example: false })
  isDiploma: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  certifiedAt: Date | null;

  @ApiPropertyOptional({ type: CertificationBadgeDto, nullable: true })
  badge: CertificationBadgeDto | null;

  @ApiPropertyOptional({ type: CertificationEvaluationDto, nullable: true })
  evaluation: CertificationEvaluationDto | null;
}
