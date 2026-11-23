import { Injectable } from '@nestjs/common';
import { PushPayload } from './fcm.adapter';

@Injectable()
export class ExpoAdapter {
  async send(_token: string, _payload: PushPayload): Promise<void> {
    return;
  }
}
