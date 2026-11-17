import path from 'node:path';
import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser, Public } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { StorageService } from './storage.service.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AVATAR_FILE_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('status')
  getStatus() {
    return { provider: this.storageService.getProviderMode() };
  }

  @Get('download')
  async downloadProtectedFile(
    @CurrentUser() user: AuthUser,
    @Query('key') key: string,
    @Query('name') fileName: string | undefined,
    @Res() res: Response,
  ) {
    const cleanKey = key?.trim();
    if (!cleanKey) {
      throw new BadRequestException('key query parameter is required');
    }

    const expectedPrefix = `tenants/${user.tenantId}/`;
    if (!cleanKey.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Access denied for this storage object');
    }

    const { buffer, contentType } = await this.storageService.readObject(cleanKey);
    const fallbackName = path.posix.basename(cleanKey);
    const safeName = (fileName?.trim() || fallbackName).replaceAll(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeName}"`,
    );
    return res.send(buffer);
  }

  @Public()
  @Get('public/:tenantId/avatars/:filename')
  async servePublicAvatar(
    @Param('tenantId') tenantId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    if (!UUID_REGEX.test(tenantId) || !AVATAR_FILE_REGEX.test(filename)) {
      throw new BadRequestException('Invalid avatar path');
    }

    const key = `public/${tenantId}/avatars/${filename}`;
    const { buffer, contentType } = await this.storageService.readObject(key);

    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  }
}
