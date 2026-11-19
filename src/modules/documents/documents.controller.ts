import { Body, Controller, Get, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ApiCommonErrors } from '../../common/decorators/api-common-errors.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { AuthUser } from '../../common/types/auth-user';
import {
  CreateDocumentUploadUrlDto,
  DocumentDownloadUrlResponseDto,
  DocumentDto,
  DocumentEventDto,
  DocumentUploadUrlResponseDto,
  UploadDocumentResponseDto,
} from './dto/document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@ApiCommonErrors()
@Controller('pro/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload-url')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Préparer un téléversement de document privé' })
  @ApiBody({ type: CreateDocumentUploadUrlDto })
  @ApiCreatedResponse({ type: DocumentUploadUrlResponseDto })
  createUploadUrl(@CurrentUser() user: AuthUser, @Body() dto: CreateDocumentUploadUrlDto) {
    return this.documentsService.createUploadUrl(user.id, dto);
  }

  @Put('upload/:token')
  @ApiOperation({ summary: 'Téléverser un document avec une URL signée' })
  @ApiParam({ name: 'token', type: String })
  @ApiOkResponse({ type: UploadDocumentResponseDto })
  uploadDocument(@Param('token') token: string, @Req() request: Request) {
    return this.documentsService.uploadDocument(token, request.body as unknown);
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lister mes documents privés' })
  @ApiOkResponse({ type: [DocumentDto] })
  listDocuments(@CurrentUser() user: AuthUser) {
    return this.documentsService.listDocuments(user.id);
  }

  @Post(':id/download-url')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Créer une URL signée de téléchargement' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: DocumentDownloadUrlResponseDto })
  createDownloadUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documentsService.createDownloadUrl(user.id, user.roles, id);
  }

  @Get('download/:token')
  @ApiOperation({ summary: 'Télécharger un document avec une URL signée' })
  @ApiParam({ name: 'token', type: String })
  @ApiOkResponse({ description: 'Flux binaire du document.' })
  async downloadDocument(@Param('token') token: string, @Res() response: Response): Promise<void> {
    await this.documentsService.downloadDocument(token, response);
  }

  @Get(':id/history')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Historique des événements d’un document' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [DocumentEventDto] })
  getHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.documentsService.getHistory(user.id, id);
  }
}
