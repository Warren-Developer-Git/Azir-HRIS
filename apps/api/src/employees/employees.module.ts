import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller.js';
import { ProfileController } from './profile.controller.js';
import { EmployeesService } from './employees.service.js';
import { AuditService } from '../audit/audit.service.js';
import { LeaveModule } from '../leave/leave.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [LeaveModule, StorageModule],
  controllers: [EmployeesController, ProfileController],
  providers: [EmployeesService, AuditService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
