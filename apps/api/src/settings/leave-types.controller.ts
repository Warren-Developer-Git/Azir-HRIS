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
import { LeaveTypesService } from './leave-types.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto.js';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto.js';

@Controller('leave-types')
export class LeaveTypesController {
  constructor(private readonly leaveTypesService: LeaveTypesService) {}

  @RequirePermission('leaveType.write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLeaveType(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveTypesService.createLeaveType(user, dto);
  }

  @RequirePermission('leaveType.write')
  @Patch(':id')
  async updateLeaveType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveTypesService.updateLeaveType(user, id, dto);
  }

  @RequirePermission('leaveType.write')
  @Delete(':id')
  async deleteLeaveType(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.leaveTypesService.deleteLeaveType(user, id);
  }
}
