import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, ProfessionalStatus, RoleCode } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ensureRoles } from './test-app';

export interface FlowUser {
  id: string;
  phone: string;
  token: string;
}

export async function createFlowUser(
  app: INestApplication,
  prisma: PrismaService,
  phone: string,
  role: RoleCode,
): Promise<FlowUser> {
  await ensureRoles(prisma);
  const user = await prisma.user.create({
    data: { phone, firstName: 'Test', lastName: role },
  });
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
  await prisma.userRole.create({
    data: { userId: user.id, roleId: roleRow.id },
  });
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash: randomUUID(),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  const jwt = app.get(JwtService);
  const config = app.get(ConfigService);
  const token = await jwt.signAsync(
    { sub: user.id, sid: session.id, roles: [role] },
    { secret: config.getOrThrow<string>('JWT_ACCESS_SECRET') },
  );
  return { id: user.id, phone, token };
}

export async function createFlowProfessional(
  app: INestApplication,
  prisma: PrismaService,
  phone: string,
  options: { status?: ProfessionalStatus; specialtyId?: string; zoneId?: string } = {},
): Promise<FlowUser & { profileId: string }> {
  const user = await createFlowUser(app, prisma, phone, RoleCode.PROFESSIONAL);
  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      status: options.status ?? ProfessionalStatus.VERIFIED,
    },
  });
  if (options.specialtyId) {
    await prisma.professionalSpecialty.create({
      data: { profileId: profile.id, specialtyId: options.specialtyId },
    });
  }
  if (options.zoneId) {
    await prisma.professionalZone.create({
      data: { profileId: profile.id, zoneId: options.zoneId },
    });
  }
  return { ...user, profileId: profile.id };
}

export async function createFlowZone(
  prisma: PrismaService,
  code: string,
  lat = 0,
  lng = 0,
): Promise<{ id: string; code: string }> {
  const zone = await prisma.serviceZone.upsert({
    where: { code },
    update: { name: code, department: 'Test' },
    create: { code, name: code, department: 'Test' },
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "service_zones"
    SET "center" = ST_SetSRID(ST_MakePoint(${lng}::float8, ${lat}::float8), 4326)::geometry
    WHERE "id" = ${zone.id}::uuid
  `);
  return { id: zone.id, code: zone.code };
}

export async function createFlowDocument(
  prisma: PrismaService,
  ownerId: string,
  status: 'PENDING' | 'APPROVED' | 'SUBMITTED' = 'APPROVED',
): Promise<string> {
  const document = await prisma.document.create({
    data: {
      ownerId,
      type: 'BREAKDOWN_PHOTO',
      status,
      fileName: 'panne.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1024,
      storageKey: randomUUID(),
    },
  });
  return document.id;
}
