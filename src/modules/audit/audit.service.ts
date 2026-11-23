import { Injectable } from '@nestjs/common';
import { AuditResult, Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditContextFields, auditContextFromRequest } from './audit-context';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogPageDto, AuditLogResponseDto } from './dto/audit-log-response.dto';

export interface AuditEntry extends AuditContextFields {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  result?: AuditResult;
  reason?: string | null;
}

const SENSITIVE_KEY =
  /password|secret|token|codehash|otp|authorization|cookie|privatekey|storagekey|viewurl|signature/i;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async writeFromRequest(
    request: ContextualRequest,
    user: AuthUser | undefined,
    entry: AuditEntry,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await this.write({ ...auditContextFromRequest(request, user), ...entry }, client);
  }

  async write(
    entry: AuditEntry,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        actorRole: entry.actorRole ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        before:
          entry.before === undefined
            ? undefined
            : (this.mask(entry.before) as Prisma.InputJsonValue),
        after:
          entry.after === undefined ? undefined : (this.mask(entry.after) as Prisma.InputJsonValue),
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        sessionId: entry.sessionId ?? null,
        requestId: entry.requestId ?? null,
        deviceId: entry.deviceId ?? null,
        result: entry.result ?? AuditResult.SUCCESS,
        reason: entry.reason ?? null,
      },
    });
  }

  async list(query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }
    if (query.actorId) {
      where.actorId = query.actorId;
    }
    if (query.targetType) {
      where.targetType = query.targetType;
    }
    if (query.targetId) {
      where.targetId = query.targetId;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.cursor) {
      try {
        where.id = { lt: BigInt(query.cursor) };
      } catch {
        throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Curseur d’audit invalide.');
      }
    }

    const limit = query.limit ?? 50;
    const logs = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;

    return {
      data: page.map((log) => this.toResponse(log)),
      nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
    };
  }

  private toResponse(log: Prisma.AuditLogGetPayload<object>): AuditLogResponseDto {
    return {
      id: log.id.toString(),
      actorId: log.actorId,
      actorRole: log.actorRole,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      before: log.before,
      after: log.after,
      ip: log.ip,
      requestId: log.requestId,
      result: log.result,
      reason: log.reason,
      createdAt: log.createdAt,
    };
  }

  private mask(value: unknown, key?: string): unknown {
    if (key && SENSITIVE_KEY.test(key)) {
      return '[REDACTED]';
    }
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'bigint') {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.mask(item));
    }
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>(
        (result, [entryKey, entryValue]) => {
          result[entryKey] = this.mask(entryValue, entryKey);
          return result;
        },
        {},
      );
    }
    return value;
  }
}
