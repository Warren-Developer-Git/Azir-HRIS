import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/permissions.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.getDashboard(user);
  }
}
