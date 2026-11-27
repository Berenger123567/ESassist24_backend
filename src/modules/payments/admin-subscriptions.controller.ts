import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { SubscriptionPageDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Administration abonnements')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles(RoleCode.ADMIN)
export class AdminSubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscriptions')
  @ApiOperation({ summary: 'Lister tous les abonnements' })
  @ApiOkResponse({ type: SubscriptionPageDto })
  list(@Query() query: PaginationQueryDto) {
    return this.subscriptionsService.listAll(query);
  }
}
