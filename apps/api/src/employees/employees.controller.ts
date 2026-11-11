import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { SetRolesDto } from './dto/set-roles.dto.js';
import { CreateBalanceAdjustmentDto } from './dto/create-balance-adjustment.dto.js';
import { BalancesService } from '../leave/balances.service.js';
import { EmployeeStatus } from '@prisma/client';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly balancesService: BalancesService,
  ) {}

  @Get()
  async listEmployees(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('scope') scope?: 'all' | 'team',
    @Query('status') status?: EmployeeStatus,
    @Query('departmentId') departmentId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.employeesService.listEmployees(user, {
      search,
      scope,
      status,
      departmentId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @RequirePermission('employee.write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createEmployee(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.createEmployee(user, dto);
  }

  @Get(':id')
  async getEmployeeById(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.employeesService.getEmployeeById(user, id);
  }

  @RequirePermission('employee.write')
  @Patch(':id')
  async updateEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.updateEmployee(user, id, dto);
  }

  @RequirePermission('employee.write')
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateEmployee(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.employeesService.deactivateEmployee(user, id);
  }

  @RequirePermission('role.assign')
  @Put(':id/roles')
  async setRoles(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetRolesDto,
  ) {
    return this.employeesService.setRoles(user, id, dto);
  }

  @RequirePermission('employee.write')
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.employeesService.resetPassword(user, id);
  }

  @Get(':id/balances')
  async getEmployeeBalances(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('year') yearStr?: string,
  ) {
    const year = yearStr ? parseInt(yearStr, 10) : undefined;
    return this.balancesService.getEmployeeBalances(user, id, year);
  }

  @RequirePermission('balance.adjust')
  @Post(':id/balance-adjustments')
  @HttpCode(HttpStatus.CREATED)
  async adjustBalance(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateBalanceAdjustmentDto,
  ) {
    return this.balancesService.adjustBalance(user, id, dto);
  }
}
