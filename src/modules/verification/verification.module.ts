import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminDocumentsController } from './admin-documents.controller';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [DocumentsModule, NotificationsModule],
  controllers: [VerificationController, AdminDocumentsController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
