import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  ConversationPageDto,
  MarkReadDto,
  MessagePageDto,
  MessageResponseDto,
  SendMessageDto,
} from './dto/messaging.dto';
import { MessagingGateway } from './messaging.gateway';
import { MessagingService } from './messaging.service';

@ApiTags('Messagerie')
@ApiBearerAuth()
@ApiCommonErrors()
@Controller()
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingGateway: MessagingGateway,
  ) {}

  @Get('conversations')
  @ApiOperation({ summary: 'Lister mes conversations' })
  @ApiOkResponse({ type: ConversationPageDto })
  listConversations(@CurrentUser() user: AuthUser) {
    return this.messagingService.listConversations(user);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Lire les messages avec rattrapage par curseur' })
  @ApiOkResponse({ type: MessagePageDto })
  listMessages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messagingService.listMessages(user, id, after, limit ? Number(limit) : 50);
  }

  @Post('conversations/:id/messages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Envoyer un message et diffuser via WebSocket' })
  @ApiOkResponse({ type: MessageResponseDto })
  async sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.messagingService.sendMessage(user, id, dto);
    await this.messagingGateway.broadcast(id, message);
    return message;
  }

  @Post('conversations/:id/read')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marquer un message comme lu' })
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MarkReadDto) {
    return this.messagingService.markRead(user, id, dto.messageId);
  }

  @Delete('conversations/:id/messages/:messageId')
  @HttpCode(200)
  @ApiOperation({ summary: 'Supprimer logiquement un message' })
  deleteMessage(@CurrentUser() user: AuthUser, @Param('messageId') messageId: string) {
    return this.messagingService.deleteMessage(user, messageId);
  }
}
