import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateServiceRequestDto,
  ServiceRequestPageDto,
  ServiceRequestQueryDto,
  ServiceRequestResponseDto,
} from './dto/service-request.dto';
import { ServiceRequestsService } from './service-requests.service';

@ApiTags('Demandes de panne')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('service-requests')
@UseGuards(AuthGuard)
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Déclarer une panne avec zone approximative et photos' })
  @ApiCreatedResponse({ type: ServiceRequestResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(user.id, dto);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Lister mes demandes de panne' })
  @ApiOkResponse({ type: ServiceRequestPageDto })
  listMine(@CurrentUser() user: AuthUser, @Query() query: ServiceRequestQueryDto) {
    return this.serviceRequestsService.listMine(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une demande de panne' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  getById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceRequestsService.getById(user, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Annuler une demande de panne' })
  @ApiOkResponse({ type: ServiceRequestResponseDto })
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceRequestsService.cancel(user.id, id);
  }
}
