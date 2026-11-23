import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationDecisionType, VerifiedReasonCode } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class VerificationDecisionDto {
  @ApiProperty({ enum: VerificationDecisionType })
  @IsEnum(VerificationDecisionType)
  decision: VerificationDecisionType;

  @ApiProperty({ enum: VerifiedReasonCode })
  @IsEnum(VerifiedReasonCode)
  reasonCode: VerifiedReasonCode;

  @ApiPropertyOptional({ minLength: 20, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @Length(20, 1000)
  reasonText?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  requestedItems?: string[];
}
