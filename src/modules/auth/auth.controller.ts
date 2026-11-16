import { Body, Controller, Headers, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ClientPlatform } from '@prisma/client';
import { Request, Response } from 'express';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import { AuthCookieService, CSRF_COOKIE_NAME, REFRESH_COOKIE_NAME } from './auth-cookies.service';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { parseClientPlatform, sanitizeDeviceId } from './client-platform';
import {
  AuthTokensDto,
  RefreshTokenDto,
  RequestOtpDto,
  RequestOtpResponseDto,
  VerifyOtpDto,
} from './dto/auth.dto';

@ApiTags('Authentification')
@ApiCommonErrors()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfService: CsrfService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Post('otp/request')
  @HttpCode(202)
  @ApiOperation({ summary: 'Demander un code à usage unique' })
  @ApiHeader({ name: 'X-Client-Platform', required: false })
  @ApiAcceptedResponse({ type: RequestOtpResponseDto })
  requestOtp(
    @Body() dto: RequestOtpDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-client-platform') platform?: string,
  ) {
    return this.authService.requestOtp(
      dto.phone,
      this.meta(request, userAgent, platform, dto.deviceId),
    );
  }

  @Post('otp/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vérifier le code et ouvrir une session' })
  @ApiHeader({ name: 'X-Client-Platform', required: false })
  @ApiHeader({ name: 'X-Device-Id', required: false })
  @ApiOkResponse({ type: AuthTokensDto })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-client-platform') platformHeader?: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const meta = this.meta(request, userAgent, platformHeader, dto.deviceId ?? deviceId);
    const tokens = await this.authService.verifyOtp(dto.phone, dto.code, meta);
    return this.applyWebSession(response, tokens, meta.clientPlatform);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Renouveler la session avec rotation du jeton' })
  @ApiHeader({ name: 'X-Client-Platform', required: false })
  @ApiHeader({ name: 'X-CSRF-Token', required: false })
  @ApiCookieAuth()
  @ApiOkResponse({ type: AuthTokensDto })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent?: string,
    @Headers('x-client-platform') platformHeader?: string,
    @Headers('x-device-id') deviceId?: string,
    @Headers('x-csrf-token') csrfHeader?: string,
  ) {
    const meta = this.meta(request, userAgent, platformHeader, dto.deviceId ?? deviceId);
    if (meta.clientPlatform === ClientPlatform.WEB) {
      this.csrfService.assertValid(csrfHeader, request.cookies?.[CSRF_COOKIE_NAME]);
    }
    const refreshToken = this.resolveRefreshToken(request, dto, meta.clientPlatform);
    const tokens = await this.authService.refresh(refreshToken, meta);
    return this.applyWebSession(response, tokens, meta.clientPlatform);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Révoquer la session courante' })
  @ApiNoContentResponse()
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(user.sessionId);
    this.cookies.clear(response);
  }

  private meta(request: Request, userAgent?: string, platform?: string, deviceId?: string) {
    return {
      ip: request.ip,
      userAgent: userAgent?.slice(0, 500),
      clientPlatform: parseClientPlatform(platform),
      clientDeviceId: sanitizeDeviceId(deviceId),
    };
  }

  private resolveRefreshToken(
    request: Request,
    dto: RefreshTokenDto,
    platform: ClientPlatform,
  ): string {
    const cookieToken = request.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (platform === ClientPlatform.WEB && cookieToken) {
      return cookieToken;
    }
    if (dto.refreshToken) {
      return dto.refreshToken;
    }
    if (cookieToken) {
      return cookieToken;
    }
    throw new ApiError(
      ERROR_CODES.AUTH_REFRESH_INVALID,
      401,
      'Jeton de rafraîchissement manquant.',
    );
  }

  private applyWebSession(
    response: Response,
    tokens: AuthTokensDto,
    platform?: ClientPlatform,
  ): AuthTokensDto {
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
    };
  }
}
