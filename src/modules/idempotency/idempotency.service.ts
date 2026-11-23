import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute<T>(
    scope: string,
    adminId: string,
    key: string,
    requestHash: string,
    handler: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<{ response: T; replayed: boolean }> {
    const now = new Date();
    await this.prisma.idempotencyRecord.deleteMany({ where: { expiresAt: { lte: now } } });

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { scope_adminId_key: { scope, adminId, key } },
    });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ApiError(
          ERROR_CODES.IDEMPOTENCY_CONFLICT,
          409,
          'Cette clé idempotence a déjà été utilisée avec une autre requête.',
        );
      }
      return { response: existing.response as T, replayed: true };
    }

    const ttlSeconds = this.config.get<number>(
      'VERIFICATION_DECISION_IDEMPOTENCY_TTL_SECONDS',
      86400,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.idempotencyRecord.create({
          data: {
            scope,
            adminId,
            key,
            requestHash,
            status: 200,
            response: {} as Prisma.InputJsonValue,
            expiresAt,
          },
        });
        const response = await handler(tx);
        const normalized = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
        await tx.idempotencyRecord.update({
          where: { scope_adminId_key: { scope, adminId, key } },
          data: { response: normalized },
        });
        return { response, replayed: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const replayed = await this.prisma.idempotencyRecord.findUnique({
          where: { scope_adminId_key: { scope, adminId, key } },
        });
        if (replayed) {
          if (replayed.requestHash !== requestHash) {
            throw new ApiError(
              ERROR_CODES.IDEMPOTENCY_CONFLICT,
              409,
              'Cette clé idempotence a déjà été utilisée avec une autre requête.',
            );
          }
          return { response: replayed.response as T, replayed: true };
        }
      }
      throw error;
    }
  }
}
