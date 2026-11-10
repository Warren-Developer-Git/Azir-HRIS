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
import { DepartmentsService } from './departments.service.js';
import { CurrentUser, RequirePermission } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { UpdateDepartmentDto } from './dto/update-department.dto.js';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @RequirePermission('department.write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDepartment(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.departmentsService.createDepartment(user, dto);
  }

  @RequirePermission('department.write')
  @Patch(':id')
  async updateDepartment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.departmentsService.updateDepartment(user, id, dto);
  }

  @RequirePermission('department.write')
  @Delete(':id')
  async deleteDepartment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    return this.departmentsService.deleteDepartment(user, id);
  }
}
