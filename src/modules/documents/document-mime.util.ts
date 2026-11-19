import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';

export const DOCUMENT_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'image/gif',
  'image/webp',
] as const;

export type DocumentContentType = (typeof DOCUMENT_ALLOWED_CONTENT_TYPES)[number];

const EXTENSIONS: Record<DocumentContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
const GIF87A_SIGNATURE = Buffer.from('GIF87a', 'ascii');
const GIF89A_SIGNATURE = Buffer.from('GIF89a', 'ascii');
const RIFF_SIGNATURE = Buffer.from('RIFF', 'ascii');
const WEBP_SIGNATURE = Buffer.from('WEBP', 'ascii');

export function normalizeDocumentContentType(contentType: string): string {
  return contentType.trim().toLowerCase();
}

export function normalizeAllowedDocumentContentType(
  contentType: string,
): DocumentContentType | null {
  const normalized = normalizeDocumentContentType(contentType);
  return (DOCUMENT_ALLOWED_CONTENT_TYPES as readonly string[]).includes(normalized)
    ? (normalized as DocumentContentType)
    : null;
}

export function isDocumentContentTypeAllowed(contentType: string): boolean {
  return normalizeAllowedDocumentContentType(contentType) !== null;
}

export function assertAllowedDocumentContentType(contentType: string): DocumentContentType {
  const normalized = normalizeAllowedDocumentContentType(contentType);
  if (!normalized) {
    throw new ApiError(ERROR_CODES.VALIDATION_ERROR, 400, 'Type de document non autorisé.', {
      contentType,
    });
  }
  return normalized;
}

export function getDocumentExtension(contentType: string): string {
  return `.${EXTENSIONS[assertAllowedDocumentContentType(contentType)]}`;
}

export function detectDocumentMime(buffer: Buffer): DocumentContentType | null {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return null;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= PNG_SIGNATURE.length &&
    buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
  ) {
    return 'image/png';
  }

  if (
    buffer.length >= PDF_SIGNATURE.length &&
    buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  ) {
    return 'application/pdf';
  }

  if (
    buffer.length >= GIF87A_SIGNATURE.length &&
    (buffer.subarray(0, GIF87A_SIGNATURE.length).equals(GIF87A_SIGNATURE) ||
      buffer.subarray(0, GIF89A_SIGNATURE.length).equals(GIF89A_SIGNATURE))
  ) {
    return 'image/gif';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, RIFF_SIGNATURE.length).equals(RIFF_SIGNATURE) &&
    buffer.subarray(8, 12).equals(WEBP_SIGNATURE)
  ) {
    return 'image/webp';
  }

  return null;
}

export function isDetectedMimeMatchingContentType(
  declaredContentType: string,
  detectedContentType: DocumentContentType | null,
): boolean {
  if (!detectedContentType) {
    return false;
  }
  return normalizeAllowedDocumentContentType(declaredContentType) === detectedContentType;
}
