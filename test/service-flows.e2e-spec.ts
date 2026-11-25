import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PositionPurgeService } from '../src/modules/closure/position-purge.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createFlowDocument,
  createFlowProfessional,
  createFlowUser,
  createFlowZone,
} from './utils/service-flows';
import { createTestApp, resetData } from './utils/test-app';

describe('Étapes 5, 6 et 7 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counter = 0;
  let client: { id: string; token: string };
  let professional: { id: string; token: string; profileId: string };
  let zoneId: string;
  let specialtyId: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    try {
      await resetData(prisma);
      await prisma.serviceZone.deleteMany({
        where: { code: { startsWith: 'BJ-FLOW-' } },
      });
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    await resetData(prisma);
    const suffix = String(++counter).padStart(4, '0');
    const zone = await createFlowZone(prisma, `BJ-FLOW-${suffix}`, 0, 0);
    zoneId = zone.id;
    const specialty = await prisma.specialty.upsert({
      where: { code: 'BUILDING_REPAIR' },
      update: { active: true },
      create: {
        code: 'BUILDING_REPAIR',
        label: 'Électricité bâtiment',
        sortOrder: 1,
        active: true,
      },
    });
    specialtyId = specialty.id;
    client = await createFlowUser(app, prisma, `+2296000${suffix}`, 'CLIENT');
    professional = await createFlowProfessional(app, prisma, `+2297000${suffix}`, {
      specialtyId,
      zoneId,
    });
  });

  async function openRequest(): Promise<string> {
    const photoId = await createFlowDocument(prisma, client.id, 'APPROVED');
    const created = await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        type: 'ELECTRICAL_FAILURE',
        urgency: 'HIGH',
        zoneId,
        description: 'Coupure électrique dans le logement principal.',
        photoDocumentIds: [photoId],
      })
      .expect(201);
    return created.body.id;
  }

  async function acceptedMission(): Promise<string> {
    const requestId = await openRequest();
    const proposal = await request(app.getHttpServer())
      .post(`/api/v1/service-requests/${requestId}/proposals`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ message: 'Je peux intervenir rapidement sur site.' })
      .expect(200);
    const mission = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.body.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    return mission.body.id;
  }

  it('É5 : crée une demande, recherche un pro, gère favoris et disponibilité', async () => {
    await openRequest();

    const found = await request(app.getHttpServer())
      .get('/api/v1/professionals/search')
      .set('Authorization', `Bearer ${client.token}`)
      .query({ lat: 0, lng: 0, radiusKm: 10 })
      .expect(200);
    expect(found.body.data.map((item: { id: string }) => item.id)).toContain(
      professional.profileId,
    );

    const publicProfile = await request(app.getHttpServer())
      .get(`/api/v1/professionals/${professional.profileId}/public`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(publicProfile.body).not.toHaveProperty('address');

    await request(app.getHttpServer())
      .post(`/api/v1/professionals/${professional.profileId}/favorite`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(201);
    const favorites = await request(app.getHttpServer())
      .get('/api/v1/professionals/favorites')
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(favorites.body.data).toHaveLength(1);

    const availability = await request(app.getHttpServer())
      .patch('/api/v1/pro/availability')
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ status: 'BUSY' })
      .expect(200);
    expect(availability.body.status).toBe('BUSY');
  });

  it('É6 : propose, accepte, vérifie le code et échange des messages', async () => {
    const missionId = await acceptedMission();

    const generated = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code`)
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(generated.body.code).toMatch(/^\d{6}$/);

    const verified = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code/verify`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ code: generated.body.code })
      .expect(200);
    expect(verified.body.status).toBe('CODE_VERIFIED');

    const replay = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code/verify`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ code: generated.body.code })
      .expect(409);
    expect(replay.body.error.code).toBe('MISSION_INVALID_TRANSITION');

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${missionId}/messages`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ body: 'Je suis en route.' })
      .expect(404);

    const conversations = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(conversations.body.data).toHaveLength(1);

    const sent = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversations.body.data[0].id}/messages`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ body: 'Je suis en route.' })
      .expect(200);
    expect(sent.body.body).toBe('Je suis en route.');

    const messages = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversations.body.data[0].id}/messages`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(messages.body.data).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/conversations/${conversations.body.data[0].id}/messages/${sent.body.id}`)
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${conversations.body.data[0].id}/messages`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(0);
  });

  it('É7 : devis, rapport, clôture et traçabilité', async () => {
    const missionId = await acceptedMission();
    const generated = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code`)
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code/verify`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ code: generated.body.code })
      .expect(200);

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/quotes`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({
        lines: [{ label: 'Disjoncteur', quantity: 2, unitPriceCents: 15000 }],
        validUntil: new Date(Date.now() + 3600_000).toISOString(),
      })
      .expect(200);
    expect(quote.body.totalCents).toBe(30000);
    expect(quote.body.version).toBe(1);

    const accepted = await request(app.getHttpServer())
      .post(`/api/v1/quotes/${quote.body.id}/accept`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(accepted.body.status).toBe('WORK_AUTHORIZED');

    await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/events`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ type: 'DEPARTED' })
      .expect(200);

    const position = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/positions`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ lat: 14.716789, lng: -17.467789, accuracyMeters: 25 })
      .expect(200);
    expect(position.body.precisionDigits).toBe(3);
    const stored = await prisma.missionPosition.findFirstOrThrow({ where: { missionId } });
    expect(stored.lat).toBe(14.717);
    expect(stored.lng).toBe(-17.468);

    const tooSoon = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/positions`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ lat: 14.7167, lng: -17.4677 })
      .expect(429);
    expect(tooSoon.body.error.code).toBe('POSITION_TOO_SOON');

    const failedChecklist = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/report`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({
        summary: 'Intervention réalisée avec contrôle final.',
        checklist: [{ label: 'Consignation', critical: true, passed: false }],
      })
      .expect(400);
    expect(failedChecklist.body.error.code).toBe('CHECKLIST_CRITICAL_FAILED');

    const report = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/report`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({
        summary: 'Intervention réalisée avec contrôle final.',
        checklist: [{ label: 'Consignation', critical: true, passed: true }],
      })
      .expect(200);
    expect(report.body.missionId).toBe(missionId);

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/close`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(closed.body.status).toBe('CLOSED');

    const events = await prisma.missionEvent.findMany({ where: { missionId } });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['CREATED', 'ACCEPTED', 'CODE_VERIFIED', 'COMPLETED', 'CLOSED']),
    );
  });

  it('É7 : autorisation urgente et purge des positions', async () => {
    const missionId = await acceptedMission();
    const generated = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code`)
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/arrival-code/verify`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ code: generated.body.code })
      .expect(200);

    const authorized = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/authorize-emergency`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({ reason: 'Panne critique, accord verbal du client.' })
      .expect(200);
    expect(authorized.body.status).toBe('WORK_AUTHORIZED');

    await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/positions`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ lat: 14.7167, lng: -17.4677 })
      .expect(200);
    await prisma.missionPosition.updateMany({
      where: { missionId },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const purged = await app.get(PositionPurgeService).purge();
    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await prisma.missionPosition.count({ where: { missionId } })).toBe(0);
  });
});
