import { ipMatchesAny, ipMatchesCidr, normalizeIp, parseCidrList } from './cidr.util';

describe('cidr.util', () => {
  it('normalise les adresses IPv4-mappées et les crochets IPv6', () => {
    expect(normalizeIp('::ffff:192.0.2.10')).toBe('192.0.2.10');
    expect(normalizeIp('[2001:DB8::1]')).toBe('2001:db8::1');
  });

  it('évalue les CIDR IPv4', () => {
    expect(ipMatchesCidr('192.0.2.42', '192.0.2.0/24')).toBe(true);
    expect(ipMatchesCidr('192.0.3.42', '192.0.2.0/24')).toBe(false);
    expect(ipMatchesCidr('::ffff:192.0.2.42', '192.0.2.42')).toBe(true);
    expect(ipMatchesCidr('192.0.2.42', '192.0.2.0/33')).toBe(false);
  });

  it('évalue les CIDR IPv6', () => {
    expect(ipMatchesCidr('2001:db8::abcd', '2001:db8::/32')).toBe(true);
    expect(ipMatchesCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  it('ignore les entrées vides et applique une liste', () => {
    expect(parseCidrList('10.0.0.0/8, , 192.0.2.1')).toEqual(['10.0.0.0/8', '192.0.2.1']);
    expect(ipMatchesAny('192.0.2.1', ['10.0.0.0/8', '192.0.2.1'])).toBe(true);
  });
});
