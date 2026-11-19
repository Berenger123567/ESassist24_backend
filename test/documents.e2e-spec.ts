import { INestApplication } from '@nestjs/common';
import { mkdirSync, rmSync } from 'node:fs';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, resetData } from './utils/test-app';

const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

const STORAGE_DIR = process.env.DOCUMENT_STORAGE_DIR || './.tmp-document-storage';

describe('Documents privés (e2e)', () => {
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
    rmSync(STORAGE_DIR, { recursive: true, force: true });
    mkdirSync(STORAGE_DIR, { recursive: true });
  });

  async function login(phone: string): Promise<string> {
    await request(app.getHttpServer()).post('/api/v1/auth/otp/request').send({ phone }).expect(202);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: '123456' })
      .expect(200);
    return response.body.accessToken;
  }

  async function createUploadUrl(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<any> {
    return request(app.getHttpServer())
      .post('/api/v1/pro/documents/upload-url')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'ID_CARD',
        fileName: 'piece.png',
        contentType: 'image/png',
        sizeBytes: PNG.length,
        ...overrides,
      })
      .expect(201);
  }

  it('téléverse, liste, historise et télécharge un document privé', async () => {
    const token = await login('+22900000021');
    const upload = await createUploadUrl(token);
    expect(upload.body.uploadUrl).toContain('/api/v1/pro/documents/upload/');
    expect(upload.body.expiresInSeconds).toBe(600);

    const uploaded = await request(app.getHttpServer())
      .put(upload.body.uploadUrl)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(200);
    expect(uploaded.body.status).toBe('SUBMITTED');

    const documents = await request(app.getHttpServer())
      .get('/api/v1/pro/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(documents.body).toHaveLength(1);
    expect(documents.body[0].detectedContentType).toBe('image/png');
    expect(documents.body[0].sha256).toHaveLength(64);
    expect(documents.body[0].storageKey).toBeUndefined();

    const history = await request(app.getHttpServer())
      .get(`/api/v1/pro/documents/${upload.body.documentId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.map((event: { type: string }) => event.type)).toContain('UPLOADED');

    const downloadUrl = await request(app.getHttpServer())
      .post(`/api/v1/pro/documents/${upload.body.documentId}/download-url`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const downloaded = await request(app.getHttpServer())
      .get(downloadUrl.body.downloadUrl)
      .expect(200);
    expect(downloaded.headers['content-type']).toContain('image/png');
    expect(Buffer.from(downloaded.body).equals(PNG)).toBe(true);

    const afterDownload = await request(app.getHttpServer())
      .get(`/api/v1/pro/documents/${upload.body.documentId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDownload.body.map((event: { type: string }) => event.type)).toContain('ACCESSED');
  });

  it('rejette une signature altérée', async () => {
    const token = await login('+22900000022');
    const upload = await createUploadUrl(token);
    const tokenPart = upload.body.uploadUrl.split('/').pop() as string;
    const [payload, signature] = tokenPart.split('.');
    const alteredSignature = `${signature.slice(0, -1)}${signature.endsWith('A') ? 'B' : 'A'}`;
    const alteredUrl = `/api/v1/pro/documents/upload/${payload}.${alteredSignature}`;

    const response = await request(app.getHttpServer())
      .put(alteredUrl)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(400);
    expect(response.body.error.code).toBe('DOCUMENT_SIGNATURE_INVALID');
  });

  it('rejette un écart de type MIME réel', async () => {
    const token = await login('+22900000023');
    const upload = await createUploadUrl(token, {
      contentType: 'application/pdf',
      fileName: 'piece.pdf',
    });

    const response = await request(app.getHttpServer())
      .put(upload.body.uploadUrl)
      .set('Content-Type', 'application/pdf')
      .send(PNG)
      .expect(415);
    expect(response.body.error.code).toBe('DOCUMENT_INVALID_MIME');
  });

  it('rejette un contenu plus grand que la taille signée', async () => {
    const token = await login('+22900000024');
    const upload = await createUploadUrl(token, { sizeBytes: 8 });

    const response = await request(app.getHttpServer())
      .put(upload.body.uploadUrl)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(413);
    expect(response.body.error.code).toBe('DOCUMENT_TOO_LARGE');
  });

  it('empêche un autre utilisateur de générer une URL de téléchargement', async () => {
    const ownerToken = await login('+22900000025');
    const otherToken = await login('+22900000026');
    const upload = await createUploadUrl(ownerToken);
    await request(app.getHttpServer())
      .put(upload.body.uploadUrl)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/pro/documents/${upload.body.documentId}/download-url`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    expect(response.body.error.code).toBe('DOCUMENT_NOT_OWNED');
  });

  it('marque automatiquement un document expiré', async () => {
    const token = await login('+22900000027');
    const upload = await createUploadUrl(token);
    await request(app.getHttpServer())
      .put(upload.body.uploadUrl)
      .set('Content-Type', 'image/png')
      .send(PNG)
      .expect(200);

    await prisma.document.update({
      where: { id: upload.body.documentId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const documents = await request(app.getHttpServer())
      .get('/api/v1/pro/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(documents.body[0].status).toBe('EXPIRED');

    const history = await request(app.getHttpServer())
      .get(`/api/v1/pro/documents/${upload.body.documentId}/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(history.body.map((event: { type: string }) => event.type)).toContain('EXPIRED');
  });
});
