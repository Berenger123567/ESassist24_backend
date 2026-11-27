import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupRecord, LegalDocument, LegalDocumentType, Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AcceptLegalDocumentsDto,
  BackupPageDto,
  BackupQueryDto,
  BackupResponseDto,
  CorsPostureDto,
  DependencyStatusDto,
  LegalConsentItemDto,
  LegalConsentResponseDto,
  LegalDocumentPresenceDto,
  LegalDocumentResponseDto,
  MigrationInfoDto,
  PublishLegalDocumentDto,
  ReadinessDto,
  RecordBackupDto,
  SecurityPostureDto,
  VerifyBackupDto,
} from './dto/compliance.dto';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MS_PER_DAY = 86_400_000;

export interface LegalConsentMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async publishLegalDocument(
    admin: AuthUser,
    dto: PublishLegalDocumentDto,
  ): Promise<LegalDocumentResponseDto> {
    const existing = await this.prisma.legalDocument.findUnique({
      where: { type_version: { type: dto.type, version: dto.version } },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(
        ERROR_CODES.CONFLICT,
        409,
        'Cette version de document juridique existe déjà.',
        { type: dto.type, version: dto.version },
      );
    }

    const document = await this.prisma.$transaction(async (tx) => {
      try {
        const created = await tx.legalDocument.create({
          data: {
            type: dto.type,
            version: dto.version,
            title: dto.title,
            content: dto.content,
          },
        });
        await this.audit.write(
          {
            actorId: admin.id,
            action: 'LEGAL_DOCUMENT.PUBLISHED',
            targetType: 'LegalDocument',
            targetId: created.id,
            after: { type: created.type, version: created.version, title: created.title },
          },
          tx,
        );
        return created;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ApiError(
            ERROR_CODES.CONFLICT,
            409,
            'Cette version de document juridique existe déjà.',
            { type: dto.type, version: dto.version },
          );
        }
        throw error;
      }
    });

    return this.toLegalDocument(document);
  }

  async getLatestLegalDocument(type: LegalDocumentType): Promise<LegalDocumentResponseDto> {
    this.assertDocumentType(type);
    const document = await this.prisma.legalDocument.findFirst({
      where: { type },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!document) {
      throw new ApiError(
        ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        404,
        'Document juridique introuvable.',
      );
    }
    return this.toLegalDocument(document);
  }

  async getLegalDocument(
    type: LegalDocumentType,
    version: string,
  ): Promise<LegalDocumentResponseDto> {
    this.assertDocumentType(type);
    const document = await this.prisma.legalDocument.findUnique({
      where: { type_version: { type, version } },
    });
    if (!document) {
      throw new ApiError(
        ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        404,
        'Document juridique introuvable.',
      );
    }
    return this.toLegalDocument(document);
  }

  async acceptLegalDocuments(
    user: AuthUser,
    dto: AcceptLegalDocumentsDto,
    meta: LegalConsentMeta = {},
  ): Promise<LegalConsentResponseDto[]> {
    const items = this.resolveConsentItems(dto);
    const found = await Promise.all(
      items.map((item) =>
        this.prisma.legalDocument.findUnique({
          where: { type_version: { type: item.type, version: item.version } },
        }),
      ),
    );
    const missingIndex = found.findIndex((document) => document === null);
    if (missingIndex >= 0) {
      throw new ApiError(
        ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        404,
        'Document juridique introuvable.',
        { type: items[missingIndex].type, version: items[missingIndex].version },
      );
    }

    const unique = new Map<string, LegalDocument>();
    for (const document of found) {
      if (document) {
        unique.set(document.id, document);
      }
    }
    const ip = meta.ip?.slice(0, 64) || null;
    const userAgent = meta.userAgent?.slice(0, 500) || null;

    return this.prisma.$transaction(async (tx) => {
      const consents: LegalConsentResponseDto[] = [];
      for (const document of unique.values()) {
        const consent = await tx.legalConsent.upsert({
          where: { userId_documentId: { userId: user.id, documentId: document.id } },
          create: { userId: user.id, documentId: document.id, ip, userAgent },
          update: { acceptedAt: new Date(), ip, userAgent },
          include: { document: true },
        });
        await this.audit.write(
          {
            actorId: user.id,
            action: 'LEGAL_CONSENT.ACCEPTED',
            targetType: 'LegalConsent',
            targetId: consent.id,
            after: { type: document.type, version: document.version },
          },
          tx,
        );
        consents.push(this.toConsent(consent));
      }
      return consents;
    });
  }

  async assertRequiredConsents(userId: string): Promise<void> {
    const required = [
      {
        type: LegalDocumentType.TERMS,
        version: this.config.get<string>('LEGAL_TERMS_VERSION', '1.0.0'),
      },
      {
        type: LegalDocumentType.PRIVACY,
        version: this.config.get<string>('LEGAL_PRIVACY_VERSION', '1.0.0'),
      },
    ];
    const found = await Promise.all(
      required.map((item) =>
        this.prisma.legalDocument.findUnique({
          where: { type_version: { type: item.type, version: item.version } },
          select: { id: true },
        }),
      ),
    );
    const resolved = required.map((item, index) => ({ ...item, document: found[index] }));
    const missingDocuments = resolved.filter((item) => item.document === null);
    if (missingDocuments.length > 0) {
      throw new ApiError(
        ERROR_CODES.LEGAL_DOCUMENT_NOT_FOUND,
        404,
        'Document juridique requis introuvable.',
        {
          types: missingDocuments.map((item) => item.type),
        },
      );
    }

    const documentIds = resolved.map((item) => item.document!.id);
    const consents = await this.prisma.legalConsent.findMany({
      where: { userId, documentId: { in: documentIds } },
      select: { documentId: true },
    });
    const accepted = new Set(consents.map((consent) => consent.documentId));
    const missingConsents = resolved
      .filter((item) => !accepted.has(item.document!.id))
      .map((item) => ({ type: item.type, version: item.version }));
    if (missingConsents.length > 0) {
      throw new ApiError(
        ERROR_CODES.LEGAL_CONSENT_REQUIRED,
        403,
        'Consentement aux documents juridiques requis.',
        { documents: missingConsents },
      );
    }
  }

  async listMyConsents(user: AuthUser): Promise<LegalConsentResponseDto[]> {
    const consents = await this.prisma.legalConsent.findMany({
      where: { userId: user.id },
      include: { document: true },
      orderBy: { acceptedAt: 'desc' },
    });
    return consents.map((consent) => this.toConsent(consent));
  }

  async recordBackup(admin: AuthUser, dto: RecordBackupDto): Promise<BackupResponseDto> {
    this.assertSha256(dto.checksum);
    const startedAt = this.parseDate(dto.startedAt, new Date());
    const completedAt = this.parseDate(dto.completedAt, new Date());
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.backupRecord.create({
        data: {
          status: dto.status,
          startedAt,
          completedAt,
          sizeBytes: dto.sizeBytes ?? null,
          location: dto.location ?? null,
          checksum: dto.checksum,
        },
      });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'BACKUP.RECORDED',
          targetType: 'BackupRecord',
          targetId: created.id,
          after: {
            status: created.status,
            sizeBytes: created.sizeBytes,
            location: created.location,
          },
        },
        tx,
      );
      return created;
    });
    return this.toBackup(record);
  }

  async listBackups(_admin: AuthUser, query: BackupQueryDto): Promise<BackupPageDto> {
    const limit = query.limit ?? 20;
    const where: Prisma.BackupRecordWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    const startedAt: Prisma.DateTimeFilter = {};
    if (query.from) {
      startedAt.gte = new Date(query.from);
    }
    if (query.to) {
      startedAt.lte = new Date(query.to);
    }
    if (query.cursor) {
      const cursor = new Date(query.cursor);
      if (Number.isNaN(cursor.getTime())) {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de sauvegarde invalide.');
      }
      startedAt.lt = cursor;
    }
    if (Object.keys(startedAt).length > 0) {
      where.startedAt = startedAt;
    }

    const records = await this.prisma.backupRecord.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = records.length > limit;
    const page = hasMore ? records.slice(0, limit) : records;
    return {
      data: page.map((record) => this.toBackup(record)),
      nextCursor: hasMore ? page[page.length - 1].startedAt.toISOString() : null,
    };
  }

  async verifyBackup(
    admin: AuthUser,
    id: string,
    dto: VerifyBackupDto,
  ): Promise<BackupResponseDto> {
    if (!SHA256_HEX.test(dto.checksum)) {
      throw new ApiError(
        ERROR_CODES.BACKUP_VERIFICATION_FAILED,
        400,
        'Empreinte SHA-256 invalide.',
      );
    }
    const restoredAt = new Date(dto.restoredAt);
    if (Number.isNaN(restoredAt.getTime())) {
      throw new ApiError(
        ERROR_CODES.BACKUP_VERIFICATION_FAILED,
        400,
        'Date de restauration invalide.',
      );
    }
    const record = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!record) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Sauvegarde introuvable.');
    }
    if (!record.checksum || record.checksum.toLowerCase() !== dto.checksum.toLowerCase()) {
      throw new ApiError(
        ERROR_CODES.BACKUP_VERIFICATION_FAILED,
        400,
        'Vérification de la sauvegarde échouée.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.backupRecord.update({ where: { id }, data: { restoredAt } });
      await this.audit.write(
        {
          actorId: admin.id,
          action: 'BACKUP.VERIFIED',
          targetType: 'BackupRecord',
          targetId: id,
          after: { restoredAt },
        },
        tx,
      );
      return result;
    });
    return this.toBackup(updated);
  }

  async getReadiness(): Promise<ReadinessDto> {
    const [prisma, redis, legalDocuments, migrations] = await Promise.all([
      this.checkPrisma(),
      this.checkRedis(),
      this.checkLegalDocuments(),
      this.checkMigrations(),
    ]);
    const ready =
      prisma.reachable &&
      redis.reachable &&
      migrations.available &&
      legalDocuments.filter((document) => document.required).every((document) => document.present);

    return {
      status: ready ? 'ok' : 'degraded',
      checkedAt: new Date(),
      dependencies: { prisma, redis },
      legalDocuments,
      migrations,
      versions: {
        app: this.config.get<string>('APP_VERSION', '0.1.0'),
        contract: this.config.get<string>('CONTRAT_VERSION', '1.2.0'),
      },
    };
  }

  async getSecurityPosture(): Promise<SecurityPostureDto> {
    const origins = (this.config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    const cors: CorsPostureDto = {
      enabled: origins.length > 0,
      credentials: true,
      allowedOrigins: origins,
    };

    return {
      helmet: { enabled: true, contentSecurityPolicy: true },
      cors,
      trustProxy: {
        configured: this.countConfiguredEntries(this.config.get<string>('TRUST_PROXY_CIDR')) > 0,
        cidrCount: this.countConfiguredEntries(this.config.get<string>('TRUST_PROXY_CIDR')),
      },
      adminIpAllowlist: {
        configured: this.countConfiguredEntries(this.config.get<string>('ADMIN_IP_ALLOWLIST')) > 0,
        cidrCount: this.countConfiguredEntries(this.config.get<string>('ADMIN_IP_ALLOWLIST')),
        devBypass: this.config.get<string>('ADMIN_IP_DEV_BYPASS') === 'true',
      },
      globalPrefix: 'api/v1',
      rateLimits: {
        adminMax: this.numberConfig('ADMIN_RATE_LIMIT_MAX', 120),
        adminWindowSeconds: this.numberConfig('ADMIN_RATE_LIMIT_WINDOW_SECONDS', 60),
        adminViewUrlMax: this.numberConfig('ADMIN_VIEW_URL_RATE_LIMIT_MAX', 20),
      },
      immutableLedger: {
        enabled: true,
        appendOnly: true,
        updatesForbidden: true,
        deletesForbidden: true,
      },
      versions: {
        app: this.config.get<string>('APP_VERSION', '0.1.0'),
        contract: this.config.get<string>('CONTRAT_VERSION', '1.2.0'),
      },
      generatedAt: new Date(),
    };
  }

  private resolveConsentItems(dto: AcceptLegalDocumentsDto): LegalConsentItemDto[] {
    if (dto.documents && dto.documents.length > 0) {
      return dto.documents;
    }
    if (dto.type && dto.version) {
      return [{ type: dto.type, version: dto.version }];
    }
    throw new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Un document juridique et sa version sont requis.',
    );
  }

  private assertDocumentType(type: LegalDocumentType): void {
    if (!Object.values(LegalDocumentType).includes(type)) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Type de document juridique invalide.');
    }
  }

  private assertSha256(value: string): void {
    if (!SHA256_HEX.test(value)) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Empreinte SHA-256 invalide.');
    }
  }

  private parseDate(value: string | undefined, fallback: Date): Date {
    if (!value) {
      return fallback;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Date invalide.');
    }
    return parsed;
  }

  private numberConfig(key: string, fallback: number): number {
    const value = this.config.get<number>(key, fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private countConfiguredEntries(value: string | undefined): number {
    return (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0).length;
  }

  private toLegalDocument(document: LegalDocument): LegalDocumentResponseDto {
    return {
      id: document.id,
      type: document.type,
      version: document.version,
      title: document.title,
      content: document.content,
      publishedAt: document.publishedAt,
      createdAt: document.createdAt,
    };
  }

  private toConsent(
    consent: Prisma.LegalConsentGetPayload<{ include: { document: true } }>,
  ): LegalConsentResponseDto {
    return {
      id: consent.id,
      userId: consent.userId,
      documentId: consent.documentId,
      documentType: consent.document.type,
      documentVersion: consent.document.version,
      documentTitle: consent.document.title,
      acceptedAt: consent.acceptedAt,
      ip: consent.ip,
      userAgent: consent.userAgent,
    };
  }

  private toBackup(record: BackupRecord): BackupResponseDto {
    const retentionDays = this.numberConfig('BACKUP_RETENTION_DAYS', 30);
    return {
      id: record.id,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      expiresAt: new Date(record.startedAt.getTime() + retentionDays * MS_PER_DAY),
      retentionDays,
      sizeBytes: record.sizeBytes,
      location: record.location,
      checksum: record.checksum,
    };
  }

  private async checkPrisma(): Promise<DependencyStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1 AS "ok"`;
      return { reachable: true, configured: true };
    } catch {
      return { reachable: false, configured: true, detail: 'unavailable' };
    }
  }

  private async checkRedis(): Promise<DependencyStatusDto> {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      return { reachable: false, configured: false, detail: 'not configured' };
    }
    let client: Redis | undefined;
    try {
      client = new Redis(url, {
        lazyConnect: true,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      await client.ping();
      return { reachable: true, configured: true };
    } catch {
      return { reachable: false, configured: true, detail: 'unavailable' };
    } finally {
      client?.disconnect();
    }
  }

  private async checkLegalDocuments(): Promise<LegalDocumentPresenceDto[]> {
    const specs = [
      {
        type: LegalDocumentType.TERMS,
        version: this.config.get<string>('LEGAL_TERMS_VERSION', '1.0.0'),
        required: true,
      },
      {
        type: LegalDocumentType.PRIVACY,
        version: this.config.get<string>('LEGAL_PRIVACY_VERSION', '1.0.0'),
        required: true,
      },
      {
        type: LegalDocumentType.GEO_CONSENT,
        version: this.config.get<string>('LEGAL_GEO_CONSENT_VERSION', '1.0.0'),
        required: false,
      },
    ];

    return Promise.all(
      specs.map(async (spec) => {
        try {
          const document = await this.prisma.legalDocument.findFirst({
            where: { type: spec.type, version: spec.version },
            select: { id: true },
          });
          return {
            type: spec.type,
            version: spec.version,
            present: document !== null,
            required: spec.required,
          };
        } catch {
          return {
            type: spec.type,
            version: spec.version,
            present: false,
            required: spec.required,
          };
        }
      }),
    );
  }

  private async checkMigrations(): Promise<MigrationInfoDto> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ count: number; lastMigration: string | null; lastAppliedAt: Date | null }>
      >`
        SELECT COUNT(*)::int AS "count",
          (
            SELECT migration_name
            FROM "_prisma_migrations"
            WHERE finished_at IS NOT NULL
            ORDER BY finished_at DESC
            LIMIT 1
          ) AS "lastMigration",
          MAX(finished_at) AS "lastAppliedAt"
        FROM "_prisma_migrations"
      `;
      const row = rows[0];
      return {
        available: true,
        applied: row?.count ?? 0,
        lastMigration: row?.lastMigration ?? null,
        lastAppliedAt: row?.lastAppliedAt ?? null,
      };
    } catch {
      return {
        available: false,
        applied: null,
        lastMigration: null,
        lastAppliedAt: null,
      };
    }
  }
}
