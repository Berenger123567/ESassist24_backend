import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  PaymentConfirmationResponseDto,
  PaymentIntentResponseDto,
  ReconciliationQueryDto,
  ReconciliationReportResponseDto,
} from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Paiements')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('payments/missions/:id/intent')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Creer une intention de paiement pour une mission' })
  @ApiOkResponse({ type: PaymentIntentResponseDto })
  createMissionIntent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.createMissionIntent(user, id);
  }

  @Get('payments/reconciliation')
  @Roles(RoleCode.ADMIN)
  @UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
  @ApiOperation({ summary: 'Lister ou generer les rapports de reconciliation' })
  @ApiOkResponse({ type: [ReconciliationReportResponseDto] })
  reconciliation(@Query() query: ReconciliationQueryDto) {
    if (query.date) {
      return this.paymentsService.reconciliation(query.date).then((report) => [report]);
    }
    return this.paymentsService.listReconciliationReports();
  }

  @Get('payments/:id')
  @ApiOperation({ summary: 'Lire une intention de paiement' })
  @ApiOkResponse({ type: PaymentIntentResponseDto })
  getIntent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.getIntent(user, id);
  }

  @Post('payments/:id/confirm')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirmer manuellement un paiement en sandbox' })
  @ApiOkResponse({ type: PaymentConfirmationResponseDto })
  confirmIntent(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.paymentsService.confirmIntent(user, id);
  }
}
