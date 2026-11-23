import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import { VerificationDecisionDto } from './dto/verification-decision.dto';
import { VerificationDecisionResponseDto } from './dto/verification-decision-response.dto';
import { VerificationDetailDto, VerificationPageDto } from './dto/verification-response.dto';
import { VerificationQueryDto } from './dto/verification-query.dto';
import { VerificationService } from './verification.service';

@ApiTags('Vérification professionnelle')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin/verifications')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles('ADMIN')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @Get()
  @ApiOperation({ summary: 'File de vérification professionnelle' })
  @ApiOkResponse({ type: VerificationPageDto })
  list(@Query() query: VerificationQueryDto): Promise<VerificationPageDto> {
    return this.verificationService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d’un dossier de vérification' })
  @ApiOkResponse({ type: VerificationDetailDto })
  getById(@Param('id') id: string): Promise<VerificationDetailDto> {
    return this.verificationService.getById(id);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rendre une décision de vérification (idempotente via Idempotency-Key)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ type: VerificationDecisionResponseDto })
  decide(
    @CurrentUser() admin: AuthUser,
    @Param('id') id: string,
    @Body() dto: VerificationDecisionDto,
    @Headers('idempotency-key') key: string,
    @Req() request: ContextualRequest,
  ): Promise<VerificationDecisionResponseDto> {
    if (!key || key.trim().length < 8 || key.length > 200) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Un en-tête Idempotency-Key valide est requis.',
      );
    }
    return this.verificationService.decide(admin, id, dto, key, request);
  }
}
