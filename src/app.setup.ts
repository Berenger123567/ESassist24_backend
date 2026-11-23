import { INestApplication, RequestMethod } from '@nestjs/common';
import { raw } from 'express';
import { requestContextMiddleware } from './common/middleware/request-context.middleware';
import { parseCidrList } from './common/net/cidr.util';

export function configureApp(app: INestApplication): void {
  const maxUploadBytes = Number(process.env.DOCUMENT_MAX_UPLOAD_BYTES || '10485760');
  const trustedProxies = parseCidrList(process.env.TRUST_PROXY_CIDR);
  const httpServer = app.getHttpAdapter().getInstance() as {
    set?: (name: string, value: unknown) => void;
  };
  httpServer.set?.('trust proxy', trustedProxies.length > 0 ? trustedProxies : false);
  app.use(requestContextMiddleware);
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
