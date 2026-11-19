import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import { DataRequestsService } from './data-requests.service';
import { CreateDataRequestDto, DataRequestResponseDto } from './dto/data-request.dto';

@ApiTags('RGPD')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller('me')
@UseGuards(AuthGuard)
export class UserDataRequestsController {
  constructor(private readonly dataRequestsService: DataRequestsService) {}

  @Post('data-requests')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Créer une demande d’export, de rectification ou de suppression' })
  @ApiAcceptedResponse({ type: DataRequestResponseDto })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDataRequestDto) {
    return this.dataRequestsService.create(user.id, dto);
  }

  @Get('data-requests')
  @ApiOperation({ summary: 'Lister mes demandes de données' })
  @ApiOkResponse({ type: [DataRequestResponseDto] })
  list(@CurrentUser() user: AuthUser) {
    return this.dataRequestsService.listForUser(user.id);
  }

  @Get('data-requests/:id')
  @ApiOperation({ summary: 'Consulter une de mes demandes de données' })
  @ApiOkResponse({ type: DataRequestResponseDto })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dataRequestsService.findForUser(user.id, id);
  }
}
