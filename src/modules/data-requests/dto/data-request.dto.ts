import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DataRequestStatus, DataRequestType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const normalizeOptionalText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateDataRequestDto {
  @ApiProperty({
    enum: DataRequestType,
    enumName: 'DataRequestType',
    example: DataRequestType.EXPORT,
  })
  @IsEnum(DataRequestType)
  type: DataRequestType;

  @ApiPropertyOptional({ maxLength: 2000, example: 'Export de mes données personnelles' })
  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

export class UpdateDataRequestStatusDto {
  @ApiProperty({
    enum: DataRequestStatus,
    enumName: 'DataRequestStatus',
    example: DataRequestStatus.IN_PROGRESS,
  })
  @IsEnum(DataRequestStatus)
  status: DataRequestStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @Transform(normalizeOptionalText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolutionNote?: string;
}

export class DataRequestResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: DataRequestType, enumName: 'DataRequestType' })
  type: DataRequestType;

  @ApiProperty({ enum: DataRequestStatus, enumName: 'DataRequestStatus' })
  status: DataRequestStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  details: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  resolutionNote: string | null;

  @ApiProperty({ format: 'date-time' })
  requestedAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  resolvedAt: Date | null;
}

export class AdminDataRequestResponseDto extends DataRequestResponseDto {
  @ApiProperty({ example: '+22997000000' })
  userPhone: string;
}
