import { Body, Controller, Get, Inject, Patch, UseGuards, forwardRef } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../../common/types/auth-user';
import { UpdateUserProfileDto } from '../profiles/dto/profile.dto';
import { ProfilesService } from '../profiles/profiles.service';
import { MeResponseDto } from './dto/me.dto';
import { UsersService } from './users.service';

@ApiTags('Identité')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('me')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => ProfilesService))
    private readonly profilesService: ProfilesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Profil du compte connecté' })
  @ApiOkResponse({ type: MeResponseDto })
  getMe(@CurrentUser() user: AuthUser) {
    return this.usersService.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Mettre à jour le profil personnel (alias spec 8.2)' })
  @ApiOkResponse({ type: MeResponseDto })
  patchMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserProfileDto) {
    return this.profilesService.updateProfile(user.id, dto);
  }
}
