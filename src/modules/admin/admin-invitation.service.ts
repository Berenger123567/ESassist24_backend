import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hash as hashPassword } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePhone } from '../auth/phone.util';
import {
  AcceptAdminInvitationDto,
  AcceptAdminInvitationResponseDto,
  AdminInvitationResponseDto,
  AdminInvitationRole,
  CreateAdminInvitationDto,
  CreatedAdminInvitationResponseDto,
} from './dto/admin-invitation.dto';

const ROLE_LABELS: Record<AdminInvitationRole | 'CLIENT', string> = {
  ADMIN: 'Administrateur',
  EVALUATOR: 'Évaluateur',
  CLIENT: 'Client',
};

@Injectable()
export class AdminInvitationService {
  private readonly nodeEnv: string;
  private readonly inviteTtlSeconds: number;
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    this.inviteTtlSeconds = this.config.get<number>('ADMIN_INVITE_TTL_SECONDS', 604800);
    this.pepper =
      this.config.get<string>('REFRESH_TOKEN_PEPPER') ||
      this.config.getOrThrow<string>('DOCUMENT_SIGNING_SECRET');
  }

  async create(
    dto: CreateAdminInvitationDto,
    invitedByUserId: string,
  ): Promise<CreatedAdminInvitationResponseDto> {
    const phone = this.normalize(dto.phone);
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.inviteTtlSeconds * 1000);

    const invitation = await this.prisma.adminInvitation.create({
      data: {
        phone,
        email: dto.email,
        role: dto.role,
        tokenHash,
        status: 'PENDING',
        expiresAt,
        invitedByUserId,
      },
    });

    return {
      id: invitation.id,
      phone: invitation.phone,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      invitedByUserId: invitation.invitedByUserId,
      createdAt: invitation.createdAt,
      token,
      inviteUrl: `/admin/accept-invitation?token=${encodeURIComponent(token)}`,
    };
  }

  list(): Promise<AdminInvitationResponseDto[]> {
    return this.prisma.adminInvitation.findMany({
      select: {
        id: true,
        phone: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        invitedByUserId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(dto: AcceptAdminInvitationDto): Promise<AcceptAdminInvitationResponseDto> {
    const tokenHash = this.hashToken(dto.token);
    const invitation = await this.prisma.adminInvitation.findUnique({ where: { tokenHash } });

    if (!invitation) {
      throw this.invalidInvitation();
    }
    if (invitation.status === 'ACCEPTED') {
      throw new ApiError(
        ERROR_CODES.ADMIN_INVITATION_ALREADY_USED,
        409,
        'Cette invitation a déjà été utilisée.',
      );
    }
    if (invitation.status === 'REVOKED') {
      throw this.invalidInvitation();
    }
    if (invitation.status === 'EXPIRED' || invitation.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(
        ERROR_CODES.ADMIN_INVITATION_EXPIRED,
        400,
        'Cette invitation n’est plus valide.',
      );
    }
    if (
      invitation.status !== 'PENDING' ||
      (invitation.role !== 'ADMIN' && invitation.role !== 'EVALUATOR')
    ) {
      throw this.invalidInvitation();
    }
    const invitedRole: AdminInvitationRole = invitation.role;

    this.assertPasswordStrength(dto.password);
    const passwordHash = await hashPassword(dto.password);
    const now = new Date();
    const profileData: { firstName?: string; lastName?: string } = {};
    if (dto.firstName !== undefined) {
      profileData.firstName = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      profileData.lastName = dto.lastName;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.adminInvitation.updateMany({
        where: { id: invitation.id, status: 'PENDING' },
        data: { status: 'ACCEPTED', acceptedAt: now },
      });
      if (claimed.count === 0) {
        throw new ApiError(
          ERROR_CODES.ADMIN_INVITATION_ALREADY_USED,
          409,
          'Cette invitation a déjà été utilisée.',
        );
      }

      const user = await tx.user.upsert({
        where: { phone: invitation.phone },
        update: profileData,
        create: { phone: invitation.phone, ...profileData },
      });

      await this.ensureRole(tx, user.id, 'CLIENT');
      await this.ensureRole(tx, user.id, invitedRole);

      await tx.adminCredential.upsert({
        where: { userId: user.id },
        update: {
          passwordHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
        create: { userId: user.id, passwordHash },
      });

      const created = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: { roles: { include: { role: true } } },
      });

      return {
        userId: created.id,
        roles: created.roles.map((userRole) => userRole.role.code),
      };
    });

    return {
      userId: result.userId,
      phone: invitation.phone,
      roles: result.roles,
      mfaEnrollmentRequired: true,
    };
  }

  private normalize(rawPhone: string): string {
    return normalizePhone(rawPhone, this.nodeEnv !== 'production');
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.pepper).update(token).digest('hex');
  }

  private assertPasswordStrength(password: string): void {
    const isValid =
      password.length >= 10 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password);
    if (!isValid) {
      throw new ApiError(
        ERROR_CODES.PASSWORD_WEAK,
        400,
        'Le mot de passe doit contenir au moins 10 caractères, une majuscule, une minuscule et un chiffre.',
      );
    }
  }

  private async ensureRole(
    tx: Prisma.TransactionClient,
    userId: string,
    code: AdminInvitationRole | 'CLIENT',
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

  private invalidInvitation(): ApiError {
    return new ApiError(ERROR_CODES.ADMIN_INVITATION_INVALID, 400, 'Jeton d’invitation invalide.');
  }
}
