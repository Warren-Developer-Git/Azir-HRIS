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
import { AttendanceService } from './attendance.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { PunchDto } from './dto/punch.dto.js';
import { CreateCorrectionDto } from './dto/create-correction.dto.js';
import { DecideCorrectionDto } from './dto/decide-correction.dto.js';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @RequirePermission('attendance.punch')
  @Post('punch')
  @HttpCode(HttpStatus.OK)
  async punch(
    @CurrentUser() user: AuthUser,
    @Body() dto: PunchDto,
  ) {
    return this.attendanceService.punch(user, dto);
  }

  @RequirePermission('attendance.view.own')
  @Get('today')
  async getToday(@CurrentUser() user: AuthUser) {
    return this.attendanceService.getToday(user);
  }

  @RequirePermission('attendance.view.own')
  @Get('my-dtr')
  async getMyDtr(
    @CurrentUser() user: AuthUser,
    @Query('month') month?: string,
  ) {
    return this.attendanceService.getMyDtr(user, month);
  }

  @RequirePermission('attendance.approve')
  @Get('team-dtr')
  async getTeamDtr(
    @CurrentUser() user: AuthUser,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getTeamDtr(user, date);
  }

  @RequirePermission('attendance.correct')
  @Post('corrections')
  @HttpCode(HttpStatus.CREATED)
  async fileCorrection(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCorrectionDto,
  ) {
    return this.attendanceService.fileCorrection(user, dto);
  }

  @RequirePermission('attendance.view.own')
  @Get('corrections')
  async listCorrections(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'mine' | 'awaiting' | 'all',
  ) {
    return this.attendanceService.listCorrections(user, scope);
  }

  @RequirePermission('attendance.approve')
  @Post('corrections/:id/decision')
  @HttpCode(HttpStatus.OK)
  async decideCorrection(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideCorrectionDto,
  ) {
    return this.attendanceService.decideCorrection(user, id, dto);
  }
}
