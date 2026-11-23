import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogPageDto } from './dto/audit-log-response.dto';

@ApiTags('Audit')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin/audit-logs')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Consulter le journal d’audit append-only (administrateur)' })
  @ApiOkResponse({ type: AuditLogPageDto })
  list(@Query() query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    return this.auditService.list(query);
  }
}
