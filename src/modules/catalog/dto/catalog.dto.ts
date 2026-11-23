import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../common/pagination/pagination-query.dto';

export class ZoneQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Recherche par nom de commune' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ description: 'Filtrer par département' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  department?: string;
}

export class NearbyZonesQueryDto {
  @ApiProperty({ example: 6.3703 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 2.3912 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({ example: 25, description: 'Rayon en kilomètres' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(1000)
  radiusKm: number;
}

export class SpecialtyDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BUILDING_REPAIR' })
  code: string;

  @ApiProperty({ example: 'Électricité bâtiment et dépannage' })
  label: string;

  @ApiProperty({ example: 1 })
  sortOrder: number;
}

export class SpecialtyListDto {
  @ApiProperty({ type: [SpecialtyDto] })
  data: SpecialtyDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}

export class ZoneDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'BJ-LIT-COTONOU' })
  code: string;

  @ApiProperty({ example: 'Cotonou' })
  name: string;

  @ApiProperty({ example: 'Littoral' })
  department: string;
}

export class ZoneListDto {
  @ApiProperty({ type: [ZoneDto] })
  data: ZoneDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  nextCursor: string | null;
}

export class NearbyZoneDto extends ZoneDto {
  @ApiProperty({ example: 1250.5 })
  distanceMeters: number;
}

export class NearbyZoneListDto {
  @ApiProperty({ type: [NearbyZoneDto] })
  data: NearbyZoneDto[];

  @ApiPropertyOptional({ type: String, nullable: true, example: null })
  nextCursor: string | null;
}
