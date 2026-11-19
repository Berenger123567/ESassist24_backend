import { signDocumentToken, verifyDocumentToken } from './document-signature.util';

const SECRET = 'test-document-signing-secret-at-least-32';

describe('document-signature.util', () => {
  it('signe et vérifie un jeton de téléversement', () => {
    const token = signDocumentToken(
      {
        purpose: 'upload',
        documentId: '7f6b8e1c-1f2a-4c3d-8e4f-9a0b1c2d3e4f',
        contentType: 'image/png',
        sizeBytes: 128,
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      SECRET,
    );

    expect(verifyDocumentToken(token, SECRET, 'upload').contentType).toBe('image/png');
  });

  it('rejette une signature invalide', () => {
    expect(() => verifyDocumentToken('abc.def', SECRET, 'upload')).toThrow();
  });

  it('rejette un jeton expiré', () => {
    const token = signDocumentToken(
      {
        purpose: 'download',
        documentId: '7f6b8e1c-1f2a-4c3d-8e4f-9a0b1c2d3e4f',
        storageKey: '7f6b8e1c-1f2a-4c3d-8e4f-9a0b1c2d3e4f.png',
        exp: Math.floor(Date.now() / 1000) - 1,
      },
      SECRET,
    );

    expect(() => verifyDocumentToken(token, SECRET, 'download')).toThrow();
  });
});
