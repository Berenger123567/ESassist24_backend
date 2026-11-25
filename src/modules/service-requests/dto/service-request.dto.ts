import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceRequestStatus, ServiceRequestType, UrgencyLevel } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class CreateServiceRequestDto {
  @ApiProperty({ enum: ServiceRequestType })
  @IsEnum(ServiceRequestType)
  type: ServiceRequestType;

  @ApiProperty({ enum: UrgencyLevel })
  @IsEnum(UrgencyLevel)
  urgency: UrgencyLevel;

  @ApiProperty({ format: 'uuid', description: 'Zone approximative de la panne' })
  @IsUUID()
  zoneId: string;

  @ApiProperty({ example: 'Coupure générale dans l’appartement.' })
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid', maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID(undefined, { each: true })
  photoDocumentIds?: string[];
}

export class ServiceRequestQueryDto extends PaginationQueryDto {}

export class ZoneSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BJ-LIT-COTONOU' })
  code: string;

  @ApiProperty({ example: 'Cotonou' })
  name: string;

  @ApiProperty({ example: 'Littoral' })
  department: string;
}

export class ServiceRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  clientId: string;

  @ApiProperty({ enum: ServiceRequestType })
  type: ServiceRequestType;

  @ApiProperty({ enum: UrgencyLevel })
  urgency: UrgencyLevel;

  @ApiProperty({ format: 'uuid' })
  zoneId: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: ServiceRequestStatus })
  status: ServiceRequestStatus;

  @ApiProperty({ type: [String], format: 'uuid' })
  photoDocumentIds: string[];

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  cancelledAt: Date | null;

  @ApiProperty({ type: ZoneSummaryDto })
  zone: ZoneSummaryDto;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class ServiceRequestPageDto {
  @ApiProperty({ type: [ServiceRequestResponseDto] })
  data: ServiceRequestResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}
