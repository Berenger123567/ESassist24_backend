import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DevicePlatform, PushProvider } from '@prisma/client';

export class RegisterDeviceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  deviceId: string;

  @ApiProperty({ enum: DevicePlatform })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiPropertyOptional({ enum: PushProvider })
  @IsOptional()
  @IsEnum(PushProvider)
  pushProvider?: PushProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  pushToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  pushSubscription?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  osVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z]{2}(-[a-zA-Z]{2})?$/)
  locale?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}
