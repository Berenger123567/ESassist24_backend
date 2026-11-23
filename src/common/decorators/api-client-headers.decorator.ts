import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export function ApiClientHeaders(options: { deviceId?: boolean; csrf?: boolean } = {}) {
  const decorators = [ApiHeader({ name: 'x-client-platform', required: false })];
  if (options.deviceId) {
    decorators.push(ApiHeader({ name: 'x-device-id', required: false }));
  }
  if (options.csrf) {
    decorators.push(ApiHeader({ name: 'x-csrf-token', required: false }));
  }
  return applyDecorators(...decorators);
}
