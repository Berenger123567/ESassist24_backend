import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Document as PrismaDocument,
  DocumentEvent as PrismaDocumentEvent,
  DocumentEventType,
  DocumentStatus,
  DocumentType,
  RoleCode,
} from '@prisma/client';
import { Response } from 'express';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDocumentUploadUrlDto,
  DocumentDownloadUrlResponseDto,
  DocumentDto,
  DocumentEventDto,
  DocumentUploadUrlResponseDto,
  UploadDocumentResponseDto,
} from './dto/document.dto';
import {
  assertAllowedDocumentContentType,
  detectDocumentMime,
  getDocumentExtension,
  isDetectedMimeMatchingContentType,
} from './document-mime.util';
import { signDocumentToken, verifyDocumentToken } from './document-signature.util';
import { DocumentStorageService } from './document-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: DocumentStorageService,
  ) {}

  async createUploadUrl(
    userId: string,
    dto: CreateDocumentUploadUrlDto,
  ): Promise<DocumentUploadUrlResponseDto> {
    if (!Object.values(DocumentType).includes(dto.type)) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Type de document invalide.');
    }

    if (typeof dto.contentType !== 'string') {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Type MIME invalide.');
    }
    const contentType = assertAllowedDocumentContentType(dto.contentType);

    const fileName = typeof dto.fileName === 'string' ? dto.fileName : '';
    const trimmedFileName = fileName.trim();
    const maxBytes = this.numberConfig('DOCUMENT_MAX_UPLOAD_BYTES', 10485760);
    if (
      trimmedFileName.length === 0 ||
      trimmedFileName.length > 255 ||
      !Number.isInteger(dto.sizeBytes) ||
      dto.sizeBytes <= 0 ||
      dto.sizeBytes > maxBytes
    ) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Métadonnées de document invalides.');
    }

    const now = Date.now();
    const expiryDays = this.numberConfig('DOCUMENT_EXPIRY_DAYS', 365);
    const expiresAt = new Date(now + expiryDays * 24 * 60 * 60 * 1000);
    const storageKey = `${randomUUID()}${getDocumentExtension(contentType)}`;

    const document = await this.prisma.document.create({
      data: {
        ownerId: userId,
        type: dto.type,
        status: DocumentStatus.PENDING,
        fileName,
        contentType,
        sizeBytes: dto.sizeBytes,
        storageKey,
        expiresAt,
      },
    });

    const expiresInSeconds = this.numberConfig('DOCUMENT_SIGNED_URL_TTL_SECONDS', 600);
    const token = signDocumentToken(
      {
        purpose: 'upload',
        documentId: document.id,
        contentType,
        sizeBytes: document.sizeBytes,
        exp: Math.floor(now / 1000) + expiresInSeconds,
      },
      this.signingSecret,
    );

    return {
      documentId: document.id,
      uploadUrl: `/api/v1/pro/documents/upload/${token}`,
      method: 'PUT',
      expiresInSeconds,
      headers: { 'Content-Type': contentType },
      storageKey,
    };
  }

  async uploadDocument(token: string, body: unknown): Promise<UploadDocumentResponseDto> {
    const tokenPayload = verifyDocumentToken(token, this.signingSecret, 'upload');

    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Corps de requête vide ou invalide.');
    }

    const maxBytes = this.numberConfig('DOCUMENT_MAX_UPLOAD_BYTES', 10485760);
    if (body.length > tokenPayload.sizeBytes || body.length > maxBytes) {
      throw new ApiError(ERROR_CODES.DOCUMENT_TOO_LARGE, 413, 'Document trop volumineux.', {
        maxBytes,
      });
    }

    let document = await this.getDocumentOrThrow(tokenPayload.documentId);
    document = await this.expireDocumentIfNeeded(document);
    if (document.status !== DocumentStatus.PENDING || !document.storageKey) {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_READY, 409, 'Document indisponible.');
    }

    const detectedContentType = detectDocumentMime(body);
    if (
      !isDetectedMimeMatchingContentType(tokenPayload.contentType, detectedContentType) ||
      !isDetectedMimeMatchingContentType(document.contentType, detectedContentType)
    ) {
      throw new ApiError(
        ERROR_CODES.DOCUMENT_INVALID_MIME,
        415,
        'Le type MIME détecté ne correspond pas au type déclaré.',
      );
    }

    const sha256 = createHash('sha256').update(body).digest('hex');
    const storageKey = document.storageKey;
    let fileWritten = false;

    try {
      await this.storage.writeFile(storageKey, body);
      fileWritten = true;
      await this.prisma.$transaction([
        this.prisma.documentEvent.create({
          data: {
            documentId: document.id,
            type: DocumentEventType.UPLOADED,
            actorId: null,
            metadata: {
              sizeBytes: body.length,
              detectedContentType,
              sha256,
            },
          },
        }),
        this.prisma.document.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.SUBMITTED,
            detectedContentType,
            sha256,
            uploadedAt: new Date(),
          },
        }),
      ]);
    } catch (error) {
      if (fileWritten) {
        await this.storage.deleteFile(storageKey).catch(() => undefined);
      }
      throw error;
    }

    return { documentId: document.id, status: DocumentStatus.SUBMITTED };
  }

  async listDocuments(userId: string): Promise<DocumentDto[]> {
    await this.expireExpiredDocuments({ ownerId: userId });
    const documents = await this.prisma.document.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
    return documents.map((document) => this.toDocumentDto(document));
  }

  async getHistory(userId: string, documentId: string): Promise<DocumentEventDto[]> {
    const document = await this.getDocumentOrThrow(documentId);
    this.assertOwnership(document, userId);
    await this.expireDocumentIfNeeded(document);

    const events = await this.prisma.documentEvent.findMany({
      where: { documentId },
      orderBy: { createdAt: 'desc' },
    });
    return events.map((event) => this.toEventDto(event));
  }

  async createDownloadUrl(
    userId: string,
    roles: RoleCode[],
    documentId: string,
  ): Promise<DocumentDownloadUrlResponseDto> {
    let document = await this.getDocumentOrThrow(documentId);
    this.assertOwnership(document, userId, roles, true);
    document = await this.expireDocumentIfNeeded(document);

    if (
      !document.storageKey ||
      !this.isDownloadableStatus(document.status) ||
      this.isExpired(document)
    ) {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_READY, 409, 'Document indisponible.');
    }

    const expiresInSeconds = this.numberConfig('DOCUMENT_SIGNED_URL_TTL_SECONDS', 600);
    const token = signDocumentToken(
      {
        purpose: 'download',
        documentId: document.id,
        storageKey: document.storageKey,
        exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
      },
      this.signingSecret,
    );

    return {
      documentId: document.id,
      downloadUrl: `/api/v1/pro/documents/download/${token}`,
      method: 'GET',
      expiresInSeconds,
    };
  }

  async downloadDocument(token: string, response: Response): Promise<void> {
    const tokenPayload = verifyDocumentToken(token, this.signingSecret, 'download');
    let document = await this.getDocumentOrThrow(tokenPayload.documentId);
    document = await this.expireDocumentIfNeeded(document);

    if (
      !document.storageKey ||
      document.storageKey !== tokenPayload.storageKey ||
      !this.isDownloadableStatus(document.status) ||
      this.isExpired(document)
    ) {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_READY, 409, 'Document indisponible.');
    }

    const stats = await this.storage.statFile(document.storageKey).catch(() => {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_FOUND, 404, 'Fichier documentaire introuvable.');
    });

    await this.prisma.documentEvent.create({
      data: {
        documentId: document.id,
        type: DocumentEventType.ACCESSED,
        actorId: null,
      },
    });

    const fileName = this.sanitizeFileName(document.fileName);
    response.status(200);
    response.setHeader('Content-Type', document.detectedContentType ?? document.contentType);
    response.setHeader('Content-Length', String(stats.size));
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${fileName}"; filename*=UTF-8''${this.encodeFileName(fileName)}`,
    );

    const stream = this.storage.createReadStream(document.storageKey);
    stream.on('error', () => {
      if (response.headersSent) {
        response.end();
        return;
      }
      response.status(500).json({
        error: {
          code: ERROR_CODES.INTERNAL_ERROR,
          message: 'Erreur lors de la lecture du document.',
          details: {},
        },
      });
    });
    stream.pipe(response);
  }

  private get signingSecret(): string {
    return this.config.get<string>('DOCUMENT_SIGNING_SECRET', '');
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<number | string>(key, fallback));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private async getDocumentOrThrow(documentId: string): Promise<PrismaDocument> {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      throw new ApiError(ERROR_CODES.DOCUMENT_NOT_FOUND, 404, 'Document introuvable.');
    }
    return document;
  }

  private assertOwnership(
    document: PrismaDocument,
    userId: string,
    roles: RoleCode[] = [],
    allowPrivileged = false,
  ): void {
    const privileged =
      allowPrivileged &&
      roles.some((role) => role === RoleCode.ADMIN || role === RoleCode.EVALUATOR);
    if (document.ownerId !== userId && !privileged) {
      throw new ApiError(
        ERROR_CODES.DOCUMENT_NOT_OWNED,
        403,
        'Ce document ne vous appartient pas.',
      );
    }
  }

  private isDownloadableStatus(status: DocumentStatus): boolean {
    return status === DocumentStatus.SUBMITTED || status === DocumentStatus.APPROVED;
  }

  private isExpired(document: PrismaDocument): boolean {
    return document.expiresAt !== null && document.expiresAt.getTime() <= Date.now();
  }

  private async expireDocumentIfNeeded(document: PrismaDocument): Promise<PrismaDocument> {
    if (
      !document.expiresAt ||
      document.expiresAt.getTime() > Date.now() ||
      document.status === DocumentStatus.EXPIRED
    ) {
      return document;
    }

    await this.prisma.$transaction([
      this.prisma.documentEvent.create({
        data: {
          documentId: document.id,
          type: DocumentEventType.EXPIRED,
          actorId: null,
          metadata: { expiresAt: document.expiresAt.toISOString() },
        },
      }),
      this.prisma.document.update({
        where: { id: document.id },
        data: { status: DocumentStatus.EXPIRED },
      }),
    ]);

    return { ...document, status: DocumentStatus.EXPIRED };
  }

  private async expireExpiredDocuments(where: { ownerId: string }): Promise<void> {
    const now = new Date();
    const documents = await this.prisma.document.findMany({
      where: {
        ...where,
        expiresAt: { lte: now },
        status: { not: DocumentStatus.EXPIRED },
      },
      select: { id: true, expiresAt: true },
    });

    if (documents.length === 0) {
      return;
    }

    const ids = documents.map((document) => document.id);
    await this.prisma.$transaction([
      ...documents.map((document) =>
        this.prisma.documentEvent.create({
          data: {
            documentId: document.id,
            type: DocumentEventType.EXPIRED,
            actorId: null,
            metadata: { expiresAt: document.expiresAt?.toISOString() ?? null },
          },
        }),
      ),
      this.prisma.document.updateMany({
        where: { id: { in: ids }, status: { not: DocumentStatus.EXPIRED } },
        data: { status: DocumentStatus.EXPIRED },
      }),
    ]);
  }

  private sanitizeFileName(fileName: string): string {
    const base = fileName.split(/[\\/]/).pop() ?? 'document';
    const sanitized = Array.from(base)
      .map((char) => {
        const code = char.charCodeAt(0);
        return code < 32 || code === 127 || char === '"' || char === '\\' ? '_' : char;
      })
      .join('')
      .trim();
    return sanitized.slice(0, 255) || 'document';
  }

  private encodeFileName(fileName: string): string {
    return encodeURIComponent(fileName).replace(/'/g, '%27');
  }

  private toDocumentDto(document: PrismaDocument): DocumentDto {
    return {
      id: document.id,
      ownerId: document.ownerId,
      type: document.type,
      status: document.status,
      fileName: document.fileName,
      contentType: document.contentType,
      detectedContentType: document.detectedContentType,
      sizeBytes: document.sizeBytes,
      sha256: document.sha256,
      uploadedAt: document.uploadedAt,
      expiresAt: document.expiresAt,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    };
  }

  private toEventDto(event: PrismaDocumentEvent): DocumentEventDto {
    return {
      id: event.id,
      documentId: event.documentId,
      type: event.type,
      actorId: event.actorId,
      metadata: event.metadata,
      createdAt: event.createdAt,
    };
  }
}
