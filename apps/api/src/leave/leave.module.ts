import { Module } from '@nestjs/common';
import { LeaveRequestsController } from './leave-requests.controller.js';
import { LeaveRequestsService } from './leave-requests.service.js';
import { BalancesService } from './balances.service.js';
import { Clock } from './clock.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsReadController } from '../settings/settings-read.controller.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [LeaveRequestsController, SettingsReadController],
  providers: [LeaveRequestsService, BalancesService, Clock, AuditService],
  exports: [LeaveRequestsService, BalancesService, Clock, AuditService],
})
export class LeaveModule {}
