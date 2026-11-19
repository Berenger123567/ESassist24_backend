import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetData } from './utils/test-app';

describe('Limite OTP par appareil (e2e)', () => {
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

  it('bloque la sixième demande pour le même appareil', async () => {
    const deviceId = 'device-e2e-otp-limit';

    for (let index = 0; index < 5; index += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: `+2290000003${index}`, deviceId })
        .expect(202);
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+22900000035', deviceId })
      .expect(429);

    expect(response.body.error.code).toBe('OTP_RATE_LIMITED');
  });
});
