import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookies.service';
import { AuthService } from './auth.service';
import { CsrfService } from './csrf.service';
import { ConsoleOtpSender, OTP_SENDER } from './otp.sender';
import { RateLimitService } from './rate-limit.service';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    RateLimitService,
    CsrfService,
    AuthCookieService,
    { provide: OTP_SENDER, useClass: ConsoleOtpSender },
  ],
  exports: [AuthService, RateLimitService, CsrfService, AuthCookieService],
})
export class AuthModule {}
