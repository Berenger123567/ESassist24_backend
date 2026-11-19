import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildPage,
  decodeCursor,
  encodeCursor,
  Page,
  resolveLimit,
} from '../../common/pagination/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NearbyZoneDto,
  NearbyZonesQueryDto,
  SpecialtyDto,
  ZoneDto,
  ZoneQueryDto,
} from './dto/catalog.dto';

interface ZoneCursor {
  name: string;
  id: string;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listSpecialties(): Promise<Page<SpecialtyDto>> {
    const data = await this.prisma.specialty.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: { id: true, code: true, label: true, sortOrder: true },
    });

    return { data, nextCursor: null };
  }

  async listZones(query: ZoneQueryDto): Promise<Page<ZoneDto>> {
    const limit = resolveLimit(query.limit);
    const cursor = decodeCursor<ZoneCursor>(query.cursor);

    const filters: Prisma.ServiceZoneWhereInput[] = [];
    if (query.q) {
      filters.push({ name: { contains: query.q, mode: 'insensitive' } });
    }
    if (query.department) {
      filters.push({ department: { equals: query.department, mode: 'insensitive' } });
    }
    if (cursor) {
      filters.push({
        OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
      });
    }

    const rows = await this.prisma.serviceZone.findMany({
      where: filters.length > 0 ? { AND: filters } : {},
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: { id: true, code: true, name: true, department: true },
    });

    const page = buildPage(rows, limit, (zone) => encodeCursor({ name: zone.name, id: zone.id }));
    return page;
  }

  async listNearbyZones(query: NearbyZonesQueryDto): Promise<Page<NearbyZoneDto>> {
    const radiusMeters = query.radiusKm * 1000;
    const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${query.lng}::float8, ${query.lat}::float8), 4326)::geography`;
    const rows = await this.prisma.$queryRaw<NearbyZoneDto[]>(Prisma.sql`
      SELECT
        z."id" AS "id",
        z."code" AS "code",
        z."name" AS "name",
        z."department" AS "department",
        ST_Distance(z."center"::geography, ${point}) AS "distanceMeters"
      FROM "service_zones" z
      WHERE z."center" IS NOT NULL
        AND ST_DWithin(z."center"::geography, ${point}, ${radiusMeters}::float8)
      ORDER BY "distanceMeters" ASC
      LIMIT 50
    `);

    return { data: rows, nextCursor: null };
  }
}
