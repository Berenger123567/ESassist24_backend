import { Module } from '@nestjs/common';
import { MissionsModule } from '../missions/missions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { TrustModule } from '../trust/trust.module';
import { ClosureController } from './closure.controller';
import { ClosureService } from './closure.service';
import { PositionPurgeService } from './position-purge.service';

@Module({
  imports: [MissionsModule, NotificationsModule, PaymentsModule, TrustModule],
  controllers: [ClosureController],
  providers: [ClosureService, PositionPurgeService],
  exports: [ClosureService, PositionPurgeService],
})
export class ClosureModule {}
