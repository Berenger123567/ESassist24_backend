import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class EvaluatorQueryDto {
  @ApiPropertyOptional({ example: 'Dossou', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class EvaluatorResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: '+22900000000' })
  phone: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ example: 2 })
  activeAssignments: number;

  @ApiProperty({ example: 5 })
  completedAssignments: number;
}

export class EvaluatorPageDto {
  @ApiProperty({ type: [EvaluatorResponseDto] })
  data: EvaluatorResponseDto[];
}
