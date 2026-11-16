import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetData } from './utils/test-app';

const SPECIALTIES = [
  { code: 'BUILDING_REPAIR', label: 'Électricité bâtiment et dépannage', sortOrder: 1 },
  {
    code: 'INDUSTRIAL',
    label: 'Électricité industrielle et maintenance',
    sortOrder: 2,
  },
  { code: 'SOLAR_PV', label: 'Solaire photovoltaïque', sortOrder: 3 },
  { code: 'GENERATORS', label: 'Groupes électrogènes', sortOrder: 4 },
  {
    code: 'PANELS_THREE_PHASE',
    label: 'Tableaux électriques, installations triphasées et mise à la terre',
    sortOrder: 5,
  },
] as const;

const ZONES = [
  { code: 'BJ-LIT-COTONOU', name: 'Cotonou', department: 'Littoral' },
  { code: 'BJ-ATL-ABOMEY-CALAVI', name: 'Abomey-Calavi', department: 'Atlantique' },
] as const;

describe('Profils, spÃ©cialitÃ©s et zones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let loginCounter = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    for (const specialty of SPECIALTIES) {
      await prisma.specialty.upsert({
        where: { code: specialty.code },
        update: { label: specialty.label, sortOrder: specialty.sortOrder },
        create: specialty,
      });
    }
    for (const zone of ZONES) {
      await prisma.serviceZone.upsert({
        where: { code: zone.code },
        update: { name: zone.name, department: zone.department },
        create: zone,
      });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(prisma);

    const phone = `+2290000000${++loginCounter}`;
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    token = verified.body.accessToken;
  });

  it('expose les cinq spÃ©cialitÃ©s du cahier', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/specialties').expect(200);

    expect(response.body.data).toHaveLength(5);
    expect(response.body.data.map((item: { code: string }) => item.code).sort()).toEqual(
      SPECIALTIES.map((specialty) => specialty.code).sort(),
    );
  });

  it('pagine les zones par curseur', async () => {
    const first = await request(app.getHttpServer()).get('/api/v1/zones?limit=1').expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.nextCursor).toBeTruthy();

    const second = await request(app.getHttpServer())
      .get(`/api/v1/zones?limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`)
      .expect(200);
    expect(second.body.data).toHaveLength(1);
    expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  });

  it('met Ã  jour le profil sans exposer dâ€™adresse privÃ©e', async () => {
    const zones = await prisma.serviceZone.findMany({ orderBy: { name: 'asc' } });
    const response = await request(app.getHttpServer())
      .put('/api/v1/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        firstName: 'Jean',
        lastName: 'Dossou',
        zoneId: zones[0].id,
      })
      .expect(200);

    expect(response.body.firstName).toBe('Jean');
    expect(response.body.zone.name).toBe(zones[0].name);
    expect(response.body).not.toHaveProperty('address');
    expect(response.body.zone).not.toHaveProperty('address');
  });

  it('crÃ©e le profil professionnel et attribue le rÃ´le PROFESSIONAL', async () => {
    const specialties = await prisma.specialty.findMany({
      where: { code: { in: ['BUILDING_REPAIR', 'SOLAR_PV'] } },
    });
    const zones = await prisma.serviceZone.findMany();

    const created = await request(app.getHttpServer())
      .put('/api/v1/me/professional-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialtyIds: specialties.map((specialty) => specialty.id),
        zoneIds: zones.map((zone) => zone.id),
        experienceYears: 8,
        bio: 'Ã‰lectricien bÃ¢timent et solaire.',
      })
      .expect(200);

    expect(created.body.status).toBe('PENDING');
    expect(created.body.statusLabel).toBe('En attente');
    expect(created.body.specialties).toHaveLength(2);

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.roles).toEqual(expect.arrayContaining(['CLIENT', 'PROFESSIONAL']));

    const fetched = await request(app.getHttpServer())
      .get('/api/v1/me/professional-profile')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(fetched.body.zones.length).toBeGreaterThan(0);
  });

  it('refuse une spÃ©cialitÃ© inconnue', async () => {
    const zone = await prisma.serviceZone.findFirstOrThrow();
    const response = await request(app.getHttpServer())
      .put('/api/v1/me/professional-profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialtyIds: [randomUUID()],
        zoneIds: [zone.id],
        experienceYears: 2,
      })
      .expect(422);

    expect(response.body.error.code).toBe('SPECIALTY_NOT_FOUND');
  });

  it('refuse les routes de profil sans jeton', async () => {
    await request(app.getHttpServer()).get('/api/v1/me/profile').expect(401);
    await request(app.getHttpServer()).put('/api/v1/me/profile').send({}).expect(401);
  });
});
