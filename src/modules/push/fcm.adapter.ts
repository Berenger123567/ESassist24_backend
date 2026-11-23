import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createSign } from 'crypto';

export interface PushPayload {
  title: string;
  body: string;
  type: string;
  entityId?: string | null;
  route?: string | null;
}

function base64Url(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

@Injectable()
export class FcmAdapter {
  constructor(private readonly config: ConfigService) {}

  async send(token: string, payload: PushPayload): Promise<void> {
    const projectId = this.config.get<string>('FCM_PROJECT_ID', '');
    const clientEmail = this.config.get<string>('FCM_CLIENT_EMAIL', '');
    const privateKey = this.config.get<string>('FCM_PRIVATE_KEY', '').replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Configuration FCM incomplète.');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64Url(
      JSON.stringify({
        iss: clientEmail,
        scope: this.config.get<string>(
          'FCM_SCOPE',
          'https://www.googleapis.com/auth/firebase.messaging',
        ),
        aud: this.config.get<string>('FCM_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = createSign('RSA-SHA256')
      .update(`${header}.${claim}`)
      .sign(privateKey, 'base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const assertion = `${header}.${claim}.${signature}`;

    const tokenResponse = await fetch(
      this.config.get<string>('FCM_TOKEN_URL', 'https://oauth2.googleapis.com/token'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      },
    );
    if (!tokenResponse.ok) {
      throw new Error(`FCM OAuth échoué (${tokenResponse.status}).`);
    }
    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token) {
      throw new Error('Jeton d’accès FCM manquant.');
    }

    const messageResponse = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: {
              type: payload.type,
              entityId: payload.entityId ?? '',
              route: payload.route ?? '',
            },
          },
        }),
      },
    );
    if (!messageResponse.ok) {
      throw new Error(`Envoi FCM échoué (${messageResponse.status}).`);
    }
  }
}
