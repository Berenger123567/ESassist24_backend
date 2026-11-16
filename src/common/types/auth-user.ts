import { RoleCode, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  phone: string;
  status: UserStatus;
  roles: RoleCode[];
  sessionId: string;
}
