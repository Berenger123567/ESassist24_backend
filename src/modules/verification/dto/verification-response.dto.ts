import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentStatus, ProfessionalStatus } from '@prisma/client';

export class VerificationDocumentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ enum: DocumentStatus })
  status: DocumentStatus;

  @ApiProperty()
  fileName: string;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  uploadedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  expiresAt: Date | null;
}

export class VerificationSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  profileId: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ enum: ProfessionalStatus })
  status: ProfessionalStatus;

  @ApiProperty()
  submittedAt: Date;

  @ApiProperty()
  slaDueAt: Date;

  @ApiProperty()
  ageDays: number;

  @ApiProperty()
  overdue: boolean;

  @ApiProperty({ type: [String] })
  specialties: string[];

  @ApiProperty({ type: [String] })
  zones: string[];

  @ApiProperty({ type: [VerificationDocumentDto] })
  documents: VerificationDocumentDto[];
}

export class VerificationPageDto {
  @ApiProperty({ type: [VerificationSummaryDto] })
  data: VerificationSummaryDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class VerificationDetailDto extends VerificationSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty()
  experienceYears: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  bio: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  decisionReason: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  complementRequestedAt: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  complementDueAt: Date | null;
}
