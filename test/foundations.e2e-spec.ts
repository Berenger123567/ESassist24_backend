import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Fondations API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  it('expose /health sans préfixe', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('expose /version sans préfixe', async () => {
    const response = await request(app.getHttpServer()).get('/version').expect(200);

    expect(response.body.version).toBeTruthy();
    expect(response.body.apiPrefix).toBe('api/v1');
  });

  it('prend en charge les chemins versionnés', async () => {
    await request(app.getHttpServer()).get('/api/v1/specialties').expect(200);
    await request(app.getHttpServer()).get('/specialties').expect(404);
  });
});
