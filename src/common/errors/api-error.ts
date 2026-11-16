import { HttpException } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export class ApiError extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, status: number, message: string, details?: Record<string, unknown>) {
    super({ code, message, details }, status);
    this.code = code;
    this.details = details;
  }
}
