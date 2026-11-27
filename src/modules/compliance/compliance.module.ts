import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminComplianceController } from './admin-compliance.controller';
import { ComplianceService } from './compliance.service';
import { LegalController } from './legal.controller';

@Module({
  imports: [AuditModule],
  controllers: [LegalController, AdminComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
