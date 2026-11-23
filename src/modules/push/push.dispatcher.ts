import { Injectable } from '@nestjs/common';
import { Device } from '@prisma/client';
import { ExpoAdapter } from './expo.adapter';
import { FcmAdapter, PushPayload } from './fcm.adapter';
import { WebPushAdapter } from './webpush.adapter';

@Injectable()
export class PushDispatcher {
  constructor(
    private readonly fcm: FcmAdapter,
    private readonly webPush: WebPushAdapter,
    private readonly expo: ExpoAdapter,
  ) {}

  async send(channel: string, device: Device, payload: PushPayload): Promise<void> {
    if (channel === 'FCM') {
      if (!device.pushToken) {
        throw new Error('Jeton FCM manquant.');
      }
      await this.fcm.send(device.pushToken, payload);
      return;
    }
    if (channel === 'WEB_PUSH') {
      if (!device.pushSubscription) {
        throw new Error('Abonnement Web Push manquant.');
      }
      await this.webPush.send(device.pushSubscription as Record<string, unknown>, payload);
      return;
    }
    if (channel === 'EXPO') {
      await this.expo.send(device.pushToken ?? '', payload);
      return;
    }
    throw new Error(`Canal push inconnu: ${channel}`);
  }
}
