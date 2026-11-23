import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushPayload } from './fcm.adapter';

@Injectable()
export class WebPushAdapter {
  constructor(private readonly config: ConfigService) {}

  async send(subscription: Record<string, unknown>, payload: PushPayload): Promise<void> {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY', '');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY', '');
    if (!publicKey || !privateKey) {
      throw new Error('Configuration Web Push incomplète.');
    }
    const module = await import('web-push');
    const webpush = module.default ?? module;
    webpush.setVapidDetails(
      this.config.get<string>('VAPID_SUBJECT', 'mailto:admin@electro-assist.local'),
      publicKey,
      privateKey,
    );
    await webpush.sendNotification(
      subscription as unknown as import('web-push').PushSubscription,
      JSON.stringify(payload),
    );
  }
}
