import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DevicePlatform,
  DocumentStatus,
  DocumentType,
  PushProvider,
  RoleCode,
} from '@prisma/client';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createTestApp, ensureRoles, resetData } from './utils/test-app';

const ADMIN_PHONE = '+22900000064';
const ADMIN_PASSWORD = 'AdminVerification123!';
const EVALUATOR_PHONE = '+22900000065';
const EVALUATOR_PASSWORD = 'EvaluatorVerification123!';

describe('Centre de confiance - vérification (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let counter = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    await prisma.specialty.upsert({
      where: { code: 'BUILDING_REPAIR' },
      update: {},
      create: {
        code: 'BUILDING_REPAIR',
        label: 'Électricité bâtiment et dépannage',
        sortOrder: 1,
      },
    });
    await prisma.serviceZone.upsert({
      where: { code: 'BJ-LIT-COTONOU' },
      update: {},
      create: { code: 'BJ-LIT-COTONOU', name: 'Cotonou', department: 'Littoral' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(prisma);
    await ensureRoles(prisma);
    await createAdminUser(prisma, ADMIN_PHONE, ADMIN_PASSWORD);
    await createAdminUser(prisma, EVALUATOR_PHONE, EVALUATOR_PASSWORD, RoleCode.EVALUATOR);
  });

  async function createClientProfile(): Promise<{
    token: string;
    userId: string;
    profileId: string;
  }> {
    const phone = `+229000000${String(++counter).padStart(2, '0')}`;
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    const token = verified.body.accessToken as string;
    const specialty = await prisma.specialty.findFirstOrThrow();
    const zone = await prisma.serviceZone.findFirstOrThrow();
    const response = await request(app.getHttpServer())
      .put('/api/v1/pro/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialtyIds: [specialty.id],
        zoneIds: [zone.id],
        experienceYears: 8,
        bio: 'Électricien bâtiment.',
      })
      .expect(200);
    return {
      token,
      userId: response.body.userId as string,
      profileId: response.body.id as string,
    };
  }

  it('liste la file avec les champs SLA et refuse un évaluateur', async () => {
    const profile = await createClientProfile();
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);

    const list = await request(app.getHttpServer())
      .get('/api/v1/admin/verifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: profile.profileId,
          status: 'PENDING',
          ageDays: expect.any(Number),
          slaDueAt: expect.any(String),
          overdue: expect.any(Boolean),
        }),
      ]),
    );

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/verifications/${profile.profileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.profileId).toBe(profile.profileId);

    const evaluatorToken = await loginAdmin(app, EVALUATOR_PHONE, EVALUATOR_PASSWORD);
    await request(app.getHttpServer())
      .get('/api/v1/admin/verifications')
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .expect(403);
  });

  it('applique une décision VERIFIEE avec audit et notification', async () => {
    const profile = await createClientProfile();
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);

    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${profile.token}`)
      .send({
        deviceId: randomUUID(),
        platform: DevicePlatform.ANDROID,
        pushProvider: PushProvider.EXPO,
        pushToken: 'ExponentPushToken[test]',
        notificationsEnabled: true,
      })
      .expect(201);

    const decision = await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.profileId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'verification-approved-001')
      .send({ decision: 'VERIFIED', reasonCode: 'VERIFIED_OK' })
      .expect(200);
    expect(decision.body).toEqual(
      expect.objectContaining({
        decision: 'VERIFIED',
        profileStatus: 'VERIFIED',
        replayed: false,
      }),
    );

    const stored = await prisma.professionalProfile.findUniqueOrThrow({
      where: { id: profile.profileId },
    });
    expect(stored.status).toBe('VERIFIED');

    const notifications = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${profile.token}`)
      .expect(200);
    expect(notifications.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'VERIFICATION_APPROVED' })]),
    );

    const notificationId = notifications.body.data[0].id as string;
    const marked = await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${profile.token}`)
      .expect(200);
    expect(marked.body.status).toBe('READ');

    const logs = await request(app.getHttpServer())
      .get(`/api/v1/admin/audit-logs?targetId=${profile.profileId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logs.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'VERIFICATION.VERIFIED' })]),
    );
  });

  it('garantit l’idempotence et refuse une seconde décision définitive', async () => {
    const profile = await createClientProfile();
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
    const payload = {
      decision: 'REFUSED',
      reasonCode: 'DOCUMENT_MISSING',
      reasonText: 'Pièce manquante depuis plusieurs semaines.',
    };

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.profileId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'verification-refused-001')
      .send(payload)
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.profileId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'verification-refused-001')
      .send(payload)
      .expect(200);
    expect(replay.body).toEqual({ ...first.body, replayed: true });

    const conflict = await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.profileId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'verification-refused-002')
      .send(payload)
      .expect(409);
    expect(conflict.body.error.code).toBe('VERIFICATION_CONFLICT');
    expect(
      await prisma.verificationDecision.count({ where: { profileId: profile.profileId } }),
    ).toBe(1);
  });

  it('gère la demande de complément puis la soumission', async () => {
    const profile = await createClientProfile();
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);

    const decision = await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.profileId}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', 'verification-complement-001')
      .send({
        decision: 'COMPLEMENT_REQUESTED',
        reasonCode: 'DOCUMENT_UNREADABLE',
        reasonText: 'La pièce fournie est illisible, merci de la téléverser à nouveau.',
        requestedItems: ['ID_CARD'],
      })
      .expect(200);
    expect(decision.body.profileStatus).toBe('PENDING');
    expect(decision.body.complementDueAt).toBeTruthy();

    const specialty = await prisma.specialty.findFirstOrThrow();
    const zone = await prisma.serviceZone.findFirstOrThrow();
    const resubmitted = await request(app.getHttpServer())
      .put('/api/v1/pro/profile')
      .set('Authorization', `Bearer ${profile.token}`)
      .send({
        specialtyIds: [specialty.id],
        zoneIds: [zone.id],
        experienceYears: 9,
      })
      .expect(200);
    expect(resubmitted.body.status).toBe('PENDING');
    expect(resubmitted.body.submissionCount).toBe(2);
    expect(resubmitted.body.complementRequestedAt).toBeNull();
    expect(resubmitted.body.complementDueAt).toBeNull();
  });

  it('refuse les IP administrateurs hors allowlist', async () => {
    const config = app.get(ConfigService);
    const previousAllowlist = config.get<string>('ADMIN_IP_ALLOWLIST');
    const previousBypass = config.get<string>('ADMIN_IP_DEV_BYPASS');
    config.set('ADMIN_IP_ALLOWLIST', '203.0.113.0/24');
    config.set('ADMIN_IP_DEV_BYPASS', 'false');
    try {
      const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/verifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
      expect(response.body.error.code).toBe('IP_NOT_ALLOWED');
    } finally {
      config.set('ADMIN_IP_ALLOWLIST', previousAllowlist ?? '');
      config.set('ADMIN_IP_DEV_BYPASS', previousBypass ?? 'true');
    }
  });

  it('lie le lien de consultation à la session admin et désactive le cache', async () => {
    const profile = await createClientProfile();
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
    const storageKey = `${randomUUID()}.pdf`;
    const storageDir = resolve(
      process.cwd(),
      process.env.DOCUMENT_STORAGE_DIR ?? './.tmp-document-storage',
    );
    await mkdir(storageDir, { recursive: true });
    const filePath = resolve(storageDir, storageKey);
    await writeFile(filePath, '%PDF-1.4 test');
    const document = await prisma.document.create({
      data: {
        ownerId: profile.userId,
        type: DocumentType.ID_CARD,
        status: DocumentStatus.SUBMITTED,
        fileName: 'piece.pdf',
        contentType: 'application/pdf',
        detectedContentType: 'application/pdf',
        sizeBytes: 15,
        storageKey,
        uploadedAt: new Date(),
      },
    });

    try {
      const issued = await request(app.getHttpServer())
        .get(`/api/v1/admin/documents/${document.id}/view-url`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(issued.body.expiresInSeconds).toBe(300);
      expect(issued.body.viewUrl).toContain('/api/v1/admin/documents/view/');

      const viewed = await request(app.getHttpServer())
        .get(issued.body.viewUrl)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(viewed.headers['cache-control']).toBe('no-store');

      const otherToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
      await request(app.getHttpServer())
        .get(issued.body.viewUrl)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      const logs = await prisma.auditLog.findMany({
        where: { targetType: 'Document', targetId: document.id },
      });
      expect(logs.map((log) => log.action)).toContain('DOCUMENT.VIEW_LINK_ISSUED');
      expect(logs.some((log) => JSON.stringify(log.after ?? '').includes('viewUrl'))).toBe(false);
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  });
});
