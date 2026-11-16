import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { ProfessionalStatus, RoleCode } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { MeResponseDto } from '../users/dto/me.dto';
import { UsersService } from '../users/users.service';
import {
  ProfessionalProfileResponseDto,
  UpdateProfessionalProfileDto,
  UpdateUserProfileDto,
} from './dto/profile.dto';

const STATUS_LABELS: Record<ProfessionalStatus, string> = {
  PENDING: 'En attente',
  VERIFIED: 'Vérifié',
  CERTIFIED: 'Certifié ÉLECTRO ASSIST',
  SUSPENDED: 'Suspendu',
  REFUSED: 'Refusé',
};

const ROLE_LABELS: Record<RoleCode, string> = {
  CLIENT: 'Client',
  PROFESSIONAL: 'Électricien',
  EVALUATOR: 'Évaluateur',
  ADMIN: 'Administrateur',
};

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
  ) {}

  getProfile(userId: string): Promise<MeResponseDto> {
    return this.usersService.getMe(userId);
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto): Promise<MeResponseDto> {
    const zone = await this.prisma.serviceZone.findUnique({ where: { id: dto.zoneId } });
    if (!zone) {
      throw new ApiError(ERROR_CODES.ZONE_NOT_FOUND, 422, 'Zone de service introuvable.', {
        zoneId: dto.zoneId,
      });
    }

    if (dto.photoDocumentId) {
      const document = await this.prisma.document.findUnique({
        where: { id: dto.photoDocumentId },
      });
      if (!document || document.ownerId !== userId) {
        throw new ApiError(
          ERROR_CODES.DOCUMENT_NOT_OWNED,
          422,
          'Ce document ne vous appartient pas.',
          { documentId: dto.photoDocumentId },
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        zoneId: dto.zoneId,
        ...(dto.photoDocumentId !== undefined ? { photoDocumentId: dto.photoDocumentId } : {}),
      },
    });

    return this.usersService.getMe(userId);
  }

  async getProfessionalProfile(userId: string): Promise<ProfessionalProfileResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      include: {
        specialties: {
          include: { specialty: { select: { id: true, code: true, label: true } } },
          orderBy: { specialty: { sortOrder: 'asc' } },
        },
        zones: {
          include: {
            zone: { select: { id: true, code: true, name: true, department: true } },
          },
          orderBy: { zone: { name: 'asc' } },
        },
      },
    });

    if (!profile) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_PROFILE_NOT_FOUND,
        404,
        'Profil professionnel introuvable.',
      );
    }

    return this.toResponse(profile);
  }

  async updateProfessionalProfile(
    userId: string,
    dto: UpdateProfessionalProfileDto,
  ): Promise<ProfessionalProfileResponseDto> {
    const existing = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (existing?.status === ProfessionalStatus.SUSPENDED) {
      throw new ApiError(
        ERROR_CODES.ACCOUNT_SUSPENDED,
        403,
        'Votre profil est suspendu. Contactez l’assistance.',
      );
    }

    const specialtyIds = [...new Set(dto.specialtyIds)];
    const zoneIds = [...new Set(dto.zoneIds)];

    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: specialtyIds }, active: true },
      select: { id: true },
    });
    if (specialties.length !== specialtyIds.length) {
      const found = new Set(specialties.map((specialty) => specialty.id));
      throw new ApiError(ERROR_CODES.SPECIALTY_NOT_FOUND, 422, 'Spécialité introuvable.', {
        specialtyIds: specialtyIds.filter((id) => !found.has(id)),
      });
    }

    const zones = await this.prisma.serviceZone.findMany({
      where: { id: { in: zoneIds } },
      select: { id: true },
    });
    if (zones.length !== zoneIds.length) {
      const found = new Set(zones.map((zone) => zone.id));
      throw new ApiError(ERROR_CODES.ZONE_NOT_FOUND, 422, 'Zone de service introuvable.', {
        zoneIds: zoneIds.filter((id) => !found.has(id)),
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const role = await tx.role.upsert({
        where: { code: RoleCode.PROFESSIONAL },
        update: {},
        create: { code: RoleCode.PROFESSIONAL, label: ROLE_LABELS.PROFESSIONAL },
      });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      });

      const resubmission =
        existing?.status === ProfessionalStatus.REFUSED
          ? {
              status: ProfessionalStatus.PENDING,
              submittedAt: new Date(),
              decidedAt: null,
              decisionReason: null,
            }
          : {};

      const profile = await tx.professionalProfile.upsert({
        where: { userId },
        update: {
          experienceYears: dto.experienceYears,
          bio: dto.bio ?? null,
          ...resubmission,
        },
        create: {
          userId,
          experienceYears: dto.experienceYears,
          bio: dto.bio ?? null,
          status: ProfessionalStatus.PENDING,
        },
      });

      await tx.professionalSpecialty.deleteMany({ where: { profileId: profile.id } });
      await tx.professionalZone.deleteMany({ where: { profileId: profile.id } });

      await tx.professionalSpecialty.createMany({
        data: specialtyIds.map((specialtyId) => ({ profileId: profile.id, specialtyId })),
      });
      await tx.professionalZone.createMany({
        data: zoneIds.map((zoneId) => ({ profileId: profile.id, zoneId })),
      });
    });

    return this.getProfessionalProfile(userId);
  }

  private toResponse(profile: {
    id: string;
    userId: string;
    status: ProfessionalStatus;
    experienceYears: number;
    bio: string | null;
    submittedAt: Date;
    decidedAt: Date | null;
    decisionReason: string | null;
    createdAt: Date;
    updatedAt: Date;
    specialties: { specialty: { id: string; code: string; label: string } }[];
    zones: {
      zone: { id: string; code: string; name: string; department: string };
    }[];
  }): ProfessionalProfileResponseDto {
    return {
      id: profile.id,
      userId: profile.userId,
      status: profile.status,
      statusLabel: STATUS_LABELS[profile.status],
      experienceYears: profile.experienceYears,
      bio: profile.bio,
      submittedAt: profile.submittedAt,
      decidedAt: profile.decidedAt,
      decisionReason: profile.decisionReason,
      specialties: profile.specialties.map(({ specialty }) => specialty),
      zones: profile.zones.map(({ zone }) => zone),
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
