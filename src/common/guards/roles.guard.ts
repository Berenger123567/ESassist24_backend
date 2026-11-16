import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { AuthUser } from '../types/auth-user';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ApiError } from '../errors/api-error';
import { ERROR_CODES } from '../errors/error-codes';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<RoleCode[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user || !requiredRoles.some((role) => user.roles.includes(role))) {
      throw new ApiError(ERROR_CODES.FORBIDDEN, 403, 'Droits insuffisants.');
    }

    return true;
  }
}
