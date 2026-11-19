import { hash as hashPassword } from '@node-rs/argon2';
import { INestApplication } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createAdminUser(
  prisma: PrismaService,
  phone: string,
  password: string,
  role: RoleCode = RoleCode.ADMIN,
): Promise<string> {
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, firstName: 'Admin', lastName: 'Test' },
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: role } });
  const clientRole = await prisma.role.findUniqueOrThrow({ where: { code: RoleCode.CLIENT } });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: clientRole.id } },
    update: {},
    create: { userId: user.id, roleId: clientRole.id },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: adminRole.id } },
    update: {},
    create: { userId: user.id, roleId: adminRole.id },
  });

  await prisma.adminCredential.upsert({
    where: { userId: user.id },
    update: {
      passwordHash: await hashPassword(password),
      failedLoginAttempts: 0,
      lockedUntil: null,
      totpSecret: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
    },
    create: {
      userId: user.id,
      passwordHash: await hashPassword(password),
    },
  });

  return user.id;
}

export async function loginAdmin(
  app: INestApplication,
  phone: string,
  password: string,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/admin/auth/login')
    .send({ phone, password })
    .expect(200);

  return response.body.accessToken;
}
