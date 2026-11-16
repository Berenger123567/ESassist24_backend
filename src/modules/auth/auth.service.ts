import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleCode, ClientPlatform } from '@prisma/client';
import { hash as hashSecret, verify as verifySecret } from '@node-rs/argon2';
import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { OTP_SENDER, OtpSender } from './otp.sender';
import { normalizePhone } from './phone.util';
import { RateLimitService } from './rate-limit.service';
import { AuthTokensDto } from './dto/auth.dto';

const ROLE_LABELS: Record<RoleCode, string> = {
  CLIENT: 'Client',
  PROFESSIONAL: 'Ã‰lectricien',
  EVALUATOR: 'Ã‰valuateur',
  ADMIN: 'Administrateur',
};

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  clientPlatform?: ClientPlatform;
  clientDeviceId?: string;
}

@Injectable()
export class AuthService {
  private readonly nodeEnv: string;
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlDays: number;
  private readonly otpTtlSeconds: number;
  private readonly otpMaxAttempts: number;
  private readonly fixedCode?: string;
  private readonly fixedPhones: string[];
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSender,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    this.accessTtlSeconds = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', 900);
    this.refreshTtlDays = this.config.get<number>('REFRESH_TTL_DAYS', 30);
    this.otpTtlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 300);
    this.otpMaxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 3);
    this.fixedCode = this.config.get<string>('OTP_FIXED_CODE') || undefined;
    this.fixedPhones = (this.config.get<string>('OTP_FIXED_PHONES') || '')
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean);
    this.pepper = this.config.getOrThrow<string>('REFRESH_TOKEN_PEPPER');
  }

  async requestOtp(
    rawPhone: string,
    meta: RequestMeta,
  ): Promise<{ retryAfterSeconds: number; resendAfterSeconds: number; expiresInSeconds: number }> {
    const phone = this.normalize(rawPhone);
    await this.rateLimit.assertOtpRequestAllowed(phone, meta.ip);

    const code = this.resolveCode(phone);
    const codeHash = await hashSecret(code);
    const expiresAt = new Date(Date.now() + this.otpTtlSeconds * 1000);

    await this.prisma.$transaction(async (tx) => {
      await tx.otpCode.updateMany({
        where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      await tx.otpCode.create({
        data: {
          phone,
          codeHash,
          maxAttempts: this.otpMaxAttempts,
          expiresAt,
          ip: meta.ip,
          userAgent: meta.userAgent,
          clientPlatform: meta.clientPlatform ?? ClientPlatform.UNKNOWN,
        },
      });
    });

    await this.otpSender.send(phone, code);

    return {
      retryAfterSeconds: this.rateLimit.cooldownSeconds,
      resendAfterSeconds: this.rateLimit.cooldownSeconds,
      expiresInSeconds: this.otpTtlSeconds,
    };
  }

  async verifyOtp(
    rawPhone: string,
    code: string,
    meta: RequestMeta,
  ): Promise<AuthTokensDto & { isNewUser: boolean }> {
    const phone = this.normalize(rawPhone);
    const latest = await this.prisma.otpCode.findFirst({
      where: { phone },
      orderBy: { createdAt: 'desc' },
    });

    if (!latest || latest.consumedAt) {
      throw new ApiError(ERROR_CODES.OTP_INVALID, 400, 'Code de vérification invalide.');
    }
    if (latest.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(ERROR_CODES.OTP_EXPIRED, 400, 'Code de vérification expiré.');
    }
    if (latest.attempts >= latest.maxAttempts) {
      throw new ApiError(ERROR_CODES.OTP_INVALID, 400, 'Nombre maximal de tentatives atteint.');
    }

    const matches = await verifySecret(latest.codeHash, code).catch(() => false);
    if (!matches) {
      const updated = await this.prisma.otpCode.update({
        where: { id: latest.id },
        data: { attempts: { increment: 1 } },
      });
      const codeError =
        updated.attempts >= updated.maxAttempts ? ERROR_CODES.OTP_INVALID : ERROR_CODES.OTP_INVALID;
      throw new ApiError(codeError, 400, 'Code de vÃ©rification incorrect.');
    }

    let isNewUser = false;
    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.otpCode.updateMany({
        where: { id: latest.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new ApiError(ERROR_CODES.OTP_INVALID, 400, 'Code de vérification invalide.');
      }

      const before = await tx.user.findUnique({ where: { phone }, select: { id: true } });
      isNewUser = !before;
      const existing = await tx.user.upsert({
        where: { phone },
        update: {},
        create: { phone },
        include: { roles: { include: { role: true } } },
      });

      if (existing.deletedAt) {
        throw new ApiError(ERROR_CODES.ACCOUNT_DELETED, 403, 'Compte supprimÃ©.');
      }

      await this.ensureRole(tx, existing.id, 'CLIENT');

      return tx.user.findUniqueOrThrow({
        where: { id: existing.id },
        include: { roles: { include: { role: true } } },
      });
    });

    const roles = user.roles.map((userRole) => userRole.role.code);
    const tokens = await this.issueSession(user.id, roles, meta);
    return { ...tokens, isNewUser };
  }

  async refresh(refreshToken: string, meta: RequestMeta): Promise<AuthTokensDto> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (!session) {
      throw new ApiError(
        ERROR_CODES.AUTH_REFRESH_INVALID,
        401,
        'Jeton de rafraÃ®chissement invalide.',
      );
    }

    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(session.familyId);
      throw new ApiError(ERROR_CODES.AUTH_SESSION_REVOKED, 401, 'Session rÃ©voquÃ©e.');
    }

    if (session.user.deletedAt) {
      throw new ApiError(ERROR_CODES.ACCOUNT_DELETED, 403, 'Compte supprimÃ©.');
    }

    const roles = session.user.roles.map((userRole) => userRole.role.code);
    const newRefreshToken = this.generateRefreshToken();
    const newTokenHash = this.hashRefreshToken(newRefreshToken);

    let newSessionId: string;
    try {
      newSessionId = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (claimed.count === 0) {
          throw new ApiError(ERROR_CODES.AUTH_SESSION_REVOKED, 401, 'Session rÃ©voquÃ©e.');
        }

        const created = await tx.session.create({
          data: {
            userId: session.userId,
            refreshTokenHash: newTokenHash,
            familyId: session.familyId,
            expiresAt: this.refreshExpiry(),
            ip: meta.ip,
            userAgent: meta.userAgent,
            clientPlatform: meta.clientPlatform ?? ClientPlatform.UNKNOWN,
            clientDeviceId: meta.clientDeviceId,
          },
        });

        await tx.session.update({
          where: { id: session.id },
          data: { replacedBySessionId: created.id },
        });

        return created.id;
      });
    } catch (error) {
      if (error instanceof ApiError) {
        await this.revokeFamily(session.familyId);
      }
      throw error;
    }

    const accessToken = await this.signAccessToken(session.userId, newSessionId, roles);
    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.accessTtlSeconds,
      user: { id: session.userId, roles },
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueSession(
    userId: string,
    roles: RoleCode[],
    meta: RequestMeta,
  ): Promise<AuthTokensDto> {
    const refreshToken = this.generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        familyId: randomUUID(),
        expiresAt: this.refreshExpiry(),
        ip: meta.ip,
        userAgent: meta.userAgent,
        clientPlatform: meta.clientPlatform ?? ClientPlatform.UNKNOWN,
        clientDeviceId: meta.clientDeviceId,
      },
    });

    const accessToken = await this.signAccessToken(userId, session.id, roles);
    return {
      accessToken,
      refreshToken,
      expiresIn: this.accessTtlSeconds,
      user: { id: userId, roles },
    };
  }

  private signAccessToken(userId: string, sessionId: string, roles: RoleCode[]): Promise<string> {
    return this.jwtService.signAsync({ sub: userId, sid: sessionId, roles });
  }

  private generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
  }

  private revokeFamily(familyId: string): Promise<Prisma.BatchPayload> {
    return this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private normalize(rawPhone: string): string {
    return normalizePhone(rawPhone, this.nodeEnv !== 'production');
  }

  private resolveCode(phone: string): string {
    const canUseFixedCode =
      this.nodeEnv !== 'production' &&
      !!this.fixedCode &&
      (this.fixedPhones.length === 0 || this.fixedPhones.includes(phone));

    return canUseFixedCode ? this.fixedCode! : randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private async ensureRole(
    tx: Prisma.TransactionClient,
    userId: string,
    code: RoleCode,
  ): Promise<void> {
    const role = await tx.role.upsert({
      where: { code },
      update: {},
      create: { code, label: ROLE_LABELS[code] },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      update: {},
      create: { userId, roleId: role.id },
    });
  }
}
