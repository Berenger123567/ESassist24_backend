import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityStatus, ProfessionalStatus, SpecialtyCode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ProfessionalSearchQueryDto {
  @ApiProperty({ example: 6.3703 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 2.3912 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ example: 10, description: 'Rayon en kilomètres' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radiusKm: number;

  @ApiPropertyOptional({ enum: SpecialtyCode })
  @IsOptional()
  @IsEnum(SpecialtyCode)
  specialtyCode?: SpecialtyCode;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  availableOnly?: boolean;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class PublicSpecialtyDto {
  @ApiProperty({ example: 'SOLAR_PV' })
  code: SpecialtyCode;

  @ApiProperty({ example: 'Solaire photovoltaïque' })
  label: string;
}

export class PublicZoneDto {
  @ApiProperty({ example: 'BJ-LIT-COTONOU' })
  code: string;

  @ApiProperty({ example: 'Cotonou' })
  name: string;

  @ApiProperty({ example: 'Littoral' })
  department: string;
}

export class PublicProfessionalProfileDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Jean D.' })
  displayName: string;

  @ApiProperty({ enum: [ProfessionalStatus.VERIFIED, ProfessionalStatus.CERTIFIED] })
  status: ProfessionalStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  certificationLabel: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  certifiedAt: Date | null;

  @ApiProperty({ example: 8 })
  experienceYears: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  bio: string | null;

  @ApiProperty({ type: [PublicSpecialtyDto] })
  specialties: PublicSpecialtyDto[];

  @ApiProperty({ type: [PublicZoneDto] })
  zones: PublicZoneDto[];

  @ApiProperty({ enum: AvailabilityStatus })
  availabilityStatus: AvailabilityStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  availableFrom: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  availableUntil: Date | null;

  @ApiPropertyOptional({ type: Number, nullable: true, example: 1250 })
  distanceMeters: number | null;
}

export class ProfessionalSearchResponseDto {
  @ApiProperty({ type: [PublicProfessionalProfileDto] })
  data: PublicProfessionalProfileDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class FavoriteResponseDto {
  @ApiProperty({ format: 'uuid' })
  professionalProfileId: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiPropertyOptional({ type: PublicProfessionalProfileDto })
  profile?: PublicProfessionalProfileDto;
}

export class FavoritePageDto {
  @ApiProperty({ type: [FavoriteResponseDto] })
  data: FavoriteResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class UpdateAvailabilityDto {
  @ApiProperty({ enum: AvailabilityStatus })
  @IsEnum(AvailabilityStatus)
  status: AvailabilityStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  availableFrom?: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  availableUntil?: string | null;
}

export class AvailabilityResponseDto {
  @ApiProperty({ enum: AvailabilityStatus })
  status: AvailabilityStatus;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  availableFrom: Date | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  availableUntil: Date | null;
}
