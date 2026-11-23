import { isIPv4, isIPv6 } from 'net';

export function parseCidrList(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function normalizeIp(ip?: string | null): string {
  if (!ip) {
    return '';
  }
  const cleaned = ip
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  if (cleaned.startsWith('::ffff:')) {
    return cleaned.slice(7);
  }
  return cleaned;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const address = normalizeIp(ip);
  const target = normalizeIp(cidr.split('/')[0]);
  if (!address || !target) {
    return false;
  }

  const separator = cidr.indexOf('/');
  if (separator === -1) {
    return address === target;
  }

  const prefix = Number(cidr.slice(separator + 1));
  if (!Number.isInteger(prefix) || prefix < 0) {
    return false;
  }

  if (isIPv4(address) && isIPv4(target)) {
    if (prefix > 32) {
      return false;
    }
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipv4ToInt(address) & mask) === (ipv4ToInt(target) & mask);
  }

  if (isIPv6(address) && isIPv6(target)) {
    if (prefix > 128) {
      return false;
    }
    const addressGroups = expandIpv6(address);
    const targetGroups = expandIpv6(target);
    if (!addressGroups || !targetGroups) {
      return false;
    }
    let remaining = prefix;
    for (let index = 0; index < 8; index += 1) {
      if (remaining <= 0) {
        break;
      }
      const bits = Math.min(16, remaining);
      const mask = bits === 16 ? 0xffff : (0xffff << (16 - bits)) & 0xffff;
      if ((addressGroups[index] & mask) !== (targetGroups[index] & mask)) {
        return false;
      }
      remaining -= bits;
    }
    return true;
  }

  return false;
}

export function ipMatchesAny(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => ipMatchesCidr(ip, cidr));
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((result, part) => ((result << 8) + Number(part)) >>> 0, 0) >>> 0;
}

function expandIpv6(ip: string): number[] | null {
  const parts = ip.split('::');
  if (parts.length > 2) {
    return null;
  }
  const left = parts[0] ? parts[0].split(':') : [];
  const right = parts[1] ? parts[1].split(':') : [];
  const missing = parts.length === 2 ? 8 - left.length - right.length : 8 - left.length;
  if (missing < 0) {
    return null;
  }
  const groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  if (groups.length !== 8) {
    return null;
  }
  const values = groups.map((group) => Number.parseInt(group, 16));
  return values.every((value) => Number.isInteger(value)) ? values : null;
}
