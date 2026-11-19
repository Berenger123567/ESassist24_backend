import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { DataRequestsService } from './data-requests.service';
import {
  AdminDataRequestResponseDto,
  DataRequestResponseDto,
  UpdateDataRequestStatusDto,
} from './dto/data-request.dto';

@ApiTags('Administration RGPD')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin/data-requests')
@UseGuards(AuthGuard, RolesGuard)
@Roles(RoleCode.ADMIN)
export class AdminDataRequestsController {
  constructor(private readonly dataRequestsService: DataRequestsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister toutes les demandes de données avec le téléphone du demandeur',
  })
  @ApiOkResponse({ type: [AdminDataRequestResponseDto] })
  list() {
    return this.dataRequestsService.listForAdmin();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Faire évoluer le statut d’une demande de données' })
  @ApiOkResponse({ type: DataRequestResponseDto })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateDataRequestStatusDto) {
    return this.dataRequestsService.updateStatus(id, dto);
  }
}
