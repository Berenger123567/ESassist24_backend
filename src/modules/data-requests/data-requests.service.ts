import { HttpStatus, Injectable } from '@nestjs/common';
import { DataRequest, DataRequestStatus } from '@prisma/client';
import { isUUID } from 'class-validator';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AdminDataRequestResponseDto,
  CreateDataRequestDto,
  DataRequestResponseDto,
  UpdateDataRequestStatusDto,
} from './dto/data-request.dto';

const ALLOWED_TRANSITIONS: Record<DataRequestStatus, readonly DataRequestStatus[]> = {
  [DataRequestStatus.PENDING]: [
    DataRequestStatus.IN_PROGRESS,
    DataRequestStatus.REJECTED,
    DataRequestStatus.COMPLETED,
  ],
  [DataRequestStatus.IN_PROGRESS]: [DataRequestStatus.COMPLETED, DataRequestStatus.REJECTED],
  [DataRequestStatus.COMPLETED]: [],
  [DataRequestStatus.REJECTED]: [],
};

@Injectable()
export class DataRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateDataRequestDto): Promise<DataRequestResponseDto> {
    const request = await this.prisma.dataRequest.create({
      data: {
        userId,
        type: dto.type,
        details: dto.details?.trim() || null,
      },
    });

    return this.toResponse(request);
  }

  async listForUser(userId: string): Promise<DataRequestResponseDto[]> {
    const requests = await this.prisma.dataRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });

    return requests.map((request) => this.toResponse(request));
  }

  async findForUser(userId: string, id: string): Promise<DataRequestResponseDto> {
    const request = await this.findRequest(id);
    if (request.userId !== userId) {
      throw this.notFound();
    }

    return this.toResponse(request);
  }

  async listForAdmin(): Promise<AdminDataRequestResponseDto[]> {
    const requests = await this.prisma.dataRequest.findMany({
      include: { user: { select: { phone: true } } },
      orderBy: { requestedAt: 'desc' },
    });

    return requests.map((request) => ({
      ...this.toResponse(request),
      userPhone: request.user.phone,
    }));
  }

  async updateStatus(id: string, dto: UpdateDataRequestStatusDto): Promise<DataRequestResponseDto> {
    const request = await this.findRequest(id);
    if (!ALLOWED_TRANSITIONS[request.status].includes(dto.status)) {
      throw new ApiError(
        ERROR_CODES.INVALID_STATUS_TRANSITION,
        HttpStatus.CONFLICT,
        'Transition de statut invalide.',
        { currentStatus: request.status, requestedStatus: dto.status },
      );
    }

    const resolved =
      dto.status === DataRequestStatus.COMPLETED || dto.status === DataRequestStatus.REJECTED;
    const resolutionNote =
      dto.resolutionNote === undefined ? request.resolutionNote : dto.resolutionNote.trim() || null;
    const updated = await this.prisma.dataRequest.update({
      where: { id },
      data: {
        status: dto.status,
        resolutionNote,
        resolvedAt: resolved ? new Date() : null,
      },
    });

    return this.toResponse(updated);
  }

  private async findRequest(id: string): Promise<DataRequest> {
    if (!isUUID(id)) {
      throw this.notFound();
    }

    const request = await this.prisma.dataRequest.findUnique({ where: { id } });
    if (!request) {
      throw this.notFound();
    }

    return request;
  }

  private notFound(): ApiError {
    return new ApiError(
      ERROR_CODES.DATA_REQUEST_NOT_FOUND,
      HttpStatus.NOT_FOUND,
      'Demande de données introuvable.',
    );
  }

  private toResponse(request: DataRequest): DataRequestResponseDto {
    return {
      id: request.id,
      userId: request.userId,
      type: request.type,
      status: request.status,
      details: request.details,
      resolutionNote: request.resolutionNote,
      requestedAt: request.requestedAt,
      resolvedAt: request.resolvedAt,
    };
  }
}
