import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { PayrollService } from './payroll.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreatePeriodDto } from './dto/create-period.dto.js';
import { CreateRunDto } from './dto/create-run.dto.js';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import { DecideRunDto } from './dto/decide-run.dto.js';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @RequirePermission('payroll.view.all')
  @Get('periods')
  async listPeriods(@CurrentUser() user: AuthUser) {
    return this.payrollService.listPeriods(user);
  }

  @RequirePermission('payroll.manage')
  @Post('periods')
  @HttpCode(HttpStatus.CREATED)
  async createPeriod(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePeriodDto,
  ) {
    return this.payrollService.createPeriod(user, dto);
  }

  @RequirePermission('payroll.view.all')
  @Get('runs')
  async listRuns(@CurrentUser() user: AuthUser) {
    return this.payrollService.listRuns(user);
  }

  @RequirePermission('payroll.manage')
  @Post('runs')
  @HttpCode(HttpStatus.CREATED)
  async createRun(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateRunDto,
  ) {
    return this.payrollService.createRun(user, dto);
  }

  @RequirePermission('payroll.view.all')
  @Get('runs/:id')
  async getRun(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.getRun(user, id);
  }

  @RequirePermission('payroll.view.all')
  @Get('runs/:id/summary')
  async getRunSummary(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.getRunSummary(user, id);
  }

  @RequirePermission('payroll.view.all')
  @Get('runs/:id/export-csv')
  async exportRegisterCsv(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { filename, csv } = await this.payrollService.exportRegisterCsv(user, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  @RequirePermission('payroll.manage')
  @Post('runs/:id/adjustments')
  @HttpCode(HttpStatus.CREATED)
  async addAdjustment(
    @CurrentUser() user: AuthUser,
    @Param('id') runId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.payrollService.addAdjustment(user, runId, dto);
  }

  @RequirePermission('payroll.manage')
  @Delete('runs/:id/adjustments/:adjId')
  async deleteAdjustment(
    @CurrentUser() user: AuthUser,
    @Param('id') runId: string,
    @Param('adjId') adjId: string,
  ) {
    return this.payrollService.deleteAdjustment(user, runId, adjId);
  }

  @RequirePermission('payroll.manage')
  @Post('runs/:id/compute')
  @HttpCode(HttpStatus.OK)
  async computeRun(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.computeRun(user, id);
  }

  @RequirePermission('payroll.approve')
  @Post('runs/:id/decision')
  @HttpCode(HttpStatus.OK)
  async decideRun(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideRunDto,
  ) {
    return this.payrollService.decideRun(user, id, dto);
  }

  @RequirePermission('payroll.view.own')
  @Get('my-payslips')
  async getMyPayslips(@CurrentUser() user: AuthUser) {
    return this.payrollService.getMyPayslips(user);
  }

  @RequirePermission('payroll.view.own')
  @Get('my-payslips/:id')
  async getMyPayslipDetail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.payrollService.getMyPayslipDetail(user, id);
  }
}
