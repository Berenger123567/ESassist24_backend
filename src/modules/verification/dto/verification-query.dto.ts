import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class VerificationQueryDto {
  @ApiPropertyOptional({ default: 'PENDING', description: 'Statuts séparés par des virgules' })
  @IsOptional()
  @IsString()
  status?: string = 'PENDING';

  @ApiPropertyOptional({ enum: ['oldest', 'newest'], default: 'oldest' })
  @IsOptional()
  @IsString()
  sort?: 'oldest' | 'newest' = 'oldest';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  overdue?: boolean;
}
