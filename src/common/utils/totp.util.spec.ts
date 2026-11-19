import { buildOtpAuthUri, generateTotpCode, generateTotpSecret, verifyTotp } from './totp.util';

describe('TOTP', () => {
  it('génère et valide un code dans la fenêtre de temps', () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = generateTotpCode(secret, now);

    expect(code).toMatch(/^\d{6}$/);
    expect(verifyTotp(secret, code, 1, now)).toEqual({
      valid: true,
      step: Math.floor(now / 30_000),
    });
  });

  it('rejette un code invalide', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '000000', 1, 1_700_000_000_000)).toBeNull();
  });

  it('construit une URI otpauth', () => {
    const secret = generateTotpSecret();
    const uri = buildOtpAuthUri(secret, '+22997000000', 'Electro Assist 24H');

    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('issuer=Electro%20Assist%2024H');
    expect(uri).toContain('algorithm=SHA1');
  });
});
