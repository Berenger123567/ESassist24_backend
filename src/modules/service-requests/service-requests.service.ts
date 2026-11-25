import { Injectable } from '@nestjs/common';
import { DocumentStatus, Prisma, RoleCode, ServiceRequestStatus } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import {
  buildPage,
  decodeCursor,
  encodeCursor,
  resolveLimit,
} from '../../common/pagination/pagination';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateServiceRequestDto,
  ServiceRequestPageDto,
  ServiceRequestQueryDto,
  ServiceRequestResponseDto,
} from './dto/service-request.dto';

const ALLOWED_DOCUMENT_STATUSES: DocumentStatus[] = [
  DocumentStatus.SUBMITTED,
  DocumentStatus.APPROVED,
];

const ALLOWABLE_CANCEL_STATUSES: ServiceRequestStatus[] = [
  ServiceRequestStatus.OPEN,
  ServiceRequestStatus.MATCHED,
];

interface RequestCursor {
  createdAt: string;
  id: string;
}

type RequestRecord = Prisma.ServiceRequestGetPayload<{
  include: { photos: true; zone: true };
}>;

@Injectable()
export class ServiceRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(userId: string, dto: CreateServiceRequestDto): Promise<ServiceRequestResponseDto> {
    const zone = await this.prisma.serviceZone.findUnique({ where: { id: dto.zoneId } });
    if (!zone) {
      throw new ApiError(ERROR_CODES.ZONE_NOT_FOUND, 422, 'Zone de service introuvable.', {
        zoneId: dto.zoneId,
      });
    }

    const photoIds = dto.photoDocumentIds ?? [];
    if (photoIds.length > 0) {
      const documents = await this.prisma.document.findMany({
        where: { id: { in: photoIds } },
        select: { id: true, ownerId: true, type: true, status: true },
      });
      const invalid = documents.filter(
        (document) =>
          document.ownerId !== userId ||
          document.type !== 'BREAKDOWN_PHOTO' ||
          !ALLOWED_DOCUMENT_STATUSES.includes(document.status),
      );
      if (invalid.length > 0 || documents.length !== photoIds.length) {
        throw new ApiError(
          ERROR_CODES.DOCUMENT_NOT_BREAKDOWN_PHOTO,
          422,
          'Photos de panne invalides.',
          { documentIds: photoIds },
        );
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.create({
        data: {
          clientId: userId,
          type: dto.type,
          urgency: dto.urgency,
          zoneId: dto.zoneId,
          description: dto.description,
          photos: {
            create: photoIds.map((documentId) => ({ documentId })),
          },
        },
        include: { photos: true, zone: true },
      });
      await this.audit.write(
        {
          actorId: userId,
          action: 'SERVICE_REQUEST.CREATED',
          targetType: 'ServiceRequest',
          targetId: request.id,
        },
        tx,
      );
      return request;
    });

    return this.toResponse(created);
  }

  async listMine(userId: string, query: ServiceRequestQueryDto): Promise<ServiceRequestPageDto> {
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor<RequestCursor>(query.cursor);
    const where: Prisma.ServiceRequestWhereInput = { clientId: userId };
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt);
      if (Number.isNaN(cursorDate.getTime())) {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur de demande invalide.');
      }
      where.OR = [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: cursor.id } },
      ];
    }

    const rows = await this.prisma.serviceRequest.findMany({
      where,
      include: { photos: true, zone: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    return this.toPage(rows, limit);
  }

  async getById(user: AuthUser, id: string): Promise<ServiceRequestResponseDto> {
    const request = await this.prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        photos: true,
        zone: true,
        mission: { include: { professionalProfile: { select: { userId: true } } } },
      },
    });
    if (!request) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_FOUND, 404, 'Demande introuvable.');
    }

    const isClient = request.clientId === user.id;
    const isProfessional = request.mission?.professionalProfile.userId === user.id;
    const isAdmin = user.roles.includes(RoleCode.ADMIN);
    if (!isClient && !isProfessional && !isAdmin) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_OWNED, 403, 'Demande non accessible.');
    }

    return this.toResponse(request);
  }

  async cancel(userId: string, id: string): Promise<ServiceRequestResponseDto> {
    const request = await this.prisma.serviceRequest.findUnique({ where: { id } });
    if (!request || request.clientId !== userId) {
      throw new ApiError(ERROR_CODES.SERVICE_REQUEST_NOT_OWNED, 404, 'Demande introuvable.');
    }
    if (!ALLOWABLE_CANCEL_STATUSES.includes(request.status)) {
      throw new ApiError(
        ERROR_CODES.SERVICE_REQUEST_NOT_CANCELLABLE,
        409,
        'Cette demande ne peut plus être annulée.',
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.serviceRequest.update({
        where: { id },
        data: { status: ServiceRequestStatus.CANCELLED, cancelledAt: new Date() },
        include: { photos: true, zone: true },
      });
      await tx.serviceProposal.updateMany({
        where: { requestId: id, status: 'PENDING' },
        data: { status: 'REJECTED' },
      });
      await this.audit.write(
        {
          actorId: userId,
          action: 'SERVICE_REQUEST.CANCELLED',
          targetType: 'ServiceRequest',
          targetId: id,
        },
        tx,
      );
      return updated;
    });

    return this.toResponse(cancelled);
  }

  private toPage(rows: RequestRecord[], limit: number): ServiceRequestPageDto {
    const page = buildPage(rows, limit, (request) =>
      encodeCursor({ createdAt: request.createdAt.toISOString(), id: request.id }),
    );
    return {
      data: page.data.map((request) => this.toResponse(request)),
      nextCursor: page.nextCursor,
    };
  }

  private toResponse(request: RequestRecord): ServiceRequestResponseDto {
    return {
      id: request.id,
      clientId: request.clientId,
      type: request.type,
      urgency: request.urgency,
      zoneId: request.zoneId,
      description: request.description,
      status: request.status,
      photoDocumentIds: request.photos.map((photo) => photo.documentId),
      cancelledAt: request.cancelledAt,
      zone: {
        id: request.zone.id,
        code: request.zone.code,
        name: request.zone.name,
        department: request.zone.department,
      },
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }
}
