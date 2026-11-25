import { Module } from '@nestjs/common';
import { MissionsModule } from '../missions/missions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ClosureController } from './closure.controller';
import { ClosureService } from './closure.service';
import { PositionPurgeService } from './position-purge.service';

@Module({
  imports: [MissionsModule, NotificationsModule],
  controllers: [ClosureController],
  providers: [ClosureService, PositionPurgeService],
  exports: [ClosureService, PositionPurgeService],
})
export class ClosureModule {}
