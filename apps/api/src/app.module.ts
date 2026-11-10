import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LeaveModule } from './leave/leave.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { AuditModule } from './audit/audit.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';

@Module({
  imports: [PrismaModule, AuthModule, LeaveModule, NotificationsModule, EmployeesModule, AuditModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
