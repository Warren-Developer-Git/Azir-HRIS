import { Controller, Get, Patch, Body } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Controller('me')
export class ProfileController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthUser) {
    return this.employeesService.getProfile(user);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.employeesService.updateProfile(user, dto);
  }
}
