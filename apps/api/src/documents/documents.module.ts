import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { LeaveModule } from '../leave/leave.module.js';

@Module({
  imports: [NotificationsModule, AuditModule, LeaveModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
