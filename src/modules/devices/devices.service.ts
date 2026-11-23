import { Injectable } from '@nestjs/common';
import { Device, DevicePlatform, Prisma, PushProvider } from '@prisma/client';
import { ApiError } from '../../common/errors/api-error';
import { ERROR_CODES } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeviceResponseDto } from './dto/device-response.dto';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<DeviceResponseDto> {
    const pushProvider = this.resolveProvider(dto.platform, dto.pushProvider);
    if (dto.platform === DevicePlatform.WEB && !dto.pushSubscription) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Un abonnement Web Push est requis pour une plateforme web.',
      );
    }
    if (dto.platform !== DevicePlatform.WEB && !dto.pushToken) {
      throw new ApiError(
        ERROR_CODES.VALIDATION_ERROR,
        400,
        'Un jeton push est requis pour une plateforme mobile.',
      );
    }

    const device = await this.prisma.device.upsert({
      where: { userId_deviceId: { userId, deviceId: dto.deviceId } },
      update: {
        platform: dto.platform,
        pushProvider,
        pushToken: dto.pushToken ?? null,
        pushSubscription: dto.pushSubscription
          ? (dto.pushSubscription as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        appVersion: dto.appVersion ?? null,
        osVersion: dto.osVersion ?? null,
        locale: dto.locale ?? null,
        notificationsEnabled: dto.notificationsEnabled ?? true,
        lastSeenAt: new Date(),
        revokedAt: null,
      },
      create: {
        userId,
        deviceId: dto.deviceId,
        platform: dto.platform,
        pushProvider,
        pushToken: dto.pushToken ?? null,
        pushSubscription: dto.pushSubscription
          ? (dto.pushSubscription as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        appVersion: dto.appVersion ?? null,
        osVersion: dto.osVersion ?? null,
        locale: dto.locale ?? null,
        notificationsEnabled: dto.notificationsEnabled ?? true,
      },
    });

    return this.toResponse(device);
  }

  listActive(userId: string): Promise<DeviceResponseDto[]> {
    return this.prisma.device
      .findMany({
        where: { userId, revokedAt: null },
        orderBy: { lastSeenAt: 'desc' },
      })
      .then((devices) => devices.map((device) => this.toResponse(device)));
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId, revokedAt: null },
    });
    if (!device) {
      throw new ApiError(ERROR_CODES.NOT_FOUND, 404, 'Appareil introuvable.');
    }
    await this.prisma.device.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });
  }

  private resolveProvider(platform: DevicePlatform, requested?: PushProvider): PushProvider {
    if (platform === DevicePlatform.WEB) {
      return PushProvider.WEB_PUSH;
    }
    return requested ?? PushProvider.FCM;
  }

  private toResponse(device: Device): DeviceResponseDto {
    return {
      id: device.id,
      deviceId: device.deviceId,
      platform: device.platform,
      pushProvider: device.pushProvider,
      appVersion: device.appVersion,
      osVersion: device.osVersion,
      locale: device.locale,
      notificationsEnabled: device.notificationsEnabled,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    };
  }
}
