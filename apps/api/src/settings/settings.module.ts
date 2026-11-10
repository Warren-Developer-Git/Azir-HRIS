import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';
import { LeaveTypesController } from './leave-types.controller.js';
import { LeaveTypesService } from './leave-types.service.js';
import { HolidaysController } from './holidays.controller.js';
import { HolidaysService } from './holidays.service.js';
import { SettingsReadController } from './settings-read.controller.js';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    DepartmentsController,
    LeaveTypesController,
    HolidaysController,
    SettingsReadController,
  ],
  providers: [
    DepartmentsService,
    LeaveTypesService,
    HolidaysService,
  ],
  exports: [
    DepartmentsService,
    LeaveTypesService,
    HolidaysService,
  ],
})
export class SettingsModule {}
