import { INestApplication } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import request from 'supertest';
import { PaymentProviderAdapter } from '../src/modules/payments/payment-provider.adapter';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createFlowProfessional, createFlowUser, createFlowZone } from './utils/service-flows';
import { createTestApp, resetData } from './utils/test-app';

describe('Étapes 8, 9 et 10 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counter = 0;
  let zoneId: string;

  const adminPhone = '+22900000020';
  const adminPassword = 'AdminStage8123!';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    try {
      await resetData(prisma);
      await prisma.serviceZone.deleteMany({ where: { code: { startsWith: 'BJ-STAGE-' } } });
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    await resetData(prisma);
    const suffix = String(++counter).padStart(4, '0');
    const zone = await createFlowZone(prisma, `BJ-STAGE-${suffix}`, 0, 0);
    zoneId = zone.id;
    await createAdminUser(prisma, adminPhone, adminPassword);
  });

  async function context() {
    const suffix = String(counter).padStart(4, '0');
    const client = await createFlowUser(app, prisma, `+2298100${suffix}`, RoleCode.CLIENT);
    const professional = await createFlowProfessional(app, prisma, `+2298200${suffix}`);
    await prisma.professionalZone.create({
      data: { profileId: professional.profileId, zoneId },
    });
    return { client, professional };
  }

  async function closedMission(clientToken: string, professionalToken: string) {
    const created = await request(app.getHttpServer())
      .post('/api/v1/service-requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        type: 'ELECTRICAL_FAILURE',
        urgency: 'HIGH',
        zoneId,
        description: 'Panne électrique nécessitant une intervention complète.',
        photoDocumentIds: [],
      })
      .expect(201);

    const proposal = await request(app.getHttpServer())
      .post(`/api/v1/service-requests/${created.body.id}/proposals`)
      .set('Authorization', `Bearer ${professionalToken}`)
      .send({ message: 'Je peux intervenir sur site dans la journée.' })
      .expect(200);

    const mission = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.body.id}/accept`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    const generated = await request(app.getHttpServer())
      .post(`/api/v1/missions/${mission.body.id}/arrival-code`)
      .set('Authorization', `Bearer ${professionalToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/missions/${mission.body.id}/arrival-code/verify`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ code: generated.body.code })
      .expect(200);

    const quote = await request(app.getHttpServer())
      .post(`/api/v1/missions/${mission.body.id}/quotes`)
      .set('Authorization', `Bearer ${professionalToken}`)
      .send({
        lines: [{ label: 'Disjoncteur', quantity: 2, unitPriceCents: 15000 }],
        validUntil: new Date(Date.now() + 3600_000).toISOString(),
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/quotes/${quote.body.id}/accept`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/missions/${mission.body.id}/report`)
      .set('Authorization', `Bearer ${professionalToken}`)
      .send({
        summary: 'Intervention réalisée avec contrôle final de mise sous tension.',
        checklist: [{ label: 'Consignation', critical: true, passed: true }],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/missions/${mission.body.id}/close`)
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);

    return { missionId: mission.body.id as string, totalCents: quote.body.totalCents as number };
  }

  async function webhook(body: Record<string, unknown>, expectedStatus = 200) {
    const adapter = app.get(PaymentProviderAdapter);
    const raw = JSON.stringify(body);
    const signature = adapter.generateSignature(raw, body.eventId as string);
    return request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/cinetpay')
      .set('Content-Type', 'application/json')
      .set('x-cinetpay-signature', signature)
      .send(raw)
      .expect(expectedStatus);
  }

  it('É8 : intention de paiement, confirmation, grand livre et réconciliation', async () => {
    const { client, professional } = await context();
    const { missionId } = await closedMission(client.token, professional.token);

    const intent = await request(app.getHttpServer())
      .post(`/api/v1/payments/missions/${missionId}/intent`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(intent.body.status).toBe('PENDING');
    expect(intent.body.amountCents).toBeGreaterThan(30000);

    const confirmed = await request(app.getHttpServer())
      .post(`/api/v1/payments/${intent.body.id}/confirm`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const accounts = await request(app.getHttpServer())
      .get('/api/v1/ledger/me')
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(accounts.body.length).toBeGreaterThan(0);
    const entries = await request(app.getHttpServer())
      .get('/api/v1/ledger/me/entries')
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(entries.body.data.length).toBeGreaterThan(0);

    const fees = await prisma.feeCharge.count({ where: { missionId } });
    expect(fees).toBe(3);

    const today = new Date().toISOString().slice(0, 10);
    const reports = await request(app.getHttpServer())
      .get('/api/v1/payments/reconciliation')
      .set('Authorization', `Bearer ${await loginAdmin(app, adminPhone, adminPassword)}`)
      .query({ date: today })
      .expect(200);
    expect(reports.body[0].status).toBe('OK');
  });

  it('É8 : webhook signé idempotent et abonnement PRO activé', async () => {
    const { client, professional } = await context();
    const { missionId } = await closedMission(client.token, professional.token);

    const intent = await request(app.getHttpServer())
      .post(`/api/v1/payments/missions/${missionId}/intent`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);

    const event = {
      eventId: `evt-${Date.now()}`,
      eventType: 'PAYMENT.CONFIRMED',
      reference: intent.body.reference,
      amountCents: intent.body.amountCents,
      status: 'SUCCESS',
      providerPaymentId: 'provider-123',
    };
    await webhook(event);
    const replay = await webhook(event, 409);
    expect(replay.body.error.code).toBe('PAYMENT_WEBHOOK_REPLAYED');

    const invalid = await request(app.getHttpServer())
      .post('/api/v1/webhooks/payments/cinetpay')
      .set('Content-Type', 'application/json')
      .set('x-cinetpay-signature', 'invalid')
      .send(JSON.stringify({ ...event, eventId: `${event.eventId}-invalid` }))
      .expect(401);
    expect(invalid.body.error.code).toBe('PAYMENT_WEBHOOK_SIGNATURE_INVALID');

    const checkout = await request(app.getHttpServer())
      .post('/api/v1/subscriptions')
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ plan: 'PRO', autoRenew: true })
      .expect(200);
    await webhook(
      {
        eventId: `sub-${Date.now()}`,
        eventType: 'PAYMENT.CONFIRMED',
        reference: checkout.body.reference,
        amountCents: checkout.body.amountCents,
        status: 'SUCCESS',
        providerPaymentId: 'provider-sub-123',
      },
      200,
    );

    const mine = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/mine')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(mine.body.data[0].status).toBe('ACTIVE');
  });

  it('É9 : avis, réputation, réclamation, garantie, suspension et recours', async () => {
    const { client, professional } = await context();
    const { missionId } = await closedMission(client.token, professional.token);

    const review = await request(app.getHttpServer())
      .post(`/api/v1/missions/${missionId}/reviews`)
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        quality: 5,
        timeliness: 4,
        behaviour: 5,
        quoteCompliance: 5,
        safety: 4,
        comment: 'Intervention propre, ponctuelle et conforme au devis.',
      })
      .expect(201);
    expect(review.body.weightedScore).toBeCloseTo(4.6, 5);

    await request(app.getHttpServer())
      .post(`/api/v1/reviews/${review.body.id}/response`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ body: 'Merci pour cette évaluation précise et constructive.' })
      .expect(200);

    const reputation = await request(app.getHttpServer())
      .get(`/api/v1/professionals/${professional.profileId}/reputation`)
      .expect(200);
    expect(reputation.body.score).toBeCloseTo(4.6, 5);

    const guarantee = await request(app.getHttpServer())
      .get(`/api/v1/missions/${missionId}/guarantee`)
      .set('Authorization', `Bearer ${client.token}`)
      .expect(200);
    expect(guarantee.body.status).toBe('ACTIVE');

    const claim = await request(app.getHttpServer())
      .post('/api/v1/claims')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        missionId,
        respondentProfileId: professional.profileId,
        subject: 'Contrôle après intervention',
        description: 'Je souhaite une vérification complémentaire de l’installation.',
      })
      .expect(201);
    expect(claim.body.status).toBe('OPEN');

    const adminToken = await loginAdmin(app, adminPhone, adminPassword);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/claims/${claim.body.id}/acknowledge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/admin/claims/${claim.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'Un contrôle complémentaire a été programmé et validé.' })
      .expect(200);
    expect(resolved.body.status).toBe('RESOLVED');

    const suspension = await request(app.getHttpServer())
      .post(`/api/v1/admin/professionals/${professional.profileId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Signalement grave nécessitant une suspension conservatoire.' })
      .expect(200);
    expect(suspension.body.status).toBe('ACTIVE');

    const blocked = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/mine')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const appeal = await request(app.getHttpServer())
      .post(`/api/v1/suspensions/${suspension.body.id}/appeal`)
      .set('Authorization', `Bearer ${professional.token}`)
      .send({ body: 'Je conteste cette suspension et fournis les justificatifs demandés.' })
      .expect(201);
    expect(appeal.body.status).toBe('PENDING');

    const decided = await request(app.getHttpServer())
      .post(`/api/v1/admin/suspensions/${suspension.body.id}/appeal/decide`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'ACCEPTED', reason: 'Pièces justificatives reçues et vérifiées.' })
      .expect(200);
    expect(decided.body.appeal.status).toBe('ACCEPTED');
  });

  it('É10 : textes légaux, consentements, santé, sauvegardes et posture', async () => {
    const { client } = await context();
    const adminToken = await loginAdmin(app, adminPhone, adminPassword);
    const checksum = 'a'.repeat(64);

    for (const type of ['TERMS', 'PRIVACY']) {
      await request(app.getHttpServer())
        .post('/api/v1/legal/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type, version: '1.0.0', title: `Document ${type}`, content: 'Texte intégral.' })
        .expect(200);
    }

    const latest = await request(app.getHttpServer())
      .get('/api/v1/legal/documents/TERMS/latest')
      .expect(200);
    expect(latest.body.version).toBe('1.0.0');

    const consents = await request(app.getHttpServer())
      .post('/api/v1/legal/consents')
      .set('Authorization', `Bearer ${client.token}`)
      .send({
        documents: [
          { type: 'TERMS', version: '1.0.0' },
          { type: 'PRIVACY', version: '1.0.0' },
        ],
      })
      .expect(200);
    expect(consents.body).toHaveLength(2);

    const ready = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(ready.body.versions.contract).toBe('1.2.0');

    const backup = await request(app.getHttpServer())
      .post('/api/v1/admin/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'SUCCESS',
        sizeBytes: 1024,
        location: 's3://backups/stage8.sql.gz',
        checksum,
      })
      .expect(200);
    expect(backup.body.checksum).toBe(checksum);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/backups/${backup.body.id}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ restoredAt: new Date().toISOString(), checksum })
      .expect(200);
    const record = await prisma.backupRecord.findUniqueOrThrow({ where: { id: backup.body.id } });
    expect(record.restoredAt).toBeTruthy();

    const posture = await request(app.getHttpServer())
      .get('/api/v1/admin/security-posture')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(posture.body.immutableLedger.appendOnly).toBe(true);
  });
});
