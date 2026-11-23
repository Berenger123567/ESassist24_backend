import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfessionalStatus, VerificationDecisionType } from '@prisma/client';

export class VerificationDecisionResponseDto {
  @ApiProperty()
  decisionId: string;

  @ApiProperty()
  profileId: string;

  @ApiProperty({ enum: VerificationDecisionType })
  decision: VerificationDecisionType;

  @ApiProperty({ enum: ProfessionalStatus })
  profileStatus: ProfessionalStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  complementDueAt: Date | null;

  @ApiProperty()
  replayed: boolean;
}
