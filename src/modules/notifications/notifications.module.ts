import { Module } from '@nestjs/common';
import { PushModule } from '../push/push.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationQueueService } from './notification.queue';
import { NotificationWorkerService } from './notification.worker';
import { ReminderService } from './reminder.service';
import { ReminderWorkerService } from './reminder.worker';

@Module({
  imports: [PushModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationQueueService,
    NotificationWorkerService,
    ReminderService,
    ReminderWorkerService,
  ],
  exports: [NotificationsService, NotificationQueueService],
})
export class NotificationsModule {}
