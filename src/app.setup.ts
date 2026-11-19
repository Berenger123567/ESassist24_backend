import { INestApplication, RequestMethod } from '@nestjs/common';
import { raw } from 'express';

export function configureApp(app: INestApplication): void {
  const maxUploadBytes = Number(process.env.DOCUMENT_MAX_UPLOAD_BYTES || '10485760');
  app.use(
    '/api/v1/pro/documents/upload',
    raw({ type: () => true, limit: Math.ceil(maxUploadBytes * 1.25) }),
  );
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'version', method: RequestMethod.GET },
    ],
  });
}
