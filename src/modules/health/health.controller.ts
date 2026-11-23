import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Santé')
@Controller()
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get('health')
  @ApiOperation({ summary: "État de l'API" })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    };
  }

  @Get('version')
  @ApiOperation({ summary: 'Version du contrat déployé' })
  version() {
    return {
      version: this.config.get<string>('APP_VERSION', '0.1.0'),
      contractVersion: this.config.get<string>('CONTRAT_VERSION', '1.0.0'),
      environment: this.config.get<string>('NODE_ENV', 'development'),
      apiPrefix: 'api/v1',
    };
  }
}
