import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
  CreateEvaluationAssignmentDto,
  EvaluationAssignmentPageDto,
  EvaluationAssignmentQueryDto,
  EvaluationAssignmentResponseDto,
} from './dto/evaluation-assignment.dto';
import { EvaluatorPageDto, EvaluatorQueryDto } from './dto/evaluator.dto';
import { EvaluationsService } from './evaluations.service';

@ApiTags('Évaluation - administration')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles('ADMIN')
export class AdminEvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get('evaluators')
  @ApiOperation({ summary: 'Lister les évaluateurs et leur charge' })
  @ApiOkResponse({ type: EvaluatorPageDto })
  listEvaluators(@Query() query: EvaluatorQueryDto): Promise<EvaluatorPageDto> {
    return this.evaluations.listEvaluators(query);
  }

  @Get('evaluations/assignments')
  @ApiOperation({ summary: 'Lister les assignations d’évaluation' })
  @ApiOkResponse({ type: EvaluationAssignmentPageDto })
  listAssignments(
    @Query() query: EvaluationAssignmentQueryDto,
  ): Promise<EvaluationAssignmentPageDto> {
    return this.evaluations.listAssignments(query);
  }

  @Get('evaluations/assignments/:id')
  @ApiOperation({ summary: 'Détail d’une assignation d’évaluation' })
  @ApiOkResponse({ type: EvaluationAssignmentResponseDto })
  getAssignment(@Param('id') id: string): Promise<EvaluationAssignmentResponseDto> {
    return this.evaluations.getAssignment(id);
  }

  @Post('evaluations/assignments')
  @ApiOperation({ summary: 'Assigner une évaluation à un évaluateur' })
  @ApiCreatedResponse({ type: EvaluationAssignmentResponseDto })
  assign(
    @CurrentUser() admin: AuthUser,
    @Body() dto: CreateEvaluationAssignmentDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationAssignmentResponseDto> {
    return this.evaluations.assign(admin, dto, request);
  }
}
