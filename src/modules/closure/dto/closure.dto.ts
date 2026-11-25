import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MissionStatus, QuoteStatus } from '@prisma/client';

export class QuoteLineDto {
  @ApiProperty({ example: 'Pièce de rechange' })
  @IsString()
  @Length(1, 200)
  label: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  @Max(1000)
  quantity: number;

  @ApiProperty({ example: 15000 })
  @IsInt()
  @Min(0)
  unitPriceCents: number;
}

export class CreateQuoteDto {
  @ApiProperty({ type: [QuoteLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];

  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 1000)
  notes?: string;
}

export class QuoteLineResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty()
  unitPriceCents: number;

  @ApiProperty()
  sortOrder: number;
}

export class QuoteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty()
  version: number;

  @ApiProperty({ enum: QuoteStatus })
  status: QuoteStatus;

  @ApiProperty({ format: 'date-time' })
  validUntil: Date;

  @ApiProperty()
  totalCents: number;

  @ApiProperty({ example: 'XOF' })
  currency: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  notes: string | null;

  @ApiProperty({ type: [QuoteLineResponseDto] })
  lines: QuoteLineResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class QuotePageDto {
  @ApiProperty({ type: [QuoteResponseDto] })
  data: QuoteResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class AuthorizeEmergencyDto {
  @ApiProperty({ example: 'Panne critique, accord verbal du client.' })
  @IsString()
  @Length(10, 1000)
  reason: string;
}

export class CreateMissionEventDto {
  @ApiProperty({ enum: ['DEPARTED', 'ARRIVED'], example: 'DEPARTED' })
  @IsString()
  type: 'DEPARTED' | 'ARRIVED';
}

export class MissionEventResponseDto {
  @ApiProperty({ example: '12' })
  id: string;

  @ApiProperty()
  type: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class CreateMissionPositionDto {
  @ApiProperty({ example: 14.7167, description: 'Latitude brute, arrondie côté serveur' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -17.4677, description: 'Longitude brute, arrondie côté serveur' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  accuracyMeters?: number;
}

export class ChecklistItemDto {
  @ApiProperty({ example: 'Consignation électrique' })
  @IsString()
  @Length(1, 200)
  label: string;

  @ApiProperty()
  @IsBoolean()
  critical: boolean;

  @ApiProperty()
  @IsBoolean()
  passed: boolean;
}

export class CreateServiceReportDto {
  @ApiProperty({ example: 'Remplacement du disjoncteur et test de mise sous tension.' })
  @IsString()
  @MinLength(20)
  @MaxLength(5000)
  summary: string;

  @ApiProperty({ type: [ChecklistItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist: ChecklistItemDto[];
}

export class ServiceReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  missionId: string;

  @ApiProperty()
  summary: string;

  @ApiProperty({ type: [ChecklistItemDto] })
  checklist: ChecklistItemDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class MissionStatusUpdateDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: MissionStatus })
  status: MissionStatus;
}

export class PositionAckDto {
  @ApiProperty({ example: true })
  stored: true;

  @ApiProperty({ example: 3, description: 'Nombre de décimales conservées' })
  precisionDigits: number;
}
