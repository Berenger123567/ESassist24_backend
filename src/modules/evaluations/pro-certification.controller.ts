import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import { CertificationResponseDto } from './dto/certification.dto';
import { EvaluationsService } from './evaluations.service';

@ApiTags('Certification')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('pro/certification')
@UseGuards(AuthGuard)
export class ProCertificationController {
  constructor(private readonly evaluations: EvaluationsService) {}

  @Get()
  @ApiOperation({ summary: 'Badge de certification du professionnel connecté' })
  @ApiOkResponse({ type: CertificationResponseDto })
  get(@CurrentUser() user: AuthUser): Promise<CertificationResponseDto> {
    return this.evaluations.getCertification(user.id);
  }
}
