import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform, PushProvider } from '@prisma/client';

export class DeviceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty({ enum: DevicePlatform })
  platform: DevicePlatform;

  @ApiProperty({ enum: PushProvider })
  pushProvider: PushProvider;

  @ApiPropertyOptional()
  appVersion: string | null;

  @ApiPropertyOptional()
  osVersion: string | null;

  @ApiPropertyOptional()
  locale: string | null;

  @ApiProperty()
  notificationsEnabled: boolean;

  @ApiProperty()
  lastSeenAt: Date;

  @ApiProperty()
  createdAt: Date;
}
