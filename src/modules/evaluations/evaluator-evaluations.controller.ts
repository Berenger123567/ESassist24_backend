import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import {
  EvaluationAssignmentPageDto,
  EvaluationAssignmentQueryDto,
  EvaluationAssignmentResponseDto,
  EvaluationSubmissionResponseDto,
  SaveEvaluationResultsDto,
} from './dto/evaluation-assignment.dto';
import { EvaluationResponseDto } from './dto/evaluation.dto';
import { EvaluationsService } from './evaluations.service';

@ApiTags('Évaluation - évaluateur')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('evaluator/assignments')
@UseGuards(AuthGuard, RolesGuard)
@Roles('EVALUATOR')
export class EvaluatorEvaluationsController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @ApiOperation({ summary: 'Assignations de l’évaluateur connecté' })
  @ApiOkResponse({ type: EvaluationAssignmentPageDto })
  list(
    @CurrentUser() evaluator: AuthUser,
    @Query() query: EvaluationAssignmentQueryDto,
  ): Promise<EvaluationAssignmentPageDto> {
    return this.evaluations.listMyAssignments(evaluator, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’une assignation de l’évaluateur connecté' })
  @ApiOkResponse({ type: EvaluationAssignmentResponseDto })
  get(
    @CurrentUser() evaluator: AuthUser,
    @Param('id') id: string,
  ): Promise<EvaluationAssignmentResponseDto> {
    return this.evaluations.getMyAssignment(evaluator, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Enregistrer les notes d’une évaluation (alias)',
    description: 'Alias déprécié, utiliser PUT /api/v1/evaluator/assignments/{id}/results.',
    deprecated: true,
  })
  @ApiOkResponse({ type: EvaluationResponseDto })
  patchResults(
    @CurrentUser() evaluator: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveEvaluationResultsDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationResponseDto> {
    return this.evaluations.saveResults(evaluator, id, dto, request);
  }

  @Put(':id/results')
  @ApiOperation({ summary: 'Enregistrer les notes d’une évaluation' })
  @ApiOkResponse({ type: EvaluationAssignmentResponseDto })
  saveResults(
    @CurrentUser() evaluator: AuthUser,
    @Param('id') id: string,
    @Body() dto: SaveEvaluationResultsDto,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationAssignmentResponseDto> {
    return this.evaluations.saveResults(evaluator, id, dto, request);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Soumettre une évaluation et déclencher la certification automatique' })
  @ApiOkResponse({ type: EvaluationSubmissionResponseDto })
  submit(
    @CurrentUser() evaluator: AuthUser,
    @Param('id') id: string,
    @Req() request: ContextualRequest,
  ): Promise<EvaluationSubmissionResponseDto> {
    return this.evaluations.submit(evaluator, id, request);
  }
}
