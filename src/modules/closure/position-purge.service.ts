import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PositionPurgeService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 3 * * *')
  async purge(): Promise<number> {
    const ttlHours = this.config.get<number>('MISSION_POSITION_TTL_HOURS', 24);
    const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
    const result = await this.prisma.missionPosition.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }
}
