import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { HolidaysService } from './holidays.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateHolidayDto } from './dto/create-holiday.dto.js';
import { UpdateHolidayDto } from './dto/update-holiday.dto.js';
import { SyncHolidaysDto } from './dto/sync-holidays.dto.js';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @RequirePermission('holiday.write')
  @Get('external-preview')
  async previewExternalHolidays(@Query() dto: SyncHolidaysDto) {
    return this.holidaysService.previewExternalHolidays(dto);
  }

  @RequirePermission('holiday.write')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncFromExternalApi(
    @CurrentUser() user: AuthUser,
    @Body() dto: SyncHolidaysDto,
  ) {
    return this.holidaysService.syncFromExternalApi(user, dto);
  }

  @RequirePermission('holiday.write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createHoliday(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHolidayDto,
  ) {
    return this.holidaysService.createHoliday(user, dto);
  }

  @RequirePermission('holiday.write')
  @Patch(':id')
  async updateHoliday(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.holidaysService.updateHoliday(user, id, dto);
  }

  @RequirePermission('holiday.write')
  @Delete(':id')
  async deleteHoliday(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.holidaysService.deleteHoliday(user, id);
  }
}
