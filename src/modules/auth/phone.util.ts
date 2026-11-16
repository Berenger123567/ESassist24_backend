import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

const BENIN_TEST_NUMBER = /^\+2290{7}\d$/;

export function normalizePhone(raw: string, allowTestNumbers = false): string {
  const compact = raw
    .trim()
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+');
  const candidate = compact.startsWith('+')
    ? compact
    : /^0\d{9}$/.test(compact)
      ? `+229${compact}`
      : /^\d{8}$/.test(compact)
        ? `+229${compact}`
        : compact;

  if (BENIN_TEST_NUMBER.test(candidate)) {
    if (!allowTestNumbers) {
      throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Numéro de téléphone invalide.', {
        field: 'phone',
      });
    }
    return candidate;
  }

  const parsed = parsePhoneNumberFromString(candidate, 'BJ');
  if (!parsed || !parsed.isValid() || parsed.country !== 'BJ') {
    throw new ApiError(
      ERROR_CODES.VALIDATION_ERROR,
      400,
      'Numéro de téléphone béninois invalide.',
      { field: 'phone' },
    );
  }

  return parsed.number;
}

export function maskPhone(phone: string): string {
  if (phone.length <= 4) {
    return '****';
  }
  return `${phone.slice(0, 4)}${'•'.repeat(Math.max(0, phone.length - 6))}${phone.slice(-2)}`;
}
