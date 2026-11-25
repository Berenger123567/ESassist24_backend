import { Injectable } from '@nestjs/common';
import {
  AvailabilityStatus,
  Prisma,
  ProfessionalStatus,
  SpecialtyCode,
  UserStatus,
} from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthUser } from '../../common/types/auth-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AvailabilityResponseDto,
  FavoritePageDto,
  FavoriteResponseDto,
  ProfessionalSearchQueryDto,
  ProfessionalSearchResponseDto,
  PublicProfessionalProfileDto,
  UpdateAvailabilityDto,
} from './dto/professional-directory.dto';

const ALLOWED_PROFESSIONAL_STATUSES: ProfessionalStatus[] = [
  ProfessionalStatus.VERIFIED,
  ProfessionalStatus.CERTIFIED,
];

interface SearchRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  status: ProfessionalStatus;
  certifiedAt: Date | null;
  experienceYears: number;
  bio: string | null;
  availabilityStatus: AvailabilityStatus;
  availableFrom: Date | null;
  availableUntil: Date | null;
  distanceMeters: number;
}

interface SpecialtyRow {
  code: SpecialtyCode;
  label: string;
}

interface ZoneRow {
  code: string;
  name: string;
  department: string;
}

@Injectable()
export class ProfessionalDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async search(query: ProfessionalSearchQueryDto): Promise<ProfessionalSearchResponseDto> {
    const radiusMeters = query.radiusKm * 1000;
    const limit = query.limit ?? 20;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}::float8, ${query.lat}::float8), 4326)::geography`;
    const availableFilter = query.availableOnly
      ? Prisma.sql`AND p."availabilityStatus" <> 'UNAVAILABLE'::"AvailabilityStatus"`
      : Prisma.sql``;
    const specialtyFilter = query.specialtyCode
      ? Prisma.sql`AND EXISTS (
          SELECT 1
          FROM "professional_specialties" ps
          JOIN "specialties" s ON s."id" = ps."specialtyId"
          WHERE ps."profileId" = p."id"
            AND s."code" = ${query.specialtyCode}::"SpecialtyCode"
            AND s."active" = true
        )`
      : Prisma.sql``;

    const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        p."id" AS "id",
        u."firstName" AS "firstName",
        u."lastName" AS "lastName",
        p."status" AS "status",
        p."certifiedAt" AS "certifiedAt",
        p."experienceYears" AS "experienceYears",
        p."bio" AS "bio",
        p."availabilityStatus" AS "availabilityStatus",
        p."availableFrom" AS "availableFrom",
        p."availableUntil" AS "availableUntil",
        MIN(ST_Distance(z."center"::geography, ${point})) AS "distanceMeters"
      FROM "professional_profiles" p
      JOIN "users" u ON u."id" = p."userId"
      JOIN "professional_zones" pz ON pz."profileId" = p."id"
      JOIN "service_zones" z ON z."id" = pz."zoneId"
      WHERE p."status" IN ('VERIFIED'::"ProfessionalStatus", 'CERTIFIED'::"ProfessionalStatus")
        AND u."status" = 'ACTIVE'::"UserStatus"
        AND z."center" IS NOT NULL
        AND ST_DWithin(z."center"::geography, ${point}, ${radiusMeters}::float8)
        ${availableFilter}
        ${specialtyFilter}
      GROUP BY
        p."id", u."firstName", u."lastName", p."status", p."certifiedAt",
        p."experienceYears", p."bio", p."availabilityStatus", p."availableFrom", p."availableUntil"
      ORDER BY "distanceMeters" ASC, p."id" ASC
      LIMIT ${limit}::int
    `);

    const ids = rows.map((row) => row.id);
    const specialties = ids.length
      ? await this.prisma.professionalSpecialty.findMany({
          where: { profileId: { in: ids } },
          include: { specialty: true },
          orderBy: { specialty: { sortOrder: 'asc' } },
        })
      : [];
    const zones = ids.length
      ? await this.prisma.professionalZone.findMany({
          where: { profileId: { in: ids } },
          include: { zone: true },
          orderBy: { zone: { name: 'asc' } },
        })
      : [];

    const specialtyMap = new Map<string, SpecialtyRow[]>();
    for (const item of specialties) {
      const list = specialtyMap.get(item.profileId) ?? [];
      list.push({ code: item.specialty.code, label: item.specialty.label });
      specialtyMap.set(item.profileId, list);
    }
    const zoneMap = new Map<string, ZoneRow[]>();
    for (const item of zones) {
      const list = zoneMap.get(item.profileId) ?? [];
      list.push({
        code: item.zone.code,
        name: item.zone.name,
        department: item.zone.department,
      });
      zoneMap.set(item.profileId, list);
    }

    return {
      data: rows.map((row) =>
        this.toPublicProfile(row, specialtyMap.get(row.id) ?? [], zoneMap.get(row.id) ?? []),
      ),
      nextCursor: null,
    };
  }

  async getPublicProfile(profileId: string): Promise<PublicProfessionalProfileDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { firstName: true, lastName: true, status: true } } },
    });
    if (!this.isEligible(profile?.status, profile?.user.status)) {
      throw new ApiError(ERROR_CODES.PROFESSIONAL_NOT_ELIGIBLE, 404, 'Profil public introuvable.');
    }

    const specialties = await this.prisma.professionalSpecialty.findMany({
      where: { profileId },
      include: { specialty: true },
      orderBy: { specialty: { sortOrder: 'asc' } },
    });
    const zones = await this.prisma.professionalZone.findMany({
      where: { profileId },
      include: { zone: true },
      orderBy: { zone: { name: 'asc' } },
    });

    return this.toPublicProfile(
      {
        id: profile!.id,
        firstName: profile!.user.firstName,
        lastName: profile!.user.lastName,
        status: profile!.status,
        certifiedAt: profile!.certifiedAt,
        experienceYears: profile!.experienceYears,
        bio: profile!.bio,
        availabilityStatus: profile!.availabilityStatus,
        availableFrom: profile!.availableFrom,
        availableUntil: profile!.availableUntil,
        distanceMeters: 0,
      },
      specialties.map((item) => ({ code: item.specialty.code, label: item.specialty.label })),
      zones.map((item) => ({
        code: item.zone.code,
        name: item.zone.name,
        department: item.zone.department,
      })),
      null,
    );
  }

  async addFavorite(userId: string, profileId: string): Promise<FavoriteResponseDto> {
    await this.assertEligible(profileId);
    try {
      const favorite = await this.prisma.favorite.create({
        data: { clientId: userId, professionalProfileId: profileId },
      });
      await this.audit.write({
        actorId: userId,
        action: 'PROFESSIONAL.FAVORITE_ADDED',
        targetType: 'ProfessionalProfile',
        targetId: profileId,
      });
      return favorite;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ApiError(
          ERROR_CODES.FAVORITE_ALREADY_EXISTS,
          409,
          'Ce professionnel est déjà dans vos favoris.',
        );
      }
      throw error;
    }
  }

  async removeFavorite(userId: string, profileId: string): Promise<{ deleted: boolean }> {
    const result = await this.prisma.favorite.deleteMany({
      where: { clientId: userId, professionalProfileId: profileId },
    });
    if (result.count === 0) {
      throw new ApiError(ERROR_CODES.FAVORITE_NOT_FOUND, 404, 'Favori introuvable.');
    }
    await this.audit.write({
      actorId: userId,
      action: 'PROFESSIONAL.FAVORITE_REMOVED',
      targetType: 'ProfessionalProfile',
      targetId: profileId,
    });
    return { deleted: true };
  }

  async listFavorites(userId: string): Promise<FavoritePageDto> {
    const favorites = await this.prisma.favorite.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const profiles = await Promise.all(
      favorites.map((favorite) => this.getPublicProfile(favorite.professionalProfileId)),
    );
    return {
      data: favorites.map((favorite, index) => ({
        professionalProfileId: favorite.professionalProfileId,
        createdAt: favorite.createdAt,
        ...(profiles[index] ? { profile: profiles[index] } : {}),
      })),
      nextCursor: null,
    };
  }

  async updateAvailability(
    user: AuthUser,
    dto: UpdateAvailabilityDto,
  ): Promise<AvailabilityResponseDto> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId: user.id },
    });
    if (!profile || profile.status === ProfessionalStatus.SUSPENDED) {
      throw new ApiError(
        ERROR_CODES.PROFESSIONAL_NOT_ELIGIBLE,
        403,
        'Profil professionnel indisponible.',
      );
    }

    const availableFrom = this.resolveDate(dto.availableFrom, 'availableFrom');
    const availableUntil = this.resolveDate(dto.availableUntil, 'availableUntil');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.professionalProfile.update({
        where: { userId: user.id },
        data: {
          availabilityStatus: dto.status,
          ...('availableFrom' in dto ? { availableFrom } : {}),
          ...('availableUntil' in dto ? { availableUntil } : {}),
        },
        select: {
          availabilityStatus: true,
          availableFrom: true,
          availableUntil: true,
        },
      });
      await this.audit.write(
        {
          actorId: user.id,
          action: 'PROFESSIONAL.AVAILABILITY_UPDATED',
          targetType: 'ProfessionalProfile',
          targetId: profile.id,
          after: result,
        },
        tx,
      );
      return result;
    });

    return {
      status: updated.availabilityStatus,
      availableFrom: updated.availableFrom,
      availableUntil: updated.availableUntil,
    };
  }

  private async assertEligible(profileId: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { status: true } } },
    });
    if (!this.isEligible(profile?.status, profile?.user.status)) {
      throw new ApiError(ERROR_CODES.PROFESSIONAL_NOT_ELIGIBLE, 404, 'Profil public introuvable.');
    }
  }

  private isEligible(
    status: ProfessionalStatus | undefined,
    userStatus: UserStatus | undefined,
  ): boolean {
    return (
      status !== undefined &&
      userStatus === UserStatus.ACTIVE &&
      ALLOWED_PROFESSIONAL_STATUSES.includes(status)
    );
  }

  private toPublicProfile(
    row: Omit<SearchRow, 'distanceMeters'> & { distanceMeters: number | null },
    specialties: SpecialtyRow[],
    zones: ZoneRow[],
    distanceMeters: number | null = row.distanceMeters,
  ): PublicProfessionalProfileDto {
    const firstName = row.firstName?.trim() || 'Professionnel';
    const initial = row.lastName?.trim().charAt(0);
    return {
      id: row.id,
      displayName: initial ? `${firstName} ${initial}.` : firstName,
      status: row.status,
      certificationLabel:
        row.status === ProfessionalStatus.CERTIFIED ? 'Certifié ÉLECTRO ASSIST' : null,
      certifiedAt: row.certifiedAt,
      experienceYears: row.experienceYears,
      bio: row.bio,
      specialties,
      zones,
      availabilityStatus: row.availabilityStatus,
      availableFrom: row.availableFrom,
      availableUntil: row.availableUntil,
      distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
    };
  }

  private resolveDate(value: string | null | undefined, field: string): Date | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || value === '') {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Date invalide.', { field });
    }
    return date;
  }
}
