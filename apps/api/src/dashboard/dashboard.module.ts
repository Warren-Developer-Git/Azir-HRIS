import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LeaveModule } from '../leave/leave.module.js';

@Module({
  imports: [PrismaModule, LeaveModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
