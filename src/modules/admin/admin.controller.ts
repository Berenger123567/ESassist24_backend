import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClientPlatform } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiClientHeaders } from '../../common/decorators/api-client-headers.decorator';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminIpGuard } from '../../common/guards/admin-ip.guard';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RouteRateLimitGuard } from '../../common/guards/route-rate-limit.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  AuthCookieService,
  CSRF_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from '../auth/auth-cookies.service';
import { parseClientPlatform, sanitizeDeviceId } from '../auth/client-platform';
import { CsrfService } from '../auth/csrf.service';
import { AdminAuthService, AdminSessionMeta } from './admin-auth.service';
import { AdminInvitationService } from './admin-invitation.service';
import {
  AdminLoginDto,
  AdminLoginResult,
  AdminMfaChallengeResponseDto,
  AdminMfaVerifyDto,
  AdminSessionResponseDto,
  AdminSessionResult,
  AdminTotpActivateDto,
  AdminTotpActivateResponseDto,
  AdminTotpEnrollResponseDto,
} from './dto/admin-auth.dto';
import {
  AcceptAdminInvitationDto,
  AcceptAdminInvitationResponseDto,
  AdminInvitationResponseDto,
  CreateAdminInvitationDto,
  CreateEvaluatorDto,
  CreatedAdminInvitationResponseDto,
} from './dto/admin-invitation.dto';

@ApiTags('Administration')
@ApiCommonErrors()
@ApiExtraModels(AdminMfaChallengeResponseDto, AdminSessionResponseDto)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly adminInvitationService: AdminInvitationService,
    private readonly csrfService: CsrfService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('auth/login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Connexion administrateur avec mot de passe et MFA optionnel' })
  @ApiClientHeaders({ deviceId: true })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiCookieAuth(CSRF_COOKIE_NAME)
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/AdminMfaChallengeResponseDto' },
        { $ref: '#/components/schemas/AdminSessionResponseDto' },
      ],
      discriminator: { propertyName: 'mfaRequired' },
    },
  })
  async login(
    @Body() dto: AdminLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminSessionResponseDto | AdminMfaChallengeResponseDto> {
    const meta = this.meta(
      request,
      this.header(request, 'user-agent'),
      this.header(request, 'x-client-platform'),
      dto.deviceId ?? this.header(request, 'x-device-id'),
    );
    const result = await this.adminAuthService.login(dto, meta);
    return this.applyLoginResult(response, result, meta.clientPlatform);
  }

  @Post('auth/totp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifier le code TOTP et ouvrir la session administrateur' })
  @ApiClientHeaders({ deviceId: true })
  @ApiCookieAuth(REFRESH_COOKIE_NAME)
  @ApiCookieAuth(CSRF_COOKIE_NAME)
  @ApiOkResponse({ type: AdminSessionResponseDto })
  async verifyTotp(
    @Body() dto: AdminMfaVerifyDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminSessionResponseDto> {
    const meta = this.meta(
      request,
      this.header(request, 'user-agent'),
      this.header(request, 'x-client-platform'),
      dto.deviceId ?? this.header(request, 'x-device-id'),
    );
    const tokens = await this.adminAuthService.verifyTotp(dto, meta);
    return this.applyWebSession(response, tokens, meta.clientPlatform);
  }

  @Post('auth/totp/enroll')
  @HttpCode(200)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'EVALUATOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Générer un secret TOTP pour le compte administrateur connecté' })
  @ApiOkResponse({ type: AdminTotpEnrollResponseDto })
  enrollTotp(@CurrentUser() user: AuthUser): Promise<AdminTotpEnrollResponseDto> {
    return this.adminAuthService.enrollTotp(user.id, user.phone);
  }

  @Post('auth/totp/activate')
  @HttpCode(200)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'EVALUATOR')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Activer le TOTP administrateur après vérification du code' })
  @ApiOkResponse({ type: AdminTotpActivateResponseDto })
  activateTotp(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminTotpActivateDto,
  ): Promise<AdminTotpActivateResponseDto> {
    return this.adminAuthService.activateTotp(user.id, dto);
  }

  @Post('invitations')
  @UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une invitation administrateur ou évaluateur' })
  @ApiCreatedResponse({ type: CreatedAdminInvitationResponseDto })
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminInvitationDto,
  ): Promise<CreatedAdminInvitationResponseDto> {
    return this.adminInvitationService.create(dto, user.id);
  }

  @Get('invitations')
  @UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister les invitations administrateur' })
  @ApiOkResponse({ type: [AdminInvitationResponseDto] })
  listInvitations(): Promise<AdminInvitationResponseDto[]> {
    return this.adminInvitationService.list();
  }

  @Post('evaluators')
  @UseGuards(AuthGuard, RolesGuard, AdminIpGuard, RouteRateLimitGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Créer une invitation d’évaluateur (alias)',
    description: 'Alias déprécié, utiliser POST /api/v1/admin/invitations avec role=EVALUATOR.',
    deprecated: true,
  })
  @ApiCreatedResponse({ type: CreatedAdminInvitationResponseDto })
  createEvaluator(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEvaluatorDto,
  ): Promise<CreatedAdminInvitationResponseDto> {
    return this.adminInvitationService.create(
      { phone: dto.phone, email: dto.email, role: 'EVALUATOR' },
      user.id,
    );
  }

  @Post('invitations/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accepter une invitation et créer les identifiants administrateur' })
  @ApiOkResponse({ type: AcceptAdminInvitationResponseDto })
  acceptInvitation(
    @Body() dto: AcceptAdminInvitationDto,
  ): Promise<AcceptAdminInvitationResponseDto> {
    return this.adminInvitationService.accept(dto);
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private meta(
    request: Request,
    userAgent?: string,
    platform?: string,
    deviceId?: string,
  ): AdminSessionMeta {
    return {
      ip: request.ip,
      userAgent: userAgent?.slice(0, 500),
      clientPlatform: parseClientPlatform(platform),
      clientDeviceId: sanitizeDeviceId(deviceId),
    };
  }

  private applyLoginResult(
    response: Response,
    result: AdminLoginResult,
    platform?: ClientPlatform,
  ): AdminSessionResponseDto | AdminMfaChallengeResponseDto {
    if ('mfaToken' in result) {
      return result;
    }
    return this.applyWebSession(response, result, platform);
  }

  private applyWebSession(
    response: Response,
    tokens: AdminSessionResult,
    platform?: ClientPlatform,
  ): AdminSessionResponseDto {
    if (platform !== ClientPlatform.WEB) {
      return tokens;
    }

    const csrfToken = this.csrfService.issue();
    this.cookies.setWebSession(response, tokens.refreshToken!, csrfToken);
    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      user: tokens.user,
      isNewUser: tokens.isNewUser,
      csrfToken,
      mfaRequired: false,
    };
  }
}
