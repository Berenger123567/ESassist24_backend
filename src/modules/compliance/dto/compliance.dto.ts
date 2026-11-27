import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BackupStatus, LegalDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class PublishLegalDocumentDto {
  @ApiProperty({ enum: LegalDocumentType, example: LegalDocumentType.TERMS })
  @IsEnum(LegalDocumentType)
  type: LegalDocumentType;

  @ApiProperty({ example: '1.0.0', maxLength: 64 })
  @IsString()
  @Length(1, 64)
  version: string;

  @ApiProperty({ example: 'Conditions générales d’utilisation', maxLength: 200 })
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty({ example: 'Texte intégral en clair.' })
  @IsString()
  @Length(1, 100000)
  content: string;
}

export class LegalDocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: LegalDocumentType })
  type: LegalDocumentType;

  @ApiProperty({ example: '1.0.0' })
  version: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  content: string;

  @ApiProperty({ format: 'date-time' })
  publishedAt: Date;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;
}

export class LegalConsentItemDto {
  @ApiProperty({ enum: LegalDocumentType, example: LegalDocumentType.TERMS })
  @IsEnum(LegalDocumentType)
  type: LegalDocumentType;

  @ApiProperty({ example: '1.0.0', maxLength: 64 })
  @IsString()
  @Length(1, 64)
  version: string;
}

export class AcceptLegalDocumentsDto {
  @ApiPropertyOptional({ type: [LegalConsentItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LegalConsentItemDto)
  documents?: LegalConsentItemDto[];

  @ApiPropertyOptional({ enum: LegalDocumentType })
  @IsOptional()
  @IsEnum(LegalDocumentType)
  type?: LegalDocumentType;

  @ApiPropertyOptional({ example: '1.0.0', maxLength: 64 })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  version?: string;
}

export class LegalConsentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ enum: LegalDocumentType })
  documentType: LegalDocumentType;

  @ApiProperty()
  documentVersion: string;

  @ApiProperty()
  documentTitle: string;

  @ApiProperty({ format: 'date-time' })
  acceptedAt: Date;

  @ApiPropertyOptional({ type: String, nullable: true })
  ip: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  userAgent: string | null;
}

export class RecordBackupDto {
  @ApiProperty({ enum: BackupStatus, example: BackupStatus.SUCCESS })
  @IsEnum(BackupStatus)
  status: BackupStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;

  @ApiPropertyOptional({ example: 's3://backups/2026-11-27.sql.gz', maxLength: 500 })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  location?: string;

  @ApiProperty({
    example: 'a'.repeat(64),
    pattern: '^[a-fA-F0-9]{64}$',
    description: 'Empreinte SHA-256 en hexadécimal',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  checksum: string;
}

export class VerifyBackupDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  restoredAt: string;

  @ApiProperty({
    example: 'a'.repeat(64),
    pattern: '^[a-fA-F0-9]{64}$',
    description: 'Empreinte SHA-256 en hexadécimal',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/i)
  checksum: string;
}

export class BackupQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BackupStatus })
  @IsOptional()
  @IsEnum(BackupStatus)
  status?: BackupStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class BackupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ enum: BackupStatus })
  status: BackupStatus;

  @ApiProperty({ format: 'date-time' })
  startedAt: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  completedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiProperty()
  retentionDays: number;

  @ApiPropertyOptional({ type: Number, minimum: 0, nullable: true })
  sizeBytes: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  location: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  checksum: string | null;
}

export class BackupPageDto {
  @ApiProperty({ type: [BackupResponseDto] })
  data: BackupResponseDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class DependencyStatusDto {
  @ApiProperty()
  reachable: boolean;

  @ApiPropertyOptional()
  configured?: boolean;

  @ApiPropertyOptional()
  detail?: string;
}

export class ReadinessDependenciesDto {
  @ApiProperty({ type: DependencyStatusDto })
  prisma: DependencyStatusDto;

  @ApiProperty({ type: DependencyStatusDto })
  redis: DependencyStatusDto;
}

export class LegalDocumentPresenceDto {
  @ApiProperty({ enum: LegalDocumentType })
  type: LegalDocumentType;

  @ApiProperty()
  version: string;

  @ApiProperty()
  present: boolean;

  @ApiProperty()
  required: boolean;
}

export class MigrationInfoDto {
  @ApiProperty()
  available: boolean;

  @ApiPropertyOptional({ type: Number, nullable: true })
  applied: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastMigration: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  lastAppliedAt: Date | null;
}

export class ReadinessVersionsDto {
  @ApiProperty()
  app: string;

  @ApiProperty()
  contract: string;
}

export class ReadinessDto {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status: 'ok' | 'degraded';

  @ApiProperty({ format: 'date-time' })
  checkedAt: Date;

  @ApiProperty({ type: ReadinessDependenciesDto })
  dependencies: ReadinessDependenciesDto;

  @ApiProperty({ type: [LegalDocumentPresenceDto] })
  legalDocuments: LegalDocumentPresenceDto[];

  @ApiProperty({ type: MigrationInfoDto })
  migrations: MigrationInfoDto;

  @ApiProperty({ type: ReadinessVersionsDto })
  versions: ReadinessVersionsDto;
}

export class HelmetPostureDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  contentSecurityPolicy: boolean;
}

export class CorsPostureDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  credentials: boolean;

  @ApiProperty({ type: [String] })
  allowedOrigins: string[];
}

export class TrustProxyPostureDto {
  @ApiProperty()
  configured: boolean;

  @ApiProperty()
  cidrCount: number;
}

export class AdminIpAllowlistPostureDto {
  @ApiProperty()
  configured: boolean;

  @ApiProperty()
  cidrCount: number;

  @ApiProperty()
  devBypass: boolean;
}

export class RateLimitsPostureDto {
  @ApiProperty()
  adminMax: number;

  @ApiProperty()
  adminWindowSeconds: number;

  @ApiProperty()
  adminViewUrlMax: number;
}

export class ImmutableLedgerPostureDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  appendOnly: boolean;

  @ApiProperty()
  updatesForbidden: boolean;

  @ApiProperty()
  deletesForbidden: boolean;
}

export class SecurityPostureVersionsDto {
  @ApiProperty()
  app: string;

  @ApiProperty()
  contract: string;
}

export class SecurityPostureDto {
  @ApiProperty({ type: HelmetPostureDto })
  helmet: HelmetPostureDto;

  @ApiProperty({ type: CorsPostureDto })
  cors: CorsPostureDto;

  @ApiProperty({ type: TrustProxyPostureDto })
  trustProxy: TrustProxyPostureDto;

  @ApiProperty({ type: AdminIpAllowlistPostureDto })
  adminIpAllowlist: AdminIpAllowlistPostureDto;

  @ApiProperty({ example: 'api/v1' })
  globalPrefix: string;

  @ApiProperty({ type: RateLimitsPostureDto })
  rateLimits: RateLimitsPostureDto;

  @ApiProperty({ type: ImmutableLedgerPostureDto })
  immutableLedger: ImmutableLedgerPostureDto;

  @ApiProperty({ type: SecurityPostureVersionsDto })
  versions: SecurityPostureVersionsDto;

  @ApiProperty({ format: 'date-time' })
  generatedAt: Date;
}
