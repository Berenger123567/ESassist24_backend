import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MissionStatus, ProposalStatus, ServiceRequestStatus } from '@prisma/client';
import { IsString, IsUUID, Length } from 'class-validator';

export class CreateProposalDto {
  @ApiProperty({ example: 'Je peux intervenir dans les 30 minutes.' })
  @IsString()
  @Length(10, 1000)
  message: string;
}

export class ProposalResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  requestId: string;

  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ enum: ProposalStatus })
  status: ProposalStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class ProposalPageDto {
  @ApiProperty({ type: [ProposalResponseDto] })
  data: ProposalResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class MissionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  requestId: string;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  proposalId: string | null;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty({ enum: MissionStatus })
  status: MissionStatus;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  previousProfessionalId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class MissionPageDto {
  @ApiProperty({ type: [MissionResponseDto] })
  data: MissionResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class ArrivalCodeResponseDto {
  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty({ example: '123456', description: 'Code visible uniquement par le professionnel' })
  code: string;

  @ApiProperty({ example: 600 })
  expiresInSeconds: number;
}

export class VerifyArrivalCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ReassignMissionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  professionalProfileId: string;

  @ApiProperty({ example: 'Indisponibilité du professionnel initial.' })
  @IsString()
  @Length(10, 500)
  reason: string;
}

export class RequestStatusResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: ServiceRequestStatus })
  status: ServiceRequestStatus;
}
