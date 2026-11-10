import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface LeaveBalanceSummary {
  leaveTypeId: string;
  code: string;
  name: string;
  balance: number;
  pending: number;
  available: number;
}

@Injectable()
export class BalancesService {
  async summary(
    tx: Prisma.TransactionClient,
    tenantId: string,
    employeeId: string,
    year: number,
  ): Promise<LeaveBalanceSummary[]> {
    const yearlyTypes = await tx.leaveType.findMany({
      where: {
        tenantId,
        kind: 'YEARLY',
        active: true,
      },
      orderBy: { code: 'asc' },
    });

    const ledgerEntries = await tx.leaveLedgerEntry.findMany({
      where: {
        tenantId,
        employeeId,
        year,
      },
    });

    const pendingRequests = await tx.leaveRequest.findMany({
      where: {
        tenantId,
        employeeId,
        status: { in: ['PENDING_MANAGER', 'PENDING_HR'] },
      },
    });

    return yearlyTypes.map((type) => {
      const typeEntries = ledgerEntries.filter((e) => e.leaveTypeId === type.id);
      const balance = typeEntries.reduce((acc, curr) => acc + curr.days, 0);

      const typePending = pendingRequests
        .filter((r) => r.leaveTypeId === type.id && r.startDate.getUTCFullYear() === year)
        .reduce((acc, curr) => acc + curr.days, 0);

      return {
        leaveTypeId: type.id,
        code: type.code,
        name: type.name,
        balance,
        pending: typePending,
        available: Math.max(0, balance - typePending),
      };
    });
  }
}
