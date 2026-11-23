import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateEvaluationCriterionDto {
  @ApiProperty({ example: 'SECURITE' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Sécurité électrique' })
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  label: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 30, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  weight: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ReplaceEvaluationCriteriaDto {
  @ApiProperty({ type: [CreateEvaluationCriterionDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateEvaluationCriterionDto)
  criteria: CreateEvaluationCriterionDto[];
}

export class CreateEvaluationGridDto {
  @ApiProperty({ example: 'ELEC-BATIMENT-V1' })
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  code: string;

  @ApiProperty({ example: 'Grille électricité bâtiment' })
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  label: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 70, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passScore?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateEvaluationGridDto {
  @ApiPropertyOptional({ example: 'Grille électricité bâtiment' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 150)
  label?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ example: 70, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passScore?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class EvaluationCriterionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'SECURITE' })
  code: string;

  @ApiProperty({ example: 'Sécurité électrique' })
  label: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ example: 30 })
  weight: number;

  @ApiProperty({ example: 0 })
  sortOrder: number;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class EvaluationGridResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ELEC-BATIMENT-V1' })
  code: string;

  @ApiProperty({ example: 'Grille électricité bâtiment' })
  label: string;

  @ApiPropertyOptional({ nullable: true })
  description: string | null;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 70 })
  passScore: number;

  @ApiProperty({ example: true })
  active: boolean;

  @ApiPropertyOptional({ type: [EvaluationCriterionResponseDto] })
  criteria?: EvaluationCriterionResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class EvaluationGridPageDto {
  @ApiProperty({ type: [EvaluationGridResponseDto] })
  data: EvaluationGridResponseDto[];
}
