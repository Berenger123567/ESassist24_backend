import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminSubscriptionsController } from './admin-subscriptions.controller';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { PaymentProviderAdapter } from './payment-provider.adapter';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [
    PaymentsController,
    WebhookController,
    SubscriptionsController,
    AdminSubscriptionsController,
    LedgerController,
  ],
  providers: [PaymentProviderAdapter, LedgerService, PaymentsService, SubscriptionsService],
  exports: [PaymentsService, LedgerService, SubscriptionsService, PaymentProviderAdapter],
})
export class PaymentsModule {}
