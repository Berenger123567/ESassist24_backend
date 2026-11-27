import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RouteRateLimit } from '../../common/decorators/route-rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import { ComplianceService } from './compliance.service';
import {
  BackupPageDto,
  BackupQueryDto,
  BackupResponseDto,
  RecordBackupDto,
  SecurityPostureDto,
  VerifyBackupDto,
} from './dto/compliance.dto';

@ApiTags('Administration conformité')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles(RoleCode.ADMIN)
export class AdminComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('backups')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Lister les enregistrements de sauvegarde' })
  @ApiOkResponse({ type: BackupPageDto })
  listBackups(
    @CurrentUser() admin: AuthUser,
    @Query() query: BackupQueryDto,
  ): Promise<BackupPageDto> {
    return this.complianceService.listBackups(admin, query);
  }

  @Post('backups')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Enregistrer une sauvegarde et son empreinte SHA-256' })
  @ApiOkResponse({ type: BackupResponseDto })
  recordBackup(
    @CurrentUser() admin: AuthUser,
    @Body() dto: RecordBackupDto,
  ): Promise<BackupResponseDto> {
    return this.complianceService.recordBackup(admin, dto);
  }

  @Post('backups/:id/verify')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Vérifier une sauvegarde restaurée' })
  @ApiOkResponse({ type: BackupResponseDto })
  verifyBackup(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerifyBackupDto,
  ): Promise<BackupResponseDto> {
    return this.complianceService.verifyBackup(admin, id, dto);
  }

  @Get('security-posture')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Exposer la posture de sécurité sans secrets' })
  @ApiOkResponse({ type: SecurityPostureDto })
  getSecurityPosture(): Promise<SecurityPostureDto> {
    return this.complianceService.getSecurityPosture();
  }
}
