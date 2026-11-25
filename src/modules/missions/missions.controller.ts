import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  ArrivalCodeResponseDto,
  CreateProposalDto,
  MissionPageDto,
  MissionResponseDto,
  ProposalPageDto,
  ProposalResponseDto,
  ReassignMissionDto,
  VerifyArrivalCodeDto,
} from './dto/mission.dto';
import { MissionsService } from './missions.service';

@ApiTags('Missions')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class MissionsController {
  constructor(private readonly missionsService: MissionsService) {}

  @Post('service-requests/:id/proposals')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Proposer ses services sur une demande' })
  @ApiOkResponse({ type: ProposalResponseDto })
  createProposal(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateProposalDto,
  ) {
    return this.missionsService.createProposal(user, id, dto);
  }

  @Get('service-requests/:id/proposals')
  @ApiOperation({ summary: 'Lister les propositions reçues' })
  @ApiOkResponse({ type: ProposalPageDto })
  listProposals(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missionsService.listProposals(user, id);
  }

  @Post('proposals/:id/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter une proposition et créer la mission' })
  @ApiOkResponse({ type: MissionResponseDto })
  acceptProposal(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missionsService.acceptProposal(user, id);
  }

  @Get('missions')
  @ApiOperation({ summary: 'Lister mes missions' })
  @ApiOkResponse({ type: MissionPageDto })
  listMissions(@CurrentUser() user: AuthUser) {
    return this.missionsService.listMissions(user);
  }

  @Get('missions/:id')
  @ApiOperation({ summary: 'Détail d’une mission' })
  @ApiOkResponse({ type: MissionResponseDto })
  getMission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missionsService.getMission(user, id);
  }

  @Post('missions/:id/arrival-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Générer un code d’arrivée à usage unique' })
  @ApiOkResponse({ type: ArrivalCodeResponseDto })
  generateArrivalCode(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.missionsService.generateArrivalCode(user, id);
  }

  @Post('missions/:id/arrival-code/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifier le code d’arrivée côté client' })
  @ApiOkResponse({ type: MissionResponseDto })
  verifyArrivalCode(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerifyArrivalCodeDto,
  ) {
    return this.missionsService.verifyArrivalCode(user, id, dto.code);
  }

  @Post('missions/:id/reassign')
  @Roles(RoleCode.ADMIN)
  @UseGuards(AuthGuard, RolesGuard)
  @HttpCode(200)
  @ApiOperation({ summary: 'Changer d’intervenant avec traçabilité' })
  @ApiOkResponse({ type: MissionResponseDto })
  reassign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReassignMissionDto,
  ) {
    return this.missionsService.reassign(user, id, dto);
  }
}
