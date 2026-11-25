import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import { ClosureService } from './closure.service';
import {
  AuthorizeEmergencyDto,
  CreateMissionEventDto,
  CreateMissionPositionDto,
  CreateQuoteDto,
  CreateServiceReportDto,
  MissionEventResponseDto,
  MissionStatusUpdateDto,
  PositionAckDto,
  QuotePageDto,
  QuoteResponseDto,
  ServiceReportResponseDto,
} from './dto/closure.dto';

@ApiTags('Clôture')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class ClosureController {
  constructor(private readonly closureService: ClosureService) {}

  @Post('missions/:id/quotes')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Déposer une nouvelle version de devis' })
  @ApiOkResponse({ type: QuoteResponseDto })
  createQuote(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateQuoteDto) {
    return this.closureService.createQuote(user, id, dto);
  }

  @Get('missions/:id/quotes')
  @ApiOperation({ summary: 'Lister les devis d’une mission' })
  @ApiOkResponse({ type: QuotePageDto })
  listQuotes(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.closureService.listQuotes(user, id);
  }

  @Post('quotes/:id/accept')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter un devis et autoriser les travaux' })
  @ApiOkResponse({ type: MissionStatusUpdateDto })
  acceptQuote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.closureService.acceptQuote(user, id);
  }

  @Post('quotes/:id/reject')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Refuser un devis' })
  @ApiOkResponse({ type: MissionStatusUpdateDto })
  rejectQuote(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.closureService.rejectQuote(user, id);
  }

  @Post('missions/:id/authorize-emergency')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Autoriser une intervention urgente sans devis' })
  @ApiOkResponse({ type: MissionStatusUpdateDto })
  authorizeEmergency(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: AuthorizeEmergencyDto,
  ) {
    return this.closureService.authorizeEmergency(user, id, dto);
  }

  @Post('missions/:id/events')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Tracer départ/arrivée' })
  @ApiOkResponse({ type: MissionEventResponseDto })
  createEvent(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateMissionEventDto,
  ) {
    return this.closureService.createEvent(user, id, dto);
  }

  @Post('missions/:id/positions')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Enregistrer une position approximative' })
  @ApiOkResponse({ type: PositionAckDto })
  createPosition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateMissionPositionDto,
  ) {
    return this.closureService.createPosition(user, id, dto);
  }

  @Post('missions/:id/report')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Déposer le rapport et passer la mission en COMPLETED' })
  @ApiOkResponse({ type: ServiceReportResponseDto })
  createReport(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateServiceReportDto,
  ) {
    return this.closureService.createReport(user, id, dto);
  }

  @Get('missions/:id/report')
  @ApiOperation({ summary: 'Lire le rapport d’intervention' })
  @ApiOkResponse({ type: ServiceReportResponseDto })
  getReport(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.closureService.getReport(user, id);
  }

  @Post('missions/:id/close')
  @Roles(RoleCode.CLIENT)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Clôturer une mission terminée' })
  @ApiOkResponse({ type: MissionStatusUpdateDto })
  closeMission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.closureService.closeMission(user, id);
  }
}
