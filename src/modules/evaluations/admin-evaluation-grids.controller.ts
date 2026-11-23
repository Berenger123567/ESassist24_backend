import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateEvaluationGridDto,
  EvaluationGridPageDto,
  EvaluationGridResponseDto,
  ReplaceEvaluationCriteriaDto,
  UpdateEvaluationGridDto,
} from './dto/evaluation-grid.dto';
import { EvaluationsService } from './evaluations.service';

@ApiTags('Évaluation - grilles')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin/evaluation-grids')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles('ADMIN')
export class AdminEvaluationGridsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @ApiOperation({ summary: 'Lister les grilles d’évaluation et leurs critères' })
  @ApiOkResponse({ type: EvaluationGridPageDto })
  list(): Promise<EvaluationGridPageDto> {
    return this.evaluations.listGrids();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une grille d’évaluation' })
  @ApiOkResponse({ type: EvaluationGridResponseDto })
  get(@Param('id') id: string): Promise<EvaluationGridResponseDto> {
    return this.evaluations.getGrid(id);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une grille d’évaluation' })
  @ApiCreatedResponse({ type: EvaluationGridResponseDto })
  create(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateEvaluationGridDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    return this.evaluations.createGrid(admin, dto, request);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Mettre à jour une grille d’évaluation' })
  @ApiOkResponse({ type: EvaluationGridResponseDto })
  update(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEvaluationGridDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    return this.evaluations.updateGrid(admin, id, dto, request);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Désactiver une grille d’évaluation (alias)',
    description: 'Alias déprécié de la mise à jour PATCH avec active=false.',
    deprecated: true,
  })
  @ApiOkResponse({ type: EvaluationGridResponseDto })
  deactivate(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    return this.evaluations.deactivateGrid(admin, id, request);
  }

  @Put(':id/criteria')
  @ApiOperation({ summary: 'Remplacer les critères d’une grille (poids total 100)' })
  @ApiOkResponse({ type: EvaluationGridResponseDto })
  replaceCriteria(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReplaceEvaluationCriteriaDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationGridResponseDto> {
    return this.evaluations.replaceCriteria(admin, id, dto, request);
  }
}
