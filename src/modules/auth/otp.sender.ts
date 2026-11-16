import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { maskPhone } from './phone.util';

export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpSender {
  send(phone: string, code: string): Promise<void>;
}

@Injectable()
export class ConsoleOtpSender implements OtpSender {
  private readonly logger = new Logger(ConsoleOtpSender.name);
  private readonly nodeEnv: string;

  constructor(config: ConfigService) {
    this.nodeEnv = config.get<string>('NODE_ENV', 'development');
  }

  async send(phone: string, code: string): Promise<void> {
    if (this.nodeEnv === 'production') {
      this.logger.error("Aucun fournisseur OTP n'est configuré pour la production.");
      throw new ApiError(
        ERROR_CODES.INTERNAL_ERROR,
        500,
        "L'envoi de code n'est pas encore configuré.",
      );
    }

    const codeInfo =
      this.nodeEnv === 'development' || this.nodeEnv === 'test' ? ` code=${code}` : '';
    this.logger.log(`Code OTP pour ${maskPhone(phone)}${codeInfo}`);
  }
}
