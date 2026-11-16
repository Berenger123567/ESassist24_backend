import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'ea_refresh';
export const CSRF_COOKIE_NAME = 'ea_csrf';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

@Injectable()
export class AuthCookieService {
  private readonly secure: boolean;
  private readonly sameSite: CookieOptions['sameSite'];
  private readonly domain?: string;
  private readonly refreshMaxAge: number;

  constructor(config: ConfigService) {
    this.secure = config.get<string>('AUTH_COOKIE_SECURE', 'false') === 'true';
    this.sameSite = config.get<CookieOptions['sameSite']>('AUTH_COOKIE_SAMESITE', 'lax');
    this.domain = config.get<string>('AUTH_COOKIE_DOMAIN') || undefined;
    this.refreshMaxAge = config.get<number>('REFRESH_TTL_DAYS', 30) * 24 * 60 * 60 * 1000;
  }

  setWebSession(response: Response, refreshToken: string, csrfToken: string): void {
    response.cookie(REFRESH_COOKIE_NAME, refreshToken, this.refreshOptions());
    response.cookie(CSRF_COOKIE_NAME, csrfToken, this.csrfOptions());
  }

  refreshSocket(): CookieOptions {
    return this.refreshOptions();
  }

  clear(response: Response): void {
    response.clearCookie(REFRESH_COOKIE_NAME, this.refreshClearOptions());
    response.clearCookie(CSRF_COOKIE_NAME, this.csrfClearOptions());
  }

  private refreshOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      domain: this.domain,
      path: REFRESH_COOKIE_PATH,
      maxAge: this.refreshMaxAge,
    };
  }

  private csrfOptions(): CookieOptions {
    return {
      httpOnly: false,
      secure: this.secure,
      sameSite: this.sameSite,
      domain: this.domain,
      path: '/',
      maxAge: this.refreshMaxAge,
    };
  }

  private refreshClearOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.secure,
      sameSite: this.sameSite,
      domain: this.domain,
      path: REFRESH_COOKIE_PATH,
    };
  }

  private csrfClearOptions(): CookieOptions {
    return {
      httpOnly: false,
      secure: this.secure,
      sameSite: this.sameSite,
      domain: this.domain,
      path: '/',
    };
  }
}
