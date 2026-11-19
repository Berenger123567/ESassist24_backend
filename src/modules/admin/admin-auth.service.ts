import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { verify as verifyPassword } from '@node-rs/argon2';
import type { ClientPlatform } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { buildOtpAuthUri, generateTotpSecret, verifyTotp } from '../../common/utils/totp.util';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { normalizePhone } from '../auth/phone.util';
import {
  AdminLoginDto,
  AdminLoginResult,
  AdminMfaVerifyDto,
  AdminSessionResult,
  AdminTotpActivateDto,
  AdminTotpActivateResponseDto,
  AdminTotpEnrollResponseDto,
} from './dto/admin-auth.dto';

const MFA_AUDIENCE = 'admin-mfa';
const MFA_ISSUER = 'electro-assist-admin-mfa';
const MFA_TOKEN_TYPE = 'admin_mfa';

interface AdminMfaPayload {
  sub: string;
  typ: string;
}

export interface AdminSessionMeta {
  ip?: string;
  userAgent?: string;
  clientPlatform?: ClientPlatform;
  clientDeviceId?: string;
}

@Injectable()
export class AdminAuthService {
  private readonly nodeEnv: string;
  private readonly maxLoginFailures: number;
  private readonly lockMinutes: number;
  private readonly mfaTtlSeconds: number;
  private readonly totpIssuer: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    this.maxLoginFailures = this.config.get<number>('ADMIN_LOGIN_MAX_PER_HOUR', 5);
    this.lockMinutes = this.config.get<number>('ADMIN_LOGIN_LOCK_MINUTES', 15);
    this.mfaTtlSeconds = this.config.get<number>('ADMIN_MFA_TTL_SECONDS', 300);
    this.totpIssuer = this.config.get<string>('TOTP_ISSUER', 'Electro Assist 24H');
  }

  async login(dto: AdminLoginDto, meta: AdminSessionMeta): Promise<AdminLoginResult> {
    const phone = this.normalize(dto.phone);
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: { adminCredential: true },
    });
    const credential = user?.adminCredential;

    if (!user || user.deletedAt || !credential) {
      throw this.invalidCredentials();
    }

    const now = new Date();
    if (credential.lockedUntil && credential.lockedUntil.getTime() > now.getTime()) {
      throw new ApiError(
        ERROR_CODES.AUTH_ACCOUNT_LOCKED,
        423,
        'Compte administrateur temporairement verrouillé.',
      );
    }

    const passwordMatches = await verifyPassword(credential.passwordHash, dto.password).catch(
      () => false,
    );
    if (!passwordMatches) {
      await this.registerFailedAttempt(credential.userId, credential.failedLoginAttempts, now);
      throw this.invalidCredentials();
    }

    await this.prisma.adminCredential.update({
      where: { userId: credential.userId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    if (credential.totpEnabledAt) {
      return {
        mfaRequired: true,
        mfaToken: await this.signMfaChallenge(credential.userId),
      };
    }

    const tokens = await this.authService.issueSessionForUser(user.id, meta);
    return { ...tokens, mfaRequired: false };
  }

  async verifyTotp(dto: AdminMfaVerifyDto, meta: AdminSessionMeta): Promise<AdminSessionResult> {
    const payload = await this.verifyMfaChallenge(dto.mfaToken);
    const credential = await this.prisma.adminCredential.findUnique({
      where: { userId: payload.sub },
    });

    if (!credential || !credential.totpEnabledAt || !credential.totpSecret) {
      throw this.invalidMfa();
    }

    const verification = verifyTotp(credential.totpSecret, dto.code);
    if (!verification) {
      throw this.invalidMfa();
    }

    if (credential.totpLastUsedStep !== null && verification.step <= credential.totpLastUsedStep) {
      throw this.invalidMfa();
    }

    await this.prisma.adminCredential.update({
      where: { userId: credential.userId },
      data: { totpLastUsedStep: verification.step },
    });

    const tokens = await this.authService.issueSessionForUser(credential.userId, meta);
    return { ...tokens, mfaRequired: false };
  }

  async enrollTotp(userId: string, phone?: string): Promise<AdminTotpEnrollResponseDto> {
    const label =
      phone ??
      (
        await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { phone: true },
        })
      ).phone;
    const secret = generateTotpSecret();

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { totpSecret: secret, totpEnabledAt: null, totpLastUsedStep: null },
    });

    return {
      secret,
      uri: buildOtpAuthUri(secret, label, this.totpIssuer),
      enrolled: true,
    };
  }

  async activateTotp(
    userId: string,
    dto: AdminTotpActivateDto | string,
  ): Promise<AdminTotpActivateResponseDto> {
    const code = typeof dto === 'string' ? dto : dto.code;
    const credential = await this.prisma.adminCredential.findUnique({ where: { userId } });

    if (!credential?.totpSecret) {
      throw this.invalidMfa();
    }

    const verification = verifyTotp(credential.totpSecret, code);
    if (!verification) {
      throw this.invalidMfa();
    }

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { totpEnabledAt: new Date(), totpLastUsedStep: verification.step },
    });

    return { enabled: true };
  }

  private normalize(rawPhone: string): string {
    return normalizePhone(rawPhone, this.nodeEnv !== 'production');
  }

  private async registerFailedAttempt(
    userId: string,
    failedAttempts: number,
    now: Date,
  ): Promise<void> {
    const attempts = failedAttempts + 1;
    const shouldLock = attempts >= this.maxLoginFailures;
    const lockedUntil = shouldLock ? new Date(now.getTime() + this.lockMinutes * 60_000) : null;

    await this.prisma.adminCredential.update({
      where: { userId },
      data: { failedLoginAttempts: attempts, lockedUntil },
    });
  }

  private signMfaChallenge(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, typ: MFA_TOKEN_TYPE },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: MFA_AUDIENCE,
        issuer: MFA_ISSUER,
        expiresIn: this.mfaTtlSeconds,
      },
    );
  }

  private async verifyMfaChallenge(token: string): Promise<AdminMfaPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<AdminMfaPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        audience: MFA_AUDIENCE,
        issuer: MFA_ISSUER,
      });

      if (!payload || typeof payload.sub !== 'string' || payload.typ !== MFA_TOKEN_TYPE) {
        throw this.invalidMfa();
      }

      return payload;
    } catch (error) {
      if (this.isExpiredJwtError(error)) {
        throw new ApiError(ERROR_CODES.AUTH_MFA_EXPIRED, 401, 'Jeton MFA expiré.');
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw this.invalidMfa();
    }
  }

  private isExpiredJwtError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: unknown }).name === 'TokenExpiredError'
    );
  }

  private invalidCredentials(): ApiError {
    return new ApiError(
      ERROR_CODES.AUTH_INVALID_CREDENTIALS,
      401,
      'Identifiants administrateur invalides.',
    );
  }

  private invalidMfa(): ApiError {
    return new ApiError(ERROR_CODES.AUTH_MFA_INVALID, 401, 'Code ou jeton MFA invalide.');
  }
}
