import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createAdminUser, loginAdmin } from './utils/admin';
import { createTestApp, ensureRoles, resetData } from './utils/test-app';

const CLIENT_PHONE = '+22900000017';
const ADMIN_PHONE = '+22900000004';
const ADMIN_PASSWORD = 'AdminTest123!';

describe('Demandes de données (e2e)', () => {
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

  async function loginClient(phone = CLIENT_PHONE): Promise<string> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    return response.body.accessToken;
  }

  it('crée, liste et traite une demande RGPD', async () => {
    const clientToken = await loginClient();

    const created = await request(app.getHttpServer())
      .post('/api/v1/me/data-requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ type: 'EXPORT', details: 'Export complet' })
      .expect(202);
    expect(created.body.status).toBe('PENDING');
    expect(created.body.type).toBe('EXPORT');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/me/data-requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .expect(200);
    expect(listed.body).toHaveLength(1);

    const adminToken = await loginAdmin(app, ADMIN_PHONE, ADMIN_PASSWORD);
    const adminList = await request(app.getHttpServer())
      .get('/api/v1/admin/data-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(adminList.body[0].userPhone).toBe(CLIENT_PHONE);

    const inProgress = await request(app.getHttpServer())
      .patch(`/api/v1/admin/data-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);
    expect(inProgress.body.status).toBe('IN_PROGRESS');

    const completed = await request(app.getHttpServer())
      .patch(`/api/v1/admin/data-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'COMPLETED', resolutionNote: 'Export transmis' })
      .expect(200);
    expect(completed.body.resolvedAt).toBeTruthy();

    const invalid = await request(app.getHttpServer())
      .patch(`/api/v1/admin/data-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'REJECTED' })
      .expect(409);
    expect(invalid.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('empêche un client de lire la demande d’un autre utilisateur', async () => {
    const clientToken = await loginClient('+22900000019');
    const created = await request(app.getHttpServer())
      .post('/api/v1/me/data-requests')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ type: 'DELETION' })
      .expect(202);

    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+22900000018' })
      .expect(202);
    const other = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+22900000018', code: '123456' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/me/data-requests/${created.body.id}`)
      .set('Authorization', `Bearer ${other.body.accessToken}`)
      .expect(404);
    expect(response.body.error.code).toBe('DATA_REQUEST_NOT_FOUND');
  });
});
