import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { SendEmailDto } from './dto/send-email.dto.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUserNotifications(user);
  }

  @RequirePermission('email.send', 'email.send_team')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('send-email')
  @HttpCode(HttpStatus.OK)
  async sendManualEmail(
    @CurrentUser() user: AuthUser,
    @Body() dto: SendEmailDto,
  ) {
    return this.notificationsService.sendManualEmail(user, dto);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.notificationsService.markAsRead(user, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user);
  }
}
