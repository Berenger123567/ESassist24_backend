import { Module } from '@nestjs/common';
import { ProfessionalDirectoryController } from './professional-directory.controller';
import { ProfessionalDirectoryService } from './professional-directory.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';

@Module({
  controllers: [ServiceRequestsController, ProfessionalDirectoryController],
  providers: [ServiceRequestsService, ProfessionalDirectoryService],
  exports: [ServiceRequestsService, ProfessionalDirectoryService],
})
export class ServiceRequestsModule {}
