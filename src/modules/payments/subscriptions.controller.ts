import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import {
  CancelSubscriptionDto,
  CreateSubscriptionDto,
  SubscriptionCheckoutResponseDto,
  SubscriptionPageDto,
  SubscriptionResponseDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Abonnements')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscriptions/mine')
  @ApiOperation({ summary: 'Lister mes abonnements' })
  @ApiOkResponse({ type: SubscriptionPageDto })
  listMine(@CurrentUser() user: AuthUser, @Query() query: PaginationQueryDto) {
    return this.subscriptionsService.listMine(user, query);
  }

  @Post('subscriptions')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Souscrire a un abonnement PRO ou PREMIUM' })
  @ApiOkResponse({ type: SubscriptionCheckoutResponseDto })
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: CreateSubscriptionDto) {
    return this.subscriptionsService.subscribe(user, dto);
  }

  @Post('subscriptions/:id/cancel')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Annuler un abonnement' })
  @ApiOkResponse({ type: SubscriptionResponseDto })
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CancelSubscriptionDto,
  ) {
    return this.subscriptionsService.cancel(user, id, dto);
  }
}
