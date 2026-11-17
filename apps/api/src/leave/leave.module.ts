import { Module } from '@nestjs/common';
import { LeaveRequestsController } from './leave-requests.controller.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { BalancesService } from './balances.service.js';
import { Clock } from './clock.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [NotificationsModule, StorageModule],
  controllers: [LeaveRequestsController],
  providers: [LeaveRequestsService, BalancesService, Clock, AuditService],
  exports: [LeaveRequestsService, BalancesService, Clock, AuditService],
})
export class LeaveModule {}
