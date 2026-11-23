import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import { DeviceResponseDto } from './dto/device-response.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DevicesService } from './devices.service';

@ApiTags('Appareils')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('devices')
@UseGuards(AuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lister mes appareils actifs',
    description:
      'Alias de compatibilité, utiliser POST /api/v1/devices pour enregistrer un appareil.',
    deprecated: true,
  })
  @ApiOkResponse({ type: [DeviceResponseDto] })
  listActive(@CurrentUser() user: AuthUser) {
    return this.devicesService.listActive(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Enregistrer ou mettre à jour un appareil de notification' })
  @ApiCreatedResponse({ type: DeviceResponseDto })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    return this.devicesService.register(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Révoquer un appareil de notification' })
  @ApiNoContentResponse()
  async revoke(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.devicesService.revoke(user.id, id);
  }
}
