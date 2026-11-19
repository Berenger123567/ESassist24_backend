import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { generateTotpCode } from '../src/common/utils/totp.util';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createTestApp, ensureRoles, resetData } from './utils/test-app';

const ADMIN_PHONE = '+22900000004';
const ADMIN_PASSWORD = 'AdminTest123!';
const EVALUATOR_PHONE = '+22900000055';
const EVALUATOR_PASSWORD = 'Evaluator123!';

describe('Administration et MFA (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(prisma);
    await ensureRoles(prisma);
    await createAdminUser(prisma, ADMIN_PHONE, ADMIN_PASSWORD);
  });

  it('refuse des identifiants administrateur invalides', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ phone: ADMIN_PHONE, password: 'WrongPassword123!' })
      .expect(401);

    expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('enrôle le TOTP puis exige un code à la connexion', async () => {
    const token = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);

    const enrollment = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/totp/enroll')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(enrollment.body.secret).toBeTruthy();

    const code = generateTotpCode(enrollment.body.secret);
    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/totp/activate')
      .set('Authorization', `Bearer ${token}`)
      .send({ code })
      .expect(200);

    const admin = await prisma.user.findUniqueOrThrow({ where: { phone: ADMIN_PHONE } });
    await prisma.adminCredential.update({
      where: { userId: admin.id },
      data: { totpLastUsedStep: Math.floor(Date.now() / 30_000) - 1 },
    });

    const challenge = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
      .expect(200);
    expect(challenge.body.mfaRequired).toBe(true);
    expect(challenge.body.mfaToken).toBeTruthy();

    const mfaCode = generateTotpCode(enrollment.body.secret);
    const verified = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/totp/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: mfaCode })
      .expect(200);
    expect(verified.body.accessToken).toBeTruthy();

    const replay = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/totp/verify')
      .send({ mfaToken: challenge.body.mfaToken, code: mfaCode })
      .expect(401);
    expect(replay.body.error.code).toBe('AUTH_MFA_INVALID');
  });

  it('crée une invitation évaluateur, l’accepte puis applique les rôles', async () => {
    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);

    const invitation = await request(app.getHttpServer())
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: EVALUATOR_PHONE, role: 'EVALUATOR', email: 'evaluator@example.test' })
      .expect(201);
    expect(invitation.body.token).toBeTruthy();
    expect(invitation.body.status).toBe('PENDING');

    const weak = await request(app.getHttpServer())
      .post('/api/v1/admin/invitations/accept')
      .send({ token: invitation.body.token, password: 'short' })
      .expect(400);
    expect(weak.body.error.code).toBe('PASSWORD_WEAK');

    const accepted = await request(app.getHttpServer())
      .post('/api/v1/admin/invitations/accept')
      .send({ token: invitation.body.token, password: EVALUATOR_PASSWORD })
      .expect(200);
    expect(accepted.body.roles).toContain('EVALUATOR');
    expect(accepted.body.roles).toContain('CLIENT');

    const evaluatorLogin = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ phone: EVALUATOR_PHONE, password: EVALUATOR_PASSWORD })
      .expect(200);
    expect(evaluatorLogin.body.user.roles).toContain('EVALUATOR');

    const forbidden = await request(app.getHttpServer())
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${evaluatorLogin.body.accessToken}`)
      .send({ phone: '+22900000056', role: 'ADMIN' })
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    const reused = await request(app.getHttpServer())
      .post('/api/v1/admin/invitations/accept')
      .send({ token: invitation.body.token, password: EVALUATOR_PASSWORD })
      .expect(409);
    expect(reused.body.error.code).toBe('ADMIN_INVITATION_ALREADY_USED');
  });
});
