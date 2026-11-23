import { Module } from '@nestjs/common';
import { ExpoAdapter } from './expo.adapter';
import { FcmAdapter } from './fcm.adapter';
import { PushDispatcher } from './push.dispatcher';
import { WebPushAdapter } from './webpush.adapter';

@Module({
  providers: [FcmAdapter, WebPushAdapter, ExpoAdapter, PushDispatcher],
  exports: [PushDispatcher],
})
export class PushModule {}
