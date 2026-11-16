import { ClientPlatform } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

export function parseClientPlatform(raw?: string | string[]): ClientPlatform {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) {
    return ClientPlatform.UNKNOWN;
  }

  switch (value.trim().toLowerCase()) {
    case 'web':
      return ClientPlatform.WEB;
    case 'android':
      return ClientPlatform.ANDROID;
    case 'ios':
      return ClientPlatform.IOS;
    case 'unknown':
      return ClientPlatform.UNKNOWN;
    default:
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Plateforme cliente invalide.', {
        header: 'X-Client-Platform',
        allowed: ['web', 'android', 'ios'],
      });
  }
}

export function sanitizeDeviceId(raw?: string | string[]): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 200) : undefined;
}
