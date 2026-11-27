import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { LegalDocumentType, RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RouteRateLimit } from '../../common/decorators/route-rate-limit.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import { ComplianceService, LegalConsentMeta } from './compliance.service';
import {
  AcceptLegalDocumentsDto,
  LegalConsentResponseDto,
  LegalDocumentResponseDto,
  PublishLegalDocumentDto,
} from './dto/compliance.dto';

@ApiTags('Conformité juridique')
@ApiCommonErrors()
@Controller('legal')
export class LegalController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('documents/:type/latest')
  @ApiOperation({ summary: 'Lire la dernière version publiée d’un document juridique' })
  @ApiOkResponse({ type: LegalDocumentResponseDto })
  getLatestDocument(@Param('type') type: LegalDocumentType): Promise<LegalDocumentResponseDto> {
    return this.complianceService.getLatestLegalDocument(type);
  }

  @Get('documents/:type/:version')
  @ApiOperation({ summary: 'Lire une version précise d’un document juridique' })
  @ApiOkResponse({ type: LegalDocumentResponseDto })
  getDocument(
    @Param('type') type: LegalDocumentType,
    @Param('version') version: string,
  ): Promise<LegalDocumentResponseDto> {
    return this.complianceService.getLegalDocument(type, version);
  }

  @Post('documents')
  @UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
  @Roles(RoleCode.ADMIN)
  @RouteRateLimit({ max: 'ADMIN_RATE_LIMIT_MAX' })
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publier une nouvelle version d’un document juridique' })
  @ApiOkResponse({ type: LegalDocumentResponseDto })
  publishDocument(
    @CurrentUser() admin: AuthUser,
    @Body() dto: PublishLegalDocumentDto,
  ): Promise<LegalDocumentResponseDto> {
    return this.complianceService.publishLegalDocument(admin, dto);
  }

  @Post('consents')
  @UseGuards(AuthGuard)
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enregistrer un ou plusieurs consentements juridiques' })
  @ApiOkResponse({ type: [LegalConsentResponseDto] })
  acceptConsents(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptLegalDocumentsDto,
    @Req() request: Request,
  ): Promise<LegalConsentResponseDto[]> {
    return this.complianceService.acceptLegalDocuments(user, dto, this.meta(request));
  }

  @Get('consents/mine')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister mes consentements juridiques' })
  @ApiOkResponse({ type: [LegalConsentResponseDto] })
  listMyConsents(@CurrentUser() user: AuthUser): Promise<LegalConsentResponseDto[]> {
    return this.complianceService.listMyConsents(user);
  }

  private meta(request: Request): LegalConsentMeta {
    const userAgent = request.headers['user-agent'];
    return {
      ip: request.ip,
      userAgent: Array.isArray(userAgent) ? userAgent[0] : userAgent,
    };
  }
}
