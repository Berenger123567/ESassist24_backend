import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  AvailabilityResponseDto,
  FavoritePageDto,
  FavoriteResponseDto,
  ProfessionalSearchQueryDto,
  ProfessionalSearchResponseDto,
  PublicProfessionalProfileDto,
  UpdateAvailabilityDto,
} from './dto/professional-directory.dto';
import { ProfessionalDirectoryService } from './professional-directory.service';

@ApiTags('Annuaire professionnel')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class ProfessionalDirectoryController {
  constructor(private readonly professionalDirectoryService: ProfessionalDirectoryService) {}

  @Get('professionals/search')
  @ApiOperation({ summary: 'Rechercher des professionnels vérifiés ou certifiés par zone' })
  @ApiOkResponse({ type: ProfessionalSearchResponseDto })
  search(@Query() query: ProfessionalSearchQueryDto) {
    return this.professionalDirectoryService.search(query);
  }

  @Get('professionals/favorites')
  @ApiOperation({ summary: 'Lister mes professionnels favoris' })
  @ApiOkResponse({ type: FavoritePageDto })
  listFavorites(@CurrentUser() user: AuthUser) {
    return this.professionalDirectoryService.listFavorites(user.id);
  }

  @Get('professionals/:id/public')
  @ApiOperation({ summary: 'Fiche publique sans adresse ni pièce justificative' })
  @ApiOkResponse({ type: PublicProfessionalProfileDto })
  getPublicProfile(@Param('id') id: string) {
    return this.professionalDirectoryService.getPublicProfile(id);
  }

  @Post('professionals/:id/favorite')
  @ApiOperation({ summary: 'Ajouter un professionnel aux favoris' })
  @ApiOkResponse({ type: FavoriteResponseDto })
  addFavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.professionalDirectoryService.addFavorite(user.id, id);
  }

  @Delete('professionals/:id/favorite')
  @ApiOperation({ summary: 'Retirer un professionnel des favoris' })
  @ApiOkResponse({ description: 'Favori supprimé.' })
  removeFavorite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.professionalDirectoryService.removeFavorite(user.id, id);
  }

  @Patch('pro/availability')
  @Roles(RoleCode.PROFESSIONAL)
  @UseGuards(AuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Mettre à jour ma disponibilité publique' })
  @ApiOkResponse({ type: AvailabilityResponseDto })
  updateAvailability(@CurrentUser() user: AuthUser, @Body() dto: UpdateAvailabilityDto) {
    return this.professionalDirectoryService.updateAvailability(user, dto);
  }
}
