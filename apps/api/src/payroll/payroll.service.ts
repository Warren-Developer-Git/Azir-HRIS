import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AuthUser, hasPermission } from '../auth/permissions.js';
import { CreatePeriodDto } from './dto/create-period.dto.js';
import { CreateRunDto } from './dto/create-run.dto.js';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto.js';
import { DecideRunDto } from './dto/decide-run.dto.js';
import {
  computeSemiMonthlyPayroll,
  calculateDailyRate,
  calculateHourlyRate,
  calculateOvertimePay,
  round,
} from './payroll-calculator.js';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listPeriods(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.payrollPeriod.findMany({
        where: { tenantId: user.tenantId },
        orderBy: { startDate: 'desc' },
        include: {
          _count: {
            select: { payrollRuns: true },
          },
        },
      });
    });
  }

  async createPeriod(user: AuthUser, dto: CreatePeriodDto) {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const payDate = new Date(dto.payDate);

    if (endDate < startDate) {
      throw new BadRequestException('End date cannot be earlier than start date');
    }

    let workingDays = dto.workingDays;
    if (!workingDays || workingDays <= 0) {
      let count = 0;
      const cur = new Date(startDate);
      while (cur <= endDate) {
        const day = cur.getDay();
        if (day !== 0 && day !== 6) count++;
        cur.setDate(cur.getDate() + 1);
      }
      workingDays = count || 11;
    }

    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const existing = await tx.payrollPeriod.findUnique({
        where: {
          tenantId_startDate_endDate: {
            tenantId: user.tenantId,
            startDate,
            endDate,
          },
        },
      });
      if (existing) {
        throw new ConflictException('A payroll period with these dates already exists');
      }

      const period = await tx.payrollPeriod.create({
        data: {
          tenantId: user.tenantId,
          name: dto.name,
          cutoffType: dto.cutoffType || 'FIRST_HALF',
          startDate,
          endDate,
          payDate,
          workingDays,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'PayrollPeriod',
        entityId: period.id,
        after: { name: period.name, startDate: dto.startDate, endDate: dto.endDate },
      });

      return period;
    });
  }

  async listRuns(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      return tx.payrollRun.findMany({
        where: { tenantId: user.tenantId },
        include: {
          payrollPeriod: true,
          preparedBy: {
            select: { id: true, firstName: true, lastName: true, employeeNo: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true, employeeNo: true },
          },
          _count: {
            select: { items: true, adjustments: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  async getRun(user: AuthUser, id: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          payrollPeriod: true,
          preparedBy: {
            select: { id: true, firstName: true, lastName: true, employeeNo: true },
          },
          approvedBy: {
            select: { id: true, firstName: true, lastName: true, employeeNo: true },
          },
          adjustments: {
            include: {
              employee: {
                select: { id: true, firstName: true, lastName: true, employeeNo: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          items: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeNo: true,
                  position: true,
                  department: { select: { id: true, name: true } },
                },
              },
              lines: {
                orderBy: { id: 'asc' },
              },
            },
            orderBy: {
              employee: { lastName: 'asc' },
            },
          },
        },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      return run;
    });
  }

  async getRunSummary(user: AuthUser, id: string) {
    const run = await this.getRun(user, id);

    let totalBasic = 0;
    let totalAllowances = 0;
    let totalOvertime = 0;
    let totalAbsences = 0;
    let totalGross = 0;
    let totalNet = 0;

    let sssEe = 0;
    let sssEr = 0;
    let philHealthEe = 0;
    let philHealthEr = 0;
    let pagIbigEe = 0;
    let pagIbigEr = 0;
    let withholdingTax = 0;
    let otherDeductions = 0;
    let totalEmployeeDeductions = 0;

    for (const item of run.items) {
      totalBasic = round(totalBasic + Number(item.basicPay), 2);
      totalAllowances = round(totalAllowances + Number(item.allowances), 2);
      totalOvertime = round(totalOvertime + Number(item.overtimePay), 2);
      totalAbsences = round(totalAbsences + Number(item.absencesDeduction), 2);
      totalGross = round(totalGross + Number(item.grossPay), 2);
      totalNet = round(totalNet + Number(item.netPay), 2);

      sssEe = round(sssEe + Number(item.sssEe), 2);
      sssEr = round(sssEr + Number(item.sssEr), 2);
      philHealthEe = round(philHealthEe + Number(item.philHealthEe), 2);
      philHealthEr = round(philHealthEr + Number(item.philHealthEr), 2);
      pagIbigEe = round(pagIbigEe + Number(item.pagIbigEe), 2);
      pagIbigEr = round(pagIbigEr + Number(item.pagIbigEr), 2);
      withholdingTax = round(withholdingTax + Number(item.withholdingTax), 2);
      otherDeductions = round(otherDeductions + Number(item.otherDeductions), 2);
      totalEmployeeDeductions = round(
        totalEmployeeDeductions + (Number(item.grossPay) - Number(item.netPay)),
        2,
      );
    }

    const sssTotal = round(sssEe + sssEr, 2);
    const philHealthTotal = round(philHealthEe + philHealthEr, 2);
    const pagIbigTotal = round(pagIbigEe + pagIbigEr, 2);
    const totalEmployeeShare = round(
      sssEe + philHealthEe + pagIbigEe + withholdingTax + otherDeductions,
      2,
    );
    const totalEmployerShare = round(sssEr + philHealthEr + pagIbigEr, 2);
    const grandTotalRemittance = round(
      sssTotal + philHealthTotal + pagIbigTotal + withholdingTax,
      2,
    );

    return {
      runId: run.id,
      runNumber: run.runNumber,
      status: run.status,
      periodName: run.payrollPeriod.name,
      cutoffType: run.payrollPeriod.cutoffType,
      startDate: run.payrollPeriod.startDate,
      endDate: run.payrollPeriod.endDate,
      payDate: run.payrollPeriod.payDate,
      headcount: run.items.length,
      grandTotals: {
        basicPay: totalBasic,
        allowances: totalAllowances,
        overtimePay: totalOvertime,
        absencesDeduction: totalAbsences,
        grossPay: totalGross,
        employeeDeductions: totalEmployeeDeductions,
        netDisbursement: totalNet,
      },
      statutoryRemittances: {
        sss: {
          employeeShare: sssEe,
          employerShare: sssEr,
          total: sssTotal,
        },
        philHealth: {
          employeeShare: philHealthEe,
          employerShare: philHealthEr,
          total: philHealthTotal,
        },
        pagIbig: {
          employeeShare: pagIbigEe,
          employerShare: pagIbigEr,
          total: pagIbigTotal,
        },
        birTax: {
          withholdingTax,
          total: withholdingTax,
        },
        totalEmployeeShare,
        totalEmployerShare,
        grandTotalRemittance,
      },
      preparedBy: run.preparedBy
        ? {
            name: `${run.preparedBy.firstName} ${run.preparedBy.lastName}`,
            employeeNo: run.preparedBy.employeeNo,
          }
        : null,
      approvedBy: run.approvedBy
        ? {
            name: `${run.approvedBy.firstName} ${run.approvedBy.lastName}`,
            employeeNo: run.approvedBy.employeeNo,
          }
        : null,
    };
  }

  async exportRegisterCsv(
    user: AuthUser,
    id: string,
  ): Promise<{ filename: string; csv: string }> {
    const run = await this.getRun(user, id);

    const headers = [
      'Employee No',
      'Employee Name',
      'Department',
      'Position',
      'Basic Salary',
      'Allowances',
      'Overtime Pay',
      'Absences / Tardiness',
      'Gross Pay',
      'SSS (EE)',
      'SSS (ER)',
      'PhilHealth (EE)',
      'PhilHealth (ER)',
      'Pag-IBIG (EE)',
      'Pag-IBIG (ER)',
      'Withholding Tax',
      'Other Deductions',
      'Total Deductions',
      'Net Pay',
    ];

    let sumBasic = 0;
    let sumAllowances = 0;
    let sumOvertime = 0;
    let sumAbsences = 0;
    let sumGross = 0;
    let sumSssEe = 0;
    let sumSssEr = 0;
    let sumPhEe = 0;
    let sumPhEr = 0;
    let sumPiEe = 0;
    let sumPiEr = 0;
    let sumTax = 0;
    let sumOther = 0;
    let sumTotalDed = 0;
    let sumNet = 0;

    const escapeCsv = (val: any) => {
      const str = String(val ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows: string[] = [];
    rows.push(headers.join(','));

    for (const item of run.items) {
      const basic = Number(item.basicPay);
      const allowances = Number(item.allowances);
      const overtime = Number(item.overtimePay);
      const absences = Number(item.absencesDeduction);
      const gross = Number(item.grossPay);
      const sssEe = Number(item.sssEe);
      const sssEr = Number(item.sssEr);
      const phEe = Number(item.philHealthEe);
      const phEr = Number(item.philHealthEr);
      const piEe = Number(item.pagIbigEe);
      const piEr = Number(item.pagIbigEr);
      const tax = Number(item.withholdingTax);
      const other = Number(item.otherDeductions);
      const totalDed = round(gross - Number(item.netPay), 2);
      const net = Number(item.netPay);

      sumBasic = round(sumBasic + basic, 2);
      sumAllowances = round(sumAllowances + allowances, 2);
      sumOvertime = round(sumOvertime + overtime, 2);
      sumAbsences = round(sumAbsences + absences, 2);
      sumGross = round(sumGross + gross, 2);
      sumSssEe = round(sumSssEe + sssEe, 2);
      sumSssEr = round(sumSssEr + sssEr, 2);
      sumPhEe = round(sumPhEe + phEe, 2);
      sumPhEr = round(sumPhEr + phEr, 2);
      sumPiEe = round(sumPiEe + piEe, 2);
      sumPiEr = round(sumPiEr + piEr, 2);
      sumTax = round(sumTax + tax, 2);
      sumOther = round(sumOther + other, 2);
      sumTotalDed = round(sumTotalDed + totalDed, 2);
      sumNet = round(sumNet + net, 2);

      const empName = `${item.employee.lastName}, ${item.employee.firstName}`;
      const deptName = item.employee.department?.name || 'General';

      rows.push(
        [
          escapeCsv(item.employee.employeeNo),
          escapeCsv(empName),
          escapeCsv(deptName),
          escapeCsv(item.employee.position),
          basic.toFixed(2),
          allowances.toFixed(2),
          overtime.toFixed(2),
          absences.toFixed(2),
          gross.toFixed(2),
          sssEe.toFixed(2),
          sssEr.toFixed(2),
          phEe.toFixed(2),
          phEr.toFixed(2),
          piEe.toFixed(2),
          piEr.toFixed(2),
          tax.toFixed(2),
          other.toFixed(2),
          totalDed.toFixed(2),
          net.toFixed(2),
        ].join(','),
      );
    }

    // Totals row
    rows.push(
      [
        'TOTALS',
        '',
        '',
        '',
        sumBasic.toFixed(2),
        sumAllowances.toFixed(2),
        sumOvertime.toFixed(2),
        sumAbsences.toFixed(2),
        sumGross.toFixed(2),
        sumSssEe.toFixed(2),
        sumSssEr.toFixed(2),
        sumPhEe.toFixed(2),
        sumPhEr.toFixed(2),
        sumPiEe.toFixed(2),
        sumPiEr.toFixed(2),
        sumTax.toFixed(2),
        sumOther.toFixed(2),
        sumTotalDed.toFixed(2),
        sumNet.toFixed(2),
      ].join(','),
    );

    const filename = `payroll-register-${run.runNumber}.csv`;
    return {
      filename,
      csv: rows.join('\r\n'),
    };
  }

  async createRun(user: AuthUser, dto: CreateRunDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const period = await tx.payrollPeriod.findFirst({
        where: { id: dto.payrollPeriodId, tenantId: user.tenantId },
      });
      if (!period) {
        throw new NotFoundException('Payroll period not found');
      }

      const existing = await tx.payrollRun.findUnique({
        where: {
          tenantId_runNumber: {
            tenantId: user.tenantId,
            runNumber: dto.runNumber,
          },
        },
      });
      if (existing) {
        throw new ConflictException(`Run number "${dto.runNumber}" is already in use`);
      }

      const run = await tx.payrollRun.create({
        data: {
          tenantId: user.tenantId,
          payrollPeriodId: dto.payrollPeriodId,
          runNumber: dto.runNumber,
          status: 'DRAFT',
          preparedById: user.employeeId,
        },
        include: {
          payrollPeriod: true,
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'create',
        entity: 'PayrollRun',
        entityId: run.id,
        after: { runNumber: run.runNumber, periodId: period.id },
      });

      return run;
    });
  }

  async addAdjustment(user: AuthUser, runId: string, dto: CreateAdjustmentDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, tenantId: user.tenantId },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      if (run.status === 'LOCKED' || run.status === 'APPROVED' || run.status === 'PAID') {
        throw new BadRequestException('Cannot add adjustments to an approved or locked payroll run');
      }

      const employee = await tx.employee.findFirst({
        where: { id: dto.employeeId, tenantId: user.tenantId },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found');
      }

      let amount = dto.amount || 0;
      if (dto.type === 'OVERTIME_HOURS') {
        const basicSalary = Number(employee.basicSalary) || 30000;
        const dailyRate = calculateDailyRate(basicSalary);
        const hourlyRate = calculateHourlyRate(dailyRate);
        amount = calculateOvertimePay(hourlyRate, dto.quantity || 0, 1.25);
      }

      const adj = await tx.payrollAdjustment.create({
        data: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          employeeId: dto.employeeId,
          type: dto.type,
          description: dto.description,
          amount,
          quantity: dto.quantity !== undefined ? dto.quantity : null,
        },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNo: true },
          },
        },
      });

      return adj;
    });
  }

  async deleteAdjustment(user: AuthUser, runId: string, adjId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, tenantId: user.tenantId },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      if (run.status === 'LOCKED' || run.status === 'APPROVED' || run.status === 'PAID') {
        throw new BadRequestException('Cannot modify adjustments on a locked payroll run');
      }

      const adj = await tx.payrollAdjustment.findFirst({
        where: { id: adjId, payrollRunId: runId, tenantId: user.tenantId },
      });
      if (!adj) {
        throw new NotFoundException('Adjustment not found');
      }

      await tx.payrollAdjustment.delete({
        where: { id: adjId },
      });

      return { success: true };
    });
  }

  async computeRun(user: AuthUser, runId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, tenantId: user.tenantId },
        include: {
          payrollPeriod: true,
          adjustments: true,
        },
      });
      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      if (run.status === 'LOCKED' || run.status === 'APPROVED' || run.status === 'PAID') {
        throw new BadRequestException('Cannot recompute a locked payroll run');
      }

      const employees = await tx.employee.findMany({
        where: {
          tenantId: user.tenantId,
          status: 'ACTIVE',
        },
        include: {
          department: true,
        },
        orderBy: { lastName: 'asc' },
      });

      if (employees.length === 0) {
        throw new BadRequestException('No active employees found in tenant');
      }

      // Delete existing payroll items for this run if any
      await tx.payrollItem.deleteMany({
        where: { payrollRunId: runId, tenantId: user.tenantId },
      });

      let runTotalGross = 0;
      let runTotalDeductions = 0;
      let runTotalNet = 0;
      let runTotalEeContributions = 0;
      let runTotalErContributions = 0;

      for (const emp of employees) {
        const basicSalary = Number(emp.basicSalary) || 30000;
        const allowances = Number(emp.allowances) || 2000;

        const empAdjustments = run.adjustments.filter((a) => a.employeeId === emp.id);

        let overtimeHours = 0;
        let bonus = 0;
        let manualDeduction = 0;

        for (const adj of empAdjustments) {
          if (adj.type === 'OVERTIME_HOURS') {
            overtimeHours += Number(adj.quantity) || 0;
          } else if (adj.type === 'BONUS' || adj.type === 'ALLOWANCE') {
            bonus += Number(adj.amount) || 0;
          } else if (adj.type === 'DEDUCTION') {
            manualDeduction += Number(adj.amount) || 0;
          }
        }

        const unpaidLeaves = await tx.leaveRequest.findMany({
          where: {
            tenantId: user.tenantId,
            employeeId: emp.id,
            status: 'APPROVED',
            leaveType: {
              code: { in: ['UNPAID', 'LWOP'] },
            },
            startDate: { lte: run.payrollPeriod.endDate },
            endDate: { gte: run.payrollPeriod.startDate },
          },
        });

        const unpaidLeaveDays = unpaidLeaves.reduce((acc, l) => acc + (l.days || 0), 0);

        // Fetch attendance records in this payroll period
        const attendanceRecords = await tx.attendanceRecord.findMany({
          where: {
            tenantId: user.tenantId,
            employeeId: emp.id,
            date: {
              gte: run.payrollPeriod.startDate,
              lte: run.payrollPeriod.endDate,
            },
          },
        });

        let tardinessMinutes = 0;
        let unexcusedAbsentDays = 0;

        for (const att of attendanceRecords) {
          // If approved Official Business (OB) or approved leave, zero penalty
          if (
            att.status === 'OFFICIAL_BUSINESS' ||
            att.status === 'ON_LEAVE' ||
            att.status === 'HOLIDAY' ||
            att.status === 'REST_DAY'
          ) {
            continue;
          }
          tardinessMinutes += (att.lateMinutes || 0) + (att.undertimeMinutes || 0);
          if (att.status === 'ABSENT') {
            unexcusedAbsentDays += 1;
          }
        }

        const totalUnpaidDays = unpaidLeaveDays + unexcusedAbsentDays;

        const result = computeSemiMonthlyPayroll({
          basicSalary,
          allowances,
          unpaidLeaveDays: totalUnpaidDays,
          tardinessMinutes,
          overtimeHours,
          bonus,
          manualDeduction,
        });

        runTotalGross += result.grossPay;
        runTotalDeductions += result.totalDeductions;
        runTotalNet += result.netPay;
        runTotalEeContributions += (result.sssEe + result.philHealthEe + result.pagIbigEe);
        runTotalErContributions += (result.sssEr + result.philHealthEr + result.pagIbigEr);

        const item = await tx.payrollItem.create({
          data: {
            tenantId: user.tenantId,
            payrollRunId: runId,
            employeeId: emp.id,
            basicPay: result.basicPay,
            allowances: result.allowances,
            overtimePay: result.overtimePay,
            absencesDeduction: result.absencesDeduction,
            grossPay: result.grossPay,
            sssEe: result.sssEe,
            sssEr: result.sssEr,
            philHealthEe: result.philHealthEe,
            philHealthEr: result.philHealthEr,
            pagIbigEe: result.pagIbigEe,
            pagIbigEr: result.pagIbigEr,
            withholdingTax: result.withholdingTax,
            otherDeductions: result.manualDeduction,
            netPay: result.netPay,
          },
        });

        if (result.lines.length > 0) {
          await tx.payrollItemLine.createMany({
            data: result.lines.map((ln) => ({
              tenantId: user.tenantId,
              payrollItemId: item.id,
              category: ln.category,
              code: ln.code,
              description: ln.description,
              amount: ln.amount,
              rate: ln.rate !== undefined ? ln.rate : null,
              quantity: ln.quantity !== undefined ? ln.quantity : null,
            })),
          });
        }
      }

      const updatedRun = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'COMPUTED',
          totalGross: round(runTotalGross, 2),
          totalDeductions: round(runTotalDeductions, 2),
          totalNet: round(runTotalNet, 2),
          totalEmployeeContributions: round(runTotalEeContributions, 2),
          totalEmployerContributions: round(runTotalErContributions, 2),
        },
        include: {
          payrollPeriod: true,
          items: {
            include: {
              employee: true,
              lines: true,
            },
          },
        },
      });

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'compute',
        entity: 'PayrollRun',
        entityId: runId,
        after: {
          status: 'COMPUTED',
          totalGross: Number(updatedRun.totalGross),
          totalNet: Number(updatedRun.totalNet),
        },
      });

      return updatedRun;
    });
  }

  async decideRun(user: AuthUser, runId: string, dto: DecideRunDto) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const run = await tx.payrollRun.findFirst({
        where: { id: runId, tenantId: user.tenantId },
        include: {
          payrollPeriod: true,
          items: {
            include: {
              employee: {
                include: { department: true },
              },
              lines: true,
            },
          },
        },
      });

      if (!run) {
        throw new NotFoundException('Payroll run not found');
      }
      if (run.status === 'LOCKED') {
        throw new BadRequestException('Payroll run is already approved and locked');
      }

      if (dto.action === 'REJECT') {
        return tx.payrollRun.update({
          where: { id: runId },
          data: { status: 'DRAFT' },
        });
      }

      if (run.status !== 'COMPUTED') {
        throw new BadRequestException('Run must be computed before it can be approved');
      }

      // Separation of duties / Anti-self approval
      if (run.preparedById === user.employeeId) {
        const otherHrOrAdmin = await tx.user.findFirst({
          where: {
            tenantId: user.tenantId,
            active: true,
            roles: { hasSome: ['HR', 'ADMIN'] },
            employee: { id: { not: user.employeeId } },
          },
        });
        if (otherHrOrAdmin) {
          throw new BadRequestException('A user cannot approve a payroll run they prepared when other authorized HR/Admin personnel exist.');
        }
      }

      const now = new Date();
      const year = now.getFullYear();

      let payslipDocType = await tx.documentType.findFirst({
        where: { tenantId: user.tenantId, code: 'PAYSLIP' },
      });
      if (!payslipDocType) {
        payslipDocType = await tx.documentType.create({
          data: {
            tenantId: user.tenantId,
            code: 'PAYSLIP',
            name: 'Official Certified Payslip',
            description: 'Official verified payslip with QR code',
            requiresApproval: true,
            includesSalary: true,
            slaDays: 3,
          },
        });
      }

      // Lock run
      const updatedRun = await tx.payrollRun.update({
        where: { id: runId },
        data: {
          status: 'LOCKED',
          approvedById: user.employeeId,
          approvedAt: now,
          lockedAt: now,
        },
      });

      // Auto-generate official signed IssuedDocuments
      for (const item of run.items) {
        const count = await tx.issuedDocument.count({
          where: { tenantId: user.tenantId },
        });
        const documentNo = `AZIR-PS-${year}-${String(count + 1).padStart(4, '0')}`;
        const verificationCode = crypto.randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();

        const docReq = await tx.documentRequest.create({
          data: {
            tenantId: user.tenantId,
            employeeId: item.employeeId,
            documentTypeId: payslipDocType.id,
            purpose: `Official Payslip for ${run.payrollPeriod.name}`,
            payPeriod: run.payrollPeriod.name,
            status: 'APPROVED',
            dueAt: now,
            reviewedById: user.employeeId,
            reviewedAt: now,
          },
        });

        const snapshotData = {
          organization: 'Azir Company Global Tech',
          documentNo,
          verificationCode,
          documentTypeCode: 'PAYSLIP',
          documentTypeName: 'Official Certified Payslip',
          purpose: docReq.purpose,
          payPeriod: run.payrollPeriod.name,
          period: {
            startDate: run.payrollPeriod.startDate.toISOString().slice(0, 10),
            endDate: run.payrollPeriod.endDate.toISOString().slice(0, 10),
            payDate: run.payrollPeriod.payDate.toISOString().slice(0, 10),
          },
          employee: {
            id: item.employee.id,
            firstName: item.employee.firstName,
            lastName: item.employee.lastName,
            employeeNo: item.employee.employeeNo,
            position: item.employee.position,
            department: item.employee.department?.name || 'General',
            hireDate: item.employee.hireDate.toISOString().slice(0, 10),
          },
          payroll: {
            basicPay: Number(item.basicPay),
            allowances: Number(item.allowances),
            overtimePay: Number(item.overtimePay),
            absencesDeduction: Number(item.absencesDeduction),
            grossPay: Number(item.grossPay),
            sssEe: Number(item.sssEe),
            sssEr: Number(item.sssEr),
            philHealthEe: Number(item.philHealthEe),
            philHealthEr: Number(item.philHealthEr),
            pagIbigEe: Number(item.pagIbigEe),
            pagIbigEr: Number(item.pagIbigEr),
            withholdingTax: Number(item.withholdingTax),
            otherDeductions: Number(item.otherDeductions),
            netPay: Number(item.netPay),
            lines: item.lines.map((l) => ({
              category: l.category,
              code: l.code,
              description: l.description,
              amount: Number(l.amount),
              rate: l.rate ? Number(l.rate) : null,
              quantity: l.quantity ? Number(l.quantity) : null,
            })),
          },
          issuedBy: {
            id: user.employeeId,
            decidedAt: now.toISOString(),
          },
        };

        const issuedDoc = await tx.issuedDocument.create({
          data: {
            tenantId: user.tenantId,
            requestId: docReq.id,
            documentNo,
            verificationCode,
            snapshotData: snapshotData as any,
            issuedAt: now,
            issuedById: user.employeeId,
            status: 'VALID',
          },
        });

        await tx.payrollItem.update({
          where: { id: item.id },
          data: { issuedDocumentId: issuedDoc.id },
        });

        if (item.employee.userId) {
          await this.notificationsService.notify(tx, {
            tenantId: user.tenantId,
            recipientUserIds: [item.employee.userId],
            message: `Your official payslip for ${run.payrollPeriod.name} has been published (${documentNo}).`,
            link: `/payroll?tab=my-payslips&id=${item.id}`,
          });
        }
      }

      await this.auditService.record(tx, {
        tenantId: user.tenantId,
        actorId: user.userId,
        action: 'approve_and_lock',
        entity: 'PayrollRun',
        entityId: runId,
        after: { status: 'LOCKED', approvedById: user.employeeId },
      });

      return updatedRun;
    });
  }

  async getMyPayslips(user: AuthUser) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const items = await tx.payrollItem.findMany({
        where: {
          tenantId: user.tenantId,
          employeeId: user.employeeId,
          payrollRun: {
            status: 'LOCKED',
          },
        },
        include: {
          payrollRun: {
            include: {
              payrollPeriod: true,
            },
          },
          lines: true,
        },
        orderBy: {
          payrollRun: {
            payrollPeriod: {
              startDate: 'desc',
            },
          },
        },
      });

      return items.map((it) => ({
        id: it.id,
        runId: it.payrollRunId,
        periodName: it.payrollRun.payrollPeriod.name,
        startDate: it.payrollRun.payrollPeriod.startDate,
        endDate: it.payrollRun.payrollPeriod.endDate,
        payDate: it.payrollRun.payrollPeriod.payDate,
        grossPay: Number(it.grossPay),
        totalDeductions: round(Number(it.grossPay) - Number(it.netPay), 2),
        netPay: Number(it.netPay),
        issuedDocumentId: it.issuedDocumentId,
      }));
    });
  }

  async getMyPayslipDetail(user: AuthUser, itemId: string) {
    return this.prisma.withTenant(user.tenantId, async (tx) => {
      const item = await tx.payrollItem.findFirst({
        where: { id: itemId, tenantId: user.tenantId },
        include: {
          payrollRun: {
            include: {
              payrollPeriod: true,
              approvedBy: true,
            },
          },
          employee: {
            include: { department: true },
          },
          lines: {
            orderBy: { id: 'asc' },
          },
        },
      });

      if (!item) {
        throw new NotFoundException('Payslip not found');
      }

      const canViewAll = hasPermission(user, 'payroll.view.all');
      if (!canViewAll && item.employeeId !== user.employeeId) {
        throw new ForbiddenException('You are not authorized to view this payslip');
      }

      let verification: any = null;
      if (item.issuedDocumentId) {
        const issuedDoc = await tx.issuedDocument.findUnique({
          where: { id: item.issuedDocumentId },
        });
        if (issuedDoc) {
          verification = {
            documentNo: issuedDoc.documentNo,
            verificationCode: issuedDoc.verificationCode,
            issuedAt: issuedDoc.issuedAt,
            status: issuedDoc.status,
            snapshot: issuedDoc.snapshotData,
          };
        }
      }

      if (!verification) {
        verification = {
          documentNo: `AZIR-PS-DRAFT`,
          verificationCode: 'UNVERIFIED',
          issuedAt: new Date(),
          status: 'DRAFT',
        };
      }

      return {
        payrollItem: {
          id: item.id,
          runId: item.payrollRunId,
          basicPay: Number(item.basicPay),
          allowances: Number(item.allowances),
          overtimePay: Number(item.overtimePay),
          absencesDeduction: Number(item.absencesDeduction),
          grossPay: Number(item.grossPay),
          sssEe: Number(item.sssEe),
          sssEr: Number(item.sssEr),
          philHealthEe: Number(item.philHealthEe),
          philHealthEr: Number(item.philHealthEr),
          pagIbigEe: Number(item.pagIbigEe),
          pagIbigEr: Number(item.pagIbigEr),
          withholdingTax: Number(item.withholdingTax),
          otherDeductions: Number(item.otherDeductions),
          netPay: Number(item.netPay),
          lines: item.lines.map((l) => ({
            category: l.category,
            code: l.code,
            description: l.description,
            amount: Number(l.amount),
            rate: l.rate ? Number(l.rate) : null,
            quantity: l.quantity ? Number(l.quantity) : null,
          })),
        },
        period: item.payrollRun.payrollPeriod,
        employee: {
          id: item.employee.id,
          firstName: item.employee.firstName,
          lastName: item.employee.lastName,
          employeeNo: item.employee.employeeNo,
          position: item.employee.position,
          department: item.employee.department?.name || 'General',
          hireDate: item.employee.hireDate,
        },
        approver: item.payrollRun.approvedBy
          ? {
              firstName: item.payrollRun.approvedBy.firstName,
              lastName: item.payrollRun.approvedBy.lastName,
              position: item.payrollRun.approvedBy.position,
            }
          : null,
        verification,
      };
    });
  }
}
