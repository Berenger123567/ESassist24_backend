import { Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

@Injectable()
export class CsrfService {
  issue(): string {
    return randomBytes(32).toString('base64url');
  }

  assertValid(headerToken?: string, cookieToken?: string): void {
    if (!headerToken || !cookieToken) {
      throw this.invalid();
    }

    const header = Buffer.from(headerToken);
    const cookie = Buffer.from(cookieToken);
    if (header.length !== cookie.length || !timingSafeEqual(header, cookie)) {
      throw this.invalid();
    }
  }

  private invalid(): ApiError {
    return new ApiError(ERROR_CODES.AUTH_CSRF_INVALID, 403, 'Jeton CSRF invalide ou manquant.');
  }
}
