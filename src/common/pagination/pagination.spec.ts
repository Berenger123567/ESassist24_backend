import { normalizePhone } from '../../modules/auth/phone.util';
import { buildPage, decodeCursor, encodeCursor } from './pagination';

describe('normalizePhone', () => {
  it('conserve un numÃ©ro bÃ©ninois au format international', () => {
    expect(normalizePhone('+2290197000000')).toBe('+2290197000000');
  });

  it('normalise un numÃ©ro local Ã  dix chiffres', () => {
    expect(normalizePhone('0197000000')).toBe('+2290197000000');
  });

  it('supprime les espaces et tirets', () => {
    expect(normalizePhone('+229 01 97-00-00-00')).toBe('+2290197000000');
  });

  it('refuse un numÃ©ro non bÃ©ninois', () => {
    expect(() => normalizePhone('+33612345678')).toThrow();
  });

  it('accepte les numÃ©ros de test uniquement si autorisÃ©', () => {
    expect(normalizePhone('+22900000001', true)).toBe('+22900000001');
    expect(() => normalizePhone('+22900000001', false)).toThrow();
  });
});

describe('pagination', () => {
  it('retourne un curseur quand il reste des Ã©lÃ©ments', () => {
    const page = buildPage([1, 2, 3, 4], 3, (item) => String(item));
    expect(page.data).toEqual([1, 2, 3]);
    expect(page.nextCursor).toBeTruthy();
  });

  it('ne retourne pas de curseur sur la derniÃ¨re page', () => {
    const page = buildPage([1, 2], 3, (item) => String(item));
    expect(page.nextCursor).toBeNull();
  });

  it('encode et dÃ©code un curseur', () => {
    const cursor = encodeCursor({ name: 'Cotonou', id: 'abc' });
    expect(decodeCursor(cursor)).toEqual({ name: 'Cotonou', id: 'abc' });
  });

  it('refuse un curseur invalide', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow();
  });
});
