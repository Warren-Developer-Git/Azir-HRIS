import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { HealthController } from './health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { LeaveModule } from './leave/leave.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { AuditModule } from './audit/audit.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { AttendanceModule } from './attendance/attendance.module.js';
import { StorageModule } from './storage/storage.module.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PermissionsGuard } from './auth/permissions.guard.js';
import { RequestLoggerMiddleware } from './common/request-logger.middleware.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    LeaveModule,
    NotificationsModule,
    EmployeesModule,
    AuditModule,
    SettingsModule,
    DashboardModule,
    DocumentsModule,
    PayrollModule,
    AttendanceModule,
    StorageModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
