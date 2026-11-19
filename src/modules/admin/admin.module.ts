import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminInvitationService } from './admin-invitation.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminController],
  providers: [AdminAuthService, AdminInvitationService],
  exports: [AdminAuthService, AdminInvitationService],
})
export class AdminModule {}
