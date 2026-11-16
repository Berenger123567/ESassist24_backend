import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ZoneSummaryDto } from '../../users/dto/me.dto';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateUserProfileDto {
  @ApiProperty({ example: 'Jean' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiProperty({ example: 'Dossou' })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  lastName: string;

  @ApiProperty({ format: 'uuid', description: 'Commune de résidence ou zone de service' })
  @IsUUID()
  zoneId: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Document photo de profil déjà téléversé' })
  @IsOptional()
  @IsUUID()
  photoDocumentId?: string;
}

export class UpdateProfessionalProfileDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(5)
  @IsUUID(undefined, { each: true })
  specialtyIds: string[];

  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(77)
  @IsUUID(undefined, { each: true })
  zoneIds: string[];

  @ApiProperty({ example: 8, minimum: 0, maximum: 60 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  experienceYears: number;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;
}

export class ProfessionalSpecialtyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SOLAR_PV' })
  code: string;

  @ApiProperty({ example: 'Solaire photovoltaïque' })
  label: string;
}

export class ProfessionalProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'PENDING' })
  status: string;

  @ApiProperty({ example: 'En attente' })
  statusLabel: string;

  @ApiProperty({ example: 8 })
  experienceYears: number;

  @ApiPropertyOptional({ nullable: true })
  bio: string | null;

  @ApiProperty({ format: 'date-time' })
  submittedAt: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  decidedAt: Date | null;

  @ApiPropertyOptional({ nullable: true })
  decisionReason: string | null;

  @ApiProperty({ type: [ProfessionalSpecialtyDto] })
  specialties: ProfessionalSpecialtyDto[];

  @ApiProperty({ type: [ZoneSummaryDto] })
  zones: ZoneSummaryDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
