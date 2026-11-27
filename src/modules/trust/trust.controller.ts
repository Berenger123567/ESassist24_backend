import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AllowSuspended } from '../../common/decorators/allow-suspended.decorator';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuthUser } from '../../common/types/auth-user';
import {
  AppealResponseDto,
  ClaimPageDto,
  ClaimQueryDto,
  ClaimResponseDto,
  CreateAppealDto,
  CreateClaimDto,
  CreateReviewContestDto,
  CreateReviewDto,
  CreateReviewReplyDto,
  GuaranteeResponseDto,
  ReputationResponseDto,
  ReviewContestResponseDto,
  ReviewPageDto,
  ReviewReplyResponseDto,
  ReviewResponseDto,
} from './dto/trust.dto';
import { TrustService } from './trust.service';

@ApiTags('Confiance')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
export class TrustController {
  constructor(private readonly trustService: TrustService) {}

  @Post('missions/:id/reviews')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Déposer un avis sur une mission clôturée' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  createReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.trustService.createReview(user, id, dto);
  }

  @Get('professionals/:id/reviews')
  @ApiOperation({ summary: 'Lister les avis publiés d’un professionnel' })
  @ApiOkResponse({ type: ReviewPageDto })
  listReviews(@Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.trustService.listReviews(id, query);
  }

  @Post('reviews/:id/response')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Répondre à un avis reçu' })
  @ApiOkResponse({ type: ReviewReplyResponseDto })
  respondToReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateReviewReplyDto,
  ) {
    return this.trustService.respondToReview(user, id, dto);
  }

  @Post('reviews/:id/contest')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Contester un avis' })
  @ApiOkResponse({ type: ReviewContestResponseDto })
  contestReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateReviewContestDto,
  ) {
    return this.trustService.contestReview(user, id, dto);
  }

  @Get('professionals/:id/reputation')
  @ApiOperation({ summary: 'Consulter la réputation d’un professionnel' })
  @ApiOkResponse({ type: ReputationResponseDto })
  getReputation(@Param('id') id: string) {
    return this.trustService.getReputation(id);
  }

  @Post('claims')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Ouvrir une réclamation' })
  @ApiCreatedResponse({ type: ClaimResponseDto })
  createClaim(@CurrentUser() user: AuthUser, @Body() dto: CreateClaimDto) {
    return this.trustService.createClaim(user, dto);
  }

  @Get('claims')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Lister mes réclamations' })
  @ApiOkResponse({ type: ClaimPageDto })
  listMyClaims(@CurrentUser() user: AuthUser, @Query() query: ClaimQueryDto) {
    return this.trustService.listMyClaims(user, query);
  }

  @Get('claims/mine')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Alias explicite de la liste de mes réclamations' })
  @ApiOkResponse({ type: ClaimPageDto })
  listMyClaimsAlias(@CurrentUser() user: AuthUser, @Query() query: ClaimQueryDto) {
    return this.trustService.listMyClaims(user, query);
  }

  @Get('claims/:id')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Consulter une réclamation' })
  @ApiOkResponse({ type: ClaimResponseDto })
  getClaim(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trustService.getClaim(user, id);
  }

  @Get('missions/:id/guarantee')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Consulter la garantie d’une mission' })
  @ApiOkResponse({ type: GuaranteeResponseDto })
  getGuarantee(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.trustService.getGuarantee(id, user);
  }

  @Post('suspensions/:id/appeal')
  @AllowSuspended()
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Faire appel d’une suspension' })
  @ApiCreatedResponse({ type: AppealResponseDto })
  appealSuspension(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateAppealDto,
  ) {
    return this.trustService.appealSuspension(user, id, dto);
  }
}
