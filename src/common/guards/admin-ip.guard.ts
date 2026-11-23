import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError } from '../errors/api-error';
import { ERROR_CODES } from '../errors/error-codes';
import { ContextualRequest } from '../middleware/request-context.middleware';
import { ipMatchesAny, normalizeIp, parseCidrList } from '../net/cidr.util';

@Injectable()
export class AdminIpGuard implements CanActivate {
  private readonly logger = new Logger(AdminIpGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ContextualRequest>();
    const path = request.originalUrl.split('?')[0];

    if (!path.startsWith('/api/v1/admin/') || path.startsWith('/api/v1/admin/auth/')) {
      return true;
    }

    const allowlist = parseCidrList(this.config.get<string>('ADMIN_IP_ALLOWLIST'));
    const devBypass = this.config.get<string>('ADMIN_IP_DEV_BYPASS') === 'true';

    if (allowlist.length === 0 && devBypass) {
      this.logger.warn('ADMIN_IP_DEV_BYPASS actif : contrôle IP administrateur désactivé.');
      return true;
    }

    if (allowlist.length === 0) {
      throw new ApiError(ERROR_CODES.IP_NOT_ALLOWED, 403, 'Adresse IP administrateur refusée.');
    }

    const remoteAddress = normalizeIp(request.socket?.remoteAddress);
    const trustedProxies = parseCidrList(this.config.get<string>('TRUST_PROXY_CIDR'));
    const forwarded = request.headers['x-forwarded-for'];
    const forwardedIp =
      typeof forwarded === 'string' && forwarded.length > 0
        ? normalizeIp(forwarded.split(',')[0])
        : '';
    const effectiveIp =
      remoteAddress && ipMatchesAny(remoteAddress, trustedProxies) && forwardedIp
        ? forwardedIp
        : remoteAddress;

    if (!effectiveIp || !ipMatchesAny(effectiveIp, allowlist)) {
      throw new ApiError(ERROR_CODES.IP_NOT_ALLOWED, 403, 'Adresse IP administrateur refusée.');
    }

    return true;
  }
}
