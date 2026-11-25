import { INestApplication } from '@nestjs/common';
import { DevicePlatform, NotificationType, RoleCode } from '@prisma/client';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createTestApp, ensureRoles, resetData } from './utils/test-app';

describe('Alias de contrat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const adminPhone = '+22900000092';
  const adminPassword = 'AdminContract123!';
  const evaluatorPhone = '+22900000093';
  const evaluatorPassword = 'EvaluatorContract123!';
  let clientCounter = 0;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetData(prisma);
    await ensureRoles(prisma);
    await createAdminUser(prisma, adminPhone, adminPassword);
    await createAdminUser(prisma, evaluatorPhone, evaluatorPassword, RoleCode.EVALUATOR);
  });

  async function clientToken(): Promise<{ token: string; userId: string }> {
    const phone = `+229000000${String(94 + ++clientCounter)}`;
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    return {
      token: response.body.accessToken as string,
      userId: response.body.user.id as string,
    };
  }

  it('expose la version du contrat', async () => {
    const response = await request(app.getHttpServer()).get('/version').expect(200);

    expect(response.body.contractVersion).toBe('1.1.0');
  });

  it('expose les alias devices et notifications', async () => {
    const { token, userId } = await clientToken();
    await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId: 'contract-alias-device',
        platform: DevicePlatform.ANDROID,
        pushToken: 'push-token',
      })
      .expect(201);
    const notification = await prisma.notification.create({
      data: {
        userId,
        type: NotificationType.CERTIFICATION_OBTAINED,
        title: 'Certification',
        body: 'Votre badge est disponible.',
      },
    });

    const devices = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const marked = await request(app.getHttpServer())
      .post(`/api/v1/notifications/${notification.id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(devices.body).toHaveLength(1);
    expect(marked.body.status).toBe('READ');
  });

  it('expose les alias de certification, grille, évaluateur et assignation', async () => {
    const { token, userId } = await clientToken();
    const adminToken = await loginAdmin(app, adminPhone, adminPassword);
    const evaluatorToken = await loginAdmin(app, evaluatorPhone, evaluatorPassword);
    await prisma.professionalProfile.create({ data: { userId } });
    const grid = await request(app.getHttpServer())
      .post('/api/v1/admin/evaluation-grids')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `ALIAS-${Date.now()}`, label: 'Grille alias' })
      .expect(201);

    const certification = await request(app.getHttpServer())
      .post('/api/v1/pro/certification')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const deactivated = await request(app.getHttpServer())
      .delete(`/api/v1/admin/evaluation-grids/${grid.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const evaluator = await request(app.getHttpServer())
      .post('/api/v1/admin/evaluators')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '+22900000095' })
      .expect(201);
    await request(app.getHttpServer())
      .patch('/api/v1/evaluator/assignments/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${evaluatorToken}`)
      .send({})
      .expect(400);

    expect(certification.body.status).toBe('PENDING');
    expect(deactivated.body.active).toBe(false);
    expect(evaluator.body.role).toBe('EVALUATOR');
  });
});
