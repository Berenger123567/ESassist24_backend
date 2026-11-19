import {
  assertAllowedDocumentContentType,
  detectDocumentMime,
  isDetectedMimeMatchingContentType,
} from './document-mime.util';

describe('document-mime.util', () => {
  it('détecte les signatures PNG, JPEG et PDF', () => {
    expect(detectDocumentMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(detectDocumentMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(detectDocumentMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
  });

  it('rejette un type déclaré non autorisé', () => {
    expect(() => assertAllowedDocumentContentType('application/x-msdownload')).toThrow();
  });

  it('refuse un écart entre type déclaré et type détecté', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(isDetectedMimeMatchingContentType('image/png', detectDocumentMime(png))).toBe(true);
    expect(isDetectedMimeMatchingContentType('application/pdf', detectDocumentMime(png))).toBe(
      false,
    );
  });
});
