import {
  Controller,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateHolidayDto } from './dto/create-holiday.dto.js';
import { UpdateHolidayDto } from './dto/update-holiday.dto.js';

@Controller('holidays')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

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
