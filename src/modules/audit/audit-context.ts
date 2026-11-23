import { RoleCode } from '@prisma/client';
import { AuthUser } from '../../common/types/auth-user';
import { ContextualRequest } from '../../common/middleware/request-context.middleware';

export interface AuditContextFields {
  actorId?: string | null;
  actorRole?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  sessionId?: string | null;
  requestId?: string | null;
  deviceId?: string | null;
}

export function auditContextFromRequest(
  request: ContextualRequest,
  user?: AuthUser,
): AuditContextFields {
  const deviceId = request.headers['x-device-id'];
  return {
    actorId: user?.id ?? null,
    actorRole: user?.roles?.[0] ?? (null as RoleCode | null),
    ip: request.ip ?? null,
    userAgent:
      typeof request.headers['user-agent'] === 'string'
        ? request.headers['user-agent'].slice(0, 500)
        : null,
    sessionId: user?.sessionId ?? null,
    requestId: request.requestId ?? null,
    deviceId: typeof deviceId === 'string' ? deviceId.slice(0, 200) : null,
  };
}
