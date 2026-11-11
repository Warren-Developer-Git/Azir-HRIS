import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DocumentsService } from './documents.service.js';
import { CurrentUser, RequirePermission, Public } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateDocumentRequestDto } from './dto/create-document-request.dto.js';
import { DecideDocumentRequestDto } from './dto/decide-document-request.dto.js';

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermission('document.request')
  @Get('document-types')
  async listDocumentTypes(@CurrentUser() user: AuthUser) {
    return this.documentsService.listDocumentTypes(user);
  }

  @RequirePermission('document.request')
  @Post('document-requests')
  @HttpCode(HttpStatus.CREATED)
  async fileRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDocumentRequestDto,
  ) {
    return this.documentsService.fileRequest(user, dto);
  }

  @RequirePermission('document.request')
  @Get('document-requests')
  async listRequests(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'mine' | 'awaiting' | 'all',
  ) {
    return this.documentsService.listRequests(user, scope);
  }

  @RequirePermission('document.request')
  @Get('document-requests/:id')
  async getRequestById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.getRequestById(user, id);
  }

  @RequirePermission('document.request')
  @Get('document-requests/:id/preview')
  async getPreview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.getPreview(user, id);
  }

  @RequirePermission('document.approve')
  @Post('document-requests/:id/decision')
  @HttpCode(HttpStatus.OK)
  async decideRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideDocumentRequestDto,
  ) {
    return this.documentsService.decideRequest(user, id, dto);
  }

  @RequirePermission('document.request')
  @Post('document-requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.documentsService.cancelRequest(user, id);
  }

  @Public()
  @Get('documents/verify/:code')
  async verifyPublicDocument(@Param('code') code: string) {
    return this.documentsService.verifyPublicDocument(code);
  }
}
