import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { MeResponseDto } from '../users/dto/me.dto';
import {
  ProfessionalProfileResponseDto,
  UpdateProfessionalProfileDto,
  UpdateUserProfileDto,
} from './dto/profile.dto';
import { ProfilesService } from './profiles.service';

@ApiTags('Profils')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class ProfilesController {
  constructor(private readonly profilesService: ProfilesService) {}

  @Get('me/profile')
  @ApiOperation({ summary: 'Profil personnel (zone affichée, jamais l’adresse privée)' })
  @ApiOkResponse({ type: MeResponseDto })
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profilesService.getProfile(user.id);
  }

  @Put('me/profile')
  @ApiOperation({ summary: 'Mettre à jour le profil personnel' })
  @ApiOkResponse({ type: MeResponseDto })
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserProfileDto) {
    return this.profilesService.updateProfile(user.id, dto);
  }

  @Get('me/professional-profile')
  @ApiOperation({ summary: 'Profil professionnel et spécialités déclarées (compat)' })
  @ApiOkResponse({ type: ProfessionalProfileResponseDto })
  getProfessionalProfile(@CurrentUser() user: AuthUser) {
    return this.profilesService.getProfessionalProfile(user.id);
  }

  @Put('me/professional-profile')
  @ApiOperation({
    summary: 'Créer ou mettre à jour le profil professionnel (rôle PROFESSIONAL attribué, compat)',
  })
  @ApiOkResponse({ type: ProfessionalProfileResponseDto })
  updateProfessionalProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ) {
    return this.profilesService.updateProfessionalProfile(user.id, dto);
  }

  @Get('professionals/me')
  @ApiOperation({ summary: 'Profil professionnel (alias spec 8.2)' })
  @ApiOkResponse({ type: ProfessionalProfileResponseDto })
  getProfessionalProfileSpec(@CurrentUser() user: AuthUser) {
    return this.profilesService.getProfessionalProfile(user.id);
  }

  @Patch('professionals/me')
  @ApiOperation({ summary: 'Créer ou mettre à jour le profil professionnel (alias spec 8.2)' })
  @ApiOkResponse({ type: ProfessionalProfileResponseDto })
  updateProfessionalProfileSpec(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfessionalProfileDto,
  ) {
    return this.profilesService.updateProfessionalProfile(user.id, dto);
  }
}
