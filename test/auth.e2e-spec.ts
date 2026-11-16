import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetData } from './utils/test-app';

describe('Authentification (e2e)', () => {
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
  });

  async function login(phone: string) {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    return request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
  }

  it('demande un code, ouvre une session et expose /me', async () => {
    const response = await login('+22900000005');
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.expiresIn).toBe(900);
    expect(response.body.user.roles).toContain('CLIENT');

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${response.body.accessToken}`)
      .expect(200);
    expect(me.body.phone).toBe('+22900000005');
    expect(me.body.roles).toContain('CLIENT');
  });

  it('renouvelle la session et révoque la famille en cas de réutilisation', async () => {
    const loginResponse = await login('+22900000006');

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(loginResponse.body.refreshToken);

    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: loginResponse.body.refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe('AUTH_SESSION_REVOKED');

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(401);
    expect(me.body.error.code).toBe('UNAUTHORIZED');
  });

  it('limite les tentatives de code incorrect', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+22900000007' })
      .expect(202);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+22900000007', code: '000000' })
        .expect(400);
      expect(response.body.error.code).toBe('OTP_INVALID');
    }
  });

  it('applique le délai entre deux demandes de code', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+22900000008' })
      .expect(202);

    const limited = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+22900000008' })
      .expect(429);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('OTP_RATE_LIMITED');
    expect(limited.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('invalide le jeton après déconnexion', async () => {
    const loginResponse = await login('+22900000009');
    const token = loginResponse.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
    expect(me.body.error.code).toBe('UNAUTHORIZED');
  });

  it('gère la session web via cookies HttpOnly et CSRF', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/api/v1/auth/otp/request')
      .set('X-Client-Platform', 'web')
      .send({ phone: '+22900000001' })
      .expect(202);

    const verified = await agent
      .post('/api/v1/auth/otp/verify')
      .set('X-Client-Platform', 'web')
      .send({ phone: '+22900000001', code: '123456' })
      .expect(200);

    expect(verified.body.accessToken).toBeTruthy();
    expect(verified.body.refreshToken).toBeUndefined();
    expect(verified.body.csrfToken).toBeTruthy();
    const setCookies = verified.get('set-cookie');
    const cookies = Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [];
    expect(cookies.some((c) => c.startsWith('ea_refresh='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('ea_csrf='))).toBe(true);

    const refreshed = await agent
      .post('/api/v1/auth/refresh')
      .set('X-Client-Platform', 'web')
      .set('X-CSRF-Token', verified.body.csrfToken)
      .send({})
      .expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.csrfToken).toBeTruthy();

    await agent.post('/api/v1/auth/refresh').set('X-Client-Platform', 'web').send({}).expect(403);
  });
});
