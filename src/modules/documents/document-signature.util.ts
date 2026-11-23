import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

export type DocumentTokenPurpose = 'upload' | 'download';

export interface UploadDocumentTokenPayload {
  purpose: 'upload';
  documentId: string;
  contentType: string;
  sizeBytes: number;
  exp: number;
}

export interface DownloadDocumentTokenPayload {
  purpose: 'download';
  documentId: string;
  storageKey: string;
  sessionId?: string;
  exp: number;
}

export type DocumentTokenPayload = UploadDocumentTokenPayload | DownloadDocumentTokenPayload;

function invalidToken(): never {
  throw new ApiError(ERROR_CODES.DOCUMENT_SIGNATURE_INVALID, 400, 'Lien signé invalide.');
}

function expiredToken(): never {
  throw new ApiError(ERROR_CODES.DOCUMENT_URL_EXPIRED, 410, 'Lien signé expiré.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function signDocumentToken(payload: DocumentTokenPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', secret).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${signature}`;
}

export function verifyDocumentToken(
  token: string,
  secret: string,
  purpose: 'upload',
): UploadDocumentTokenPayload;
export function verifyDocumentToken(
  token: string,
  secret: string,
  purpose: 'download',
): DownloadDocumentTokenPayload;
export function verifyDocumentToken(
  token: string,
  secret: string,
  purpose: DocumentTokenPurpose,
): DocumentTokenPayload {
  if (typeof token !== 'string' || token.length === 0) {
    invalidToken();
  }

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    invalidToken();
  }

  const encodedPayload = parts[0];
  const encodedSignature = parts[1];
  const expectedSignature = createHmac('sha256', secret).update(encodedPayload).digest();
  const providedSignature = Buffer.from(encodedSignature, 'base64url');

  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    invalidToken();
  }

  let decoded: unknown = null;
  try {
    decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    invalidToken();
  }

  if (!isRecord(decoded) || decoded.purpose !== purpose) {
    invalidToken();
  }

  if (
    typeof decoded.documentId !== 'string' ||
    decoded.documentId.length === 0 ||
    typeof decoded.exp !== 'number' ||
    !Number.isInteger(decoded.exp)
  ) {
    invalidToken();
  }

  if (purpose === 'upload') {
    if (
      typeof decoded.contentType !== 'string' ||
      decoded.contentType.length === 0 ||
      typeof decoded.sizeBytes !== 'number' ||
      !Number.isInteger(decoded.sizeBytes) ||
      decoded.sizeBytes <= 0
    ) {
      invalidToken();
    }
  } else if (typeof decoded.storageKey !== 'string' || decoded.storageKey.length === 0) {
    invalidToken();
  } else if (
    decoded.sessionId !== undefined &&
    (typeof decoded.sessionId !== 'string' || decoded.sessionId.length === 0)
  ) {
    invalidToken();
  }

  if (decoded.exp <= Math.floor(Date.now() / 1000)) {
    expiredToken();
  }

  return decoded as unknown as DocumentTokenPayload;
}
