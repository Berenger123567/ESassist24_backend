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
import {
  AppealDecisionResponseDto,
  ClaimPageDto,
  ClaimQueryDto,
  ClaimResponseDto,
  DecideAppealDto,
  EscalateClaimDto,
  GuaranteePageDto,
  GuaranteeQueryDto,
  ResolveClaimDto,
  SuspensionPageDto,
  SuspensionQueryDto,
  SuspensionResponseDto,
  SuspendProfessionalDto,
  TrustIndicatorsDto,
} from './dto/trust.dto';
import { TrustService } from './trust.service';

@ApiTags('Administration confiance')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles(RoleCode.ADMIN)
export class AdminTrustController {
  constructor(private readonly trustService: TrustService) {}

  @Get('reputation/indicators')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Indicateurs agrégés de confiance' })
  @ApiOkResponse({ type: TrustIndicatorsDto })
  getIndicators() {
    return this.trustService.getIndicators();
  }

  @Get('claims')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Lister toutes les réclamations' })
  @ApiOkResponse({ type: ClaimPageDto })
  listAdminClaims(@Query() query: ClaimQueryDto) {
    return this.trustService.listAdminClaims(query);
  }

  @Post('claims/:id/acknowledge')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Accuser réception d’une réclamation' })
  @ApiOkResponse({ type: ClaimResponseDto })
  acknowledgeClaim(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.trustService.acknowledgeClaim(admin, id);
  }

  @Post('claims/:id/resolve')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Résoudre une réclamation' })
  @ApiOkResponse({ type: ClaimResponseDto })
  resolveClaim(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveClaimDto,
  ) {
    return this.trustService.resolveClaim(admin, id, dto);
  }

  @Post('claims/:id/escalate')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Escalader une réclamation' })
  @ApiOkResponse({ type: ClaimResponseDto })
  escalateClaim(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: EscalateClaimDto,
  ) {
    return this.trustService.escalateClaim(admin, id, dto);
  }

  @Get('guarantees')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Lister les garanties' })
  @ApiOkResponse({ type: GuaranteePageDto })
  listAdminGuarantees(@Query() query: GuaranteeQueryDto) {
    return this.trustService.listAdminGuarantees(query);
  }

  @Post('professionals/:id/suspend')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Suspendre un professionnel' })
  @ApiOkResponse({ type: SuspensionResponseDto })
  suspendProfessional(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: SuspendProfessionalDto,
  ) {
    return this.trustService.suspendProfessional(admin, id, dto);
  }

  @Get('suspensions')
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Lister les suspensions' })
  @ApiOkResponse({ type: SuspensionPageDto })
  listAdminSuspensions(@Query() query: SuspensionQueryDto) {
    return this.trustService.listAdminSuspensions(query);
  }

  @Post('suspensions/:id/lift')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Lever une suspension' })
  @ApiOkResponse({ type: SuspensionResponseDto })
  liftSuspension(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.trustService.liftSuspension(admin, id);
  }

  @Post('suspensions/:id/appeal/decide')
  @HttpCode(200)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Décider d’un appel de suspension' })
  @ApiOkResponse({ type: AppealDecisionResponseDto })
  decideAppeal(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideAppealDto,
  ) {
    return this.trustService.decideAppeal(admin, id, dto);
  }
}
