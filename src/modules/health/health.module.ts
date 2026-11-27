import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ComplianceModule],
  controllers: [HealthController],
})
export class HealthModule {}
