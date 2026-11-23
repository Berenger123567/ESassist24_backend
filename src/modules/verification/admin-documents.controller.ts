import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RouteRateLimit } from '../../common/decorators/route-rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';
import { AuthUser } from '../../common/types/auth-user';
import { DocumentsService } from '../documents/documents.service';
import { VerificationService } from './verification.service';

@ApiTags('Vérification professionnelle')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('admin/documents')
@UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
@Roles('ADMIN')
export class AdminDocumentsController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly documentsService: DocumentsService,
  ) {}

  @Get('view/:token')
  @ApiOperation({ summary: 'Consulter un document via un lien signé lié à la session admin' })
  @ApiOkResponse({ description: 'Flux binaire du document.' })
  async view(
    @Param('token') token: string,
    @CurrentUser() admin: AuthUser,
    @Res() response: Response,
  ) {
    await this.documentsService.downloadDocument(token, response, admin.sessionId);
  }

  @Get(':id/view-url')
  @RouteRateLimit({ max: 'ADMIN_VIEW_URL_RATE_LIMIT_MAX' })
  @ApiOperation({ summary: 'Créer un lien signé de consultation valable 5 minutes' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        documentId: { type: 'string' },
        viewUrl: { type: 'string' },
        method: { type: 'string', example: 'GET' },
        expiresInSeconds: { type: 'number', example: 300 },
      },
    },
  })
  createViewUrl(
    @Param('id') id: string,
    @CurrentUser() admin: AuthUser,
    @Req() request: ContextualRequest,
  ) {
    return this.verificationService.createAdminViewUrl(admin, id, request);
  }
}
