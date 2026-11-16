import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
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

  @ApiPropertyOptional({ nullable: true, example: null })
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

  @ApiPropertyOptional({ nullable: true })
  nextCursor: string | null;
}
