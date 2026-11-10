import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service.js';
import { BalancesService } from './balances.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto.js';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto.js';
import { DecideLeaveRequestDto } from './dto/decide-leave-request.dto.js';

@Controller('leave')
export class LeaveRequestsController {
  constructor(
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly balancesService: BalancesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('balances')
  async getBalances(
    @CurrentUser() user: AuthUser,
    @Query('year') yearStr?: string,
  ) {
    const year = yearStr ? parseInt(yearStr, 10) : new Date().getUTCFullYear();
    return this.prisma.withTenant(user.tenantId, (tx) =>
      this.balancesService.summary(tx, user.tenantId, user.employeeId, year),
    );
  }

  @RequirePermission('leave.file')
  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  async fileRequest(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveRequestsService.fileRequest(user, dto);
  }

  @Get('requests')
  async listRequests(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope?: 'mine' | 'awaiting' | 'all',
    @Query('status') status?: string,
  ) {
    return this.leaveRequestsService.listRequests(user, scope, status);
  }

  @Get('requests/:id')
  async getRequestById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.getRequestById(user, id);
  }

  @Patch('requests/:id')
  async editRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
  ) {
    return this.leaveRequestsService.editRequest(user, id, dto);
  }

  @Post('requests/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.cancelRequest(user, id);
  }

  @RequirePermission('leave.approve.manager', 'leave.approve.hr')
  @Post('requests/:id/decision')
  @HttpCode(HttpStatus.OK)
  async decideRequest(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideLeaveRequestDto,
  ) {
    return this.leaveRequestsService.decideRequest(user, id, dto);
  }
}
