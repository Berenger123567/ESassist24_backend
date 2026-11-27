import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminTrustController } from './admin-trust.controller';
import { TrustController } from './trust.controller';
import { TrustService } from './trust.service';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [TrustController, AdminTrustController],
  providers: [TrustService],
  exports: [TrustService],
})
export class TrustModule {}
