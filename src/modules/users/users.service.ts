import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeResponseDto } from './dto/me.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        zone: { select: { id: true, code: true, name: true, department: true } },
        roles: { include: { role: true } },
      },
    });

    return {
      id: user.id,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      photoDocumentId: user.photoDocumentId,
      zone: user.zone,
      roles: user.roles.map((userRole) => userRole.role.code),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
