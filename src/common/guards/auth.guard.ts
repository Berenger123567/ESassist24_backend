import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiError } from '../errors/api-error';
import { ERROR_CODES } from '../errors/error-codes';
import { AuthUser } from '../types/auth-user';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  roles: string[];
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const token = this.extractToken(request);

    if (!token) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 401, 'Jeton d’accès manquant.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 401, 'Jeton d’accès invalide ou expiré.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });

    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= Date.now()
    ) {
      throw new ApiError(ERROR_CODES.UNAUTHORIZED, 401, 'Session invalide ou révoquée.');
    }

    if (session.user.deletedAt !== null) {
      throw new ApiError(ERROR_CODES.ACCOUNT_DELETED, 403, 'Compte supprimé.');
    }

    request.user = {
      id: session.user.id,
      phone: session.user.phone,
      status: session.user.status,
      roles: session.user.roles.map((userRole) => userRole.role.code),
      sessionId: session.id,
    };

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) {
      return null;
    }
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
  }
}
