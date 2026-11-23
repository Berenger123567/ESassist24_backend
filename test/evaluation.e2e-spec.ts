import { INestApplication } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createTestApp, ensureRoles, resetData } from './utils/test-app';

const ADMIN_PHONE = '+22900000074';
const ADMIN_PASSWORD = 'AdminEvaluation123!';
const EVALUATOR_PHONE = '+22900000075';
const EVALUATOR_PASSWORD = 'EvaluatorEvaluation123!';
const OTHER_EVALUATOR_PHONE = '+22900000076';
const OTHER_EVALUATOR_PASSWORD = 'EvaluatorEvaluation456!';

describe('Évaluation pratique et certification (e2e)', () => {
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
    await createAdminUser(
      prisma,
      OTHER_EVALUATOR_PHONE,
      OTHER_EVALUATOR_PASSWORD,
      RoleCode.EVALUATOR,
    );
  });

  async function createVerifiedProfessional(adminToken: string): Promise<{
    token: string;
    userId: string;
    profileId: string;
  }> {
    const phone = `+229000000${String(80 + ++counter).padStart(2, '0')}`;
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    const token = verified.body.accessToken as string;
    const specialty = await prisma.specialty.findFirstOrThrow();
    const zone = await prisma.serviceZone.findFirstOrThrow();
    const profile = await request(app.getHttpServer())
      .put('/api/v1/pro/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({
        specialtyIds: [specialty.id],
        zoneIds: [zone.id],
        experienceYears: 8,
        bio: 'Électricien bâtiment.',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/verifications/${profile.body.id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Idempotency-Key', `evaluation-verify-${counter}`)
      .send({ decision: 'VERIFIED', reasonCode: 'VERIFIED_OK' })
      .expect(200);

    return {
      token,
      userId: profile.body.userId as string,
      profileId: profile.body.id as string,
    };
  }

  async function createGrid(adminToken: string): Promise<{
    gridId: string;
    gridCode: string;
    securityCriterionId: string;
    practiceCriterionId: string;
  }> {
    const gridCode = `GRID-E4-${++counter}`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/evaluation-grids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: gridCode,
        label: 'Grille électricité bâtiment',
        passScore: 70,
      })
      .expect(201);

    const criteria = await request(app.getHttpServer())
      .put(`/api/v1/admin/evaluation-grids/${created.body.id}/criteria`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        criteria: [
          { code: 'SECURITE', label: 'Sécurité électrique', weight: 30, sortOrder: 0 },
          { code: 'PRATIQUE', label: 'Mise en pratique', weight: 70, sortOrder: 1 },
        ],
      })
      .expect(200);

    return {
      gridId: created.body.id as string,
      gridCode,
      securityCriterionId: criteria.body.criteria[0].id as string,
      practiceCriterionId: criteria.body.criteria[1].id as string,
    };
  }

  async function assignEvaluation(
    adminToken: string,
    profileId: string,
    gridId: string,
  ): Promise<string> {
    const evaluator = await prisma.user.findUniqueOrThrow({ where: { phone: EVALUATOR_PHONE } });
    const assignment = await request(app.getHttpServer())
      .post('/api/v1/admin/evaluations/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        profileId,
        evaluatorId: evaluator.id,
        gridId,
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        notes: 'Évaluation initiale.',
      })
      .expect(201);
    return assignment.body.id as string;
  }

  it('certifie automatiquement après une évaluation réussie', async () => {
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
    const evaluatorToken = await loginAdmin(app, EVALUATOR_PHONE, EVALUATOR_PASSWORD);
    const professional = await createVerifiedProfessional(adminToken);
    const grid = await createGrid(adminToken);
    const assignmentId = await assignEvaluation(adminToken, professional.profileId, grid.gridId);

    const evaluators = await request(app.getHttpServer())
      .get('/api/v1/admin/evaluators')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(evaluators.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ phone: EVALUATOR_PHONE })]),
    );

    const mine = await request(app.getHttpServer())
      .get('/api/v1/evaluator/assignments')
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .expect(200);
    expect(mine.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: assignmentId, status: 'ASSIGNED' })]),
    );

    const saved = await request(app.getHttpServer())
      .put(`/api/v1/evaluator/assignments/${assignmentId}/results`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .send({
        results: [
          { criterionId: grid.securityCriterionId, score: 30, comment: 'Conforme.' },
          { criterionId: grid.practiceCriterionId, score: 55 },
        ],
      })
      .expect(200);
    expect(saved.body.status).toBe('IN_PROGRESS');
    expect(saved.body.results).toHaveLength(2);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/evaluator/assignments/${assignmentId}/submit`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .expect(200);
    expect(submitted.body).toEqual(expect.objectContaining({ score: 85, passed: true }));

    const certification = await request(app.getHttpServer())
      .get('/api/v1/pro/certification')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(certification.body).toEqual(
      expect.objectContaining({
        status: 'CERTIFIED',
        label: 'Certifié ÉLECTRO ASSIST',
        isDiploma: false,
        certifiedAt: expect.any(String),
      }),
    );
    expect(certification.body.badge).toEqual({
      label: 'Certifié ÉLECTRO ASSIST',
      kind: 'BADGE',
      isDiploma: false,
    });
    expect(certification.body.evaluation).toEqual(
      expect.objectContaining({ score: 85, passed: true, gridCode: grid.gridCode }),
    );

    const profile = await request(app.getHttpServer())
      .get('/api/v1/pro/profile')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(profile.body.status).toBe('CERTIFIED');
    expect(profile.body.certification).toEqual(
      expect.objectContaining({
        status: 'CERTIFIED',
        label: 'Certifié ÉLECTRO ASSIST',
        isDiploma: false,
      }),
    );

    const stored = await prisma.professionalProfile.findUniqueOrThrow({
      where: { id: professional.profileId },
    });
    expect(stored.status).toBe('CERTIFIED');
    expect(stored.certifiedAt).not.toBeNull();

    const logs = await request(app.getHttpServer())
      .get(`/api/v1/admin/audit-logs?targetId=${assignmentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(logs.body.data).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'EVALUATION.SUBMITTED' })]),
    );
  });

  it('protège les assignations, verrouille la grille et refuse une seconde soumission', async () => {
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
    const evaluatorToken = await loginAdmin(app, EVALUATOR_PHONE, EVALUATOR_PASSWORD);
    const otherEvaluatorToken = await loginAdmin(
      app,
      OTHER_EVALUATOR_PHONE,
      OTHER_EVALUATOR_PASSWORD,
    );
    const professional = await createVerifiedProfessional(adminToken);
    const grid = await createGrid(adminToken);
    const assignmentId = await assignEvaluation(adminToken, professional.profileId, grid.gridId);

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/evaluator/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const hidden = await request(app.getHttpServer())
      .get(`/api/v1/evaluator/assignments/${assignmentId}`)
      .set('Authorization', `Bearer ${otherEvaluatorToken}`)
      .expect(404);
    expect(hidden.body.error.code).toBe('EVALUATION_NOT_ASSIGNED_TO_EVALUATOR');

    const locked = await request(app.getHttpServer())
      .put(`/api/v1/admin/evaluation-grids/${grid.gridId}/criteria`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        criteria: [{ code: 'UNIQUE', label: 'Critère unique', weight: 100, sortOrder: 0 }],
      })
      .expect(409);
    expect(locked.body.error.code).toBe('EVALUATION_GRID_LOCKED');

    await request(app.getHttpServer())
      .put(`/api/v1/evaluator/assignments/${assignmentId}/results`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .send({
        results: [
          { criterionId: grid.securityCriterionId, score: 20 },
          { criterionId: grid.practiceCriterionId, score: 40 },
        ],
      })
      .expect(200);

    const submitted = await request(app.getHttpServer())
      .post(`/api/v1/evaluator/assignments/${assignmentId}/submit`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .expect(200);
    expect(submitted.body).toEqual(expect.objectContaining({ score: 60, passed: false }));

    const second = await request(app.getHttpServer())
      .post(`/api/v1/evaluator/assignments/${assignmentId}/submit`)
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .expect(409);
    expect(second.body.error.code).toBe('EVALUATION_ALREADY_SUBMITTED');

    const certification = await request(app.getHttpServer())
      .get('/api/v1/pro/certification')
      .set('Authorization', `Bearer ${professional.token}`)
      .expect(200);
    expect(certification.body.status).toBe('VERIFIED');
    expect(certification.body.badge).toBeNull();
  });
});
