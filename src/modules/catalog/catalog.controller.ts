import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CatalogService } from './catalog.service';
import {
  NearbyZoneListDto,
  NearbyZonesQueryDto,
  SpecialtyListDto,
  ZoneListDto,
  ZoneQueryDto,
} from './dto/catalog.dto';

@ApiTags('Référentiels')
@ApiCommonErrors()
@Controller()
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('specialties')
  @ApiOperation({ summary: 'Les cinq spécialités du cahier de cadrage' })
  @ApiOkResponse({ type: SpecialtyListDto })
  listSpecialties() {
    return this.catalogService.listSpecialties();
  }

  @Get('zones/nearby')
  @ApiOperation({ summary: 'Zones de service dans un rayon géographique (PostGIS)' })
  @ApiOkResponse({ type: NearbyZoneListDto })
  listNearbyZones(@Query() query: NearbyZonesQueryDto) {
    return this.catalogService.listNearbyZones(query);
  }

  @Get('zones')
  @ApiOperation({ summary: 'Communes et zones de service' })
  @ApiOkResponse({ type: ZoneListDto })
  listZones(@Query() query: ZoneQueryDto) {
    return this.catalogService.listZones(query);
  }
}
