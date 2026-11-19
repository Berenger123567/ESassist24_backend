import { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp } from './utils/test-app';

describe('Recherche géographique des zones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    await prisma.serviceZone.upsert({
      where: { code: 'BJ-E2E-NEARBY-1' },
      update: { name: 'Cotonou E2E', department: 'Littoral' },
      create: { code: 'BJ-E2E-NEARBY-1', name: 'Cotonou E2E', department: 'Littoral' },
    });
    await prisma.serviceZone.upsert({
      where: { code: 'BJ-E2E-NEARBY-2' },
      update: { name: 'Abomey-Calavi E2E', department: 'Atlantique' },
      create: {
        code: 'BJ-E2E-NEARBY-2',
        name: 'Abomey-Calavi E2E',
        department: 'Atlantique',
      },
    });

    await prisma.$executeRaw(Prisma.sql`
      UPDATE "service_zones"
      SET "center" = ST_SetSRID(ST_MakePoint(0, 0), 4326)::geometry
      WHERE "code" = 'BJ-E2E-NEARBY-1'
    `);
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "service_zones"
      SET "center" = ST_SetSRID(ST_MakePoint(0.01, 0), 4326)::geometry
      WHERE "code" = 'BJ-E2E-NEARBY-2'
    `);
  });

  afterAll(async () => {
    await prisma.serviceZone.deleteMany({
      where: { code: { in: ['BJ-E2E-NEARBY-1', 'BJ-E2E-NEARBY-2'] } },
    });
    await app.close();
  });

  it('retourne les zones proches ordonnées par distance', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/zones/nearby')
      .query({ lat: 0, lng: 0, radiusKm: 25 })
      .expect(200);

    expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    expect(response.body.data[0].code).toBe('BJ-E2E-NEARBY-1');
    expect(response.body.data[0].distanceMeters).toBeGreaterThanOrEqual(0);
    expect(response.body.data[0].distanceMeters).toBeLessThan(1000);
  });

  it('filtre par rayon', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/zones/nearby')
      .query({ lat: 0, lng: 0, radiusKm: 1 })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].code).toBe('BJ-E2E-NEARBY-1');
  });

  it('rejette des coordonnées invalides', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/zones/nearby')
      .query({ lat: 100, lng: 2.3912, radiusKm: 25 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
