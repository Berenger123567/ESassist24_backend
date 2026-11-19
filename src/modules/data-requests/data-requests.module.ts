import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminDataRequestsController } from './admin-data-requests.controller';
import { DataRequestsService } from './data-requests.service';
import { UserDataRequestsController } from './user-data-requests.controller';

@Module({
  imports: [PrismaModule],
  controllers: [UserDataRequestsController, AdminDataRequestsController],
  providers: [DataRequestsService],
  exports: [DataRequestsService],
})
export class DataRequestsModule {}
