'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError } from '@/lib/api';
import Link from 'next/link';
import {
  CalendarDays,
  CheckSquare,
  Users,
  ArrowRight,
  Sparkles,
  Loader2,
  CheckCircle,
  AlertCircle,
  Clock,
  Building2,
  Calendar,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';
import { StatusBadge, LeaveStatus } from '@/components/status-badge';

interface BalanceItem {
  leaveTypeId: string;
  code: string;
  name: string;
  balance: number;
  pending: number;
  available: number;
}

interface RecentRequestItem {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: LeaveStatus;
  reason: string;
  leaveType: { id: string; code: string; name: string };
}

interface AwaitingItem {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  leaveType: { code: string; name: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNo: string;
    position: string;
  };
}

interface TeamOnLeaveItem {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  leaveType: { code: string; name: string };
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    position: string;
  };
}

interface HeadcountData {
  total: number;
  byDepartment: Array<{
    departmentId: string;
    name: string;
    count: number;
  }>;
}

interface DashboardData {
  myBalances: BalanceItem[];
  myRecentRequests: RecentRequestItem[];
  awaitingMe?: {
    count: number;
    items: AwaitingItem[];
  };
  teamOnLeaveThisWeek?: TeamOnLeaveItem[];
  headcount?: HeadcountData;
}

export default function DashboardPage() {
  const { user, can } = useAuth();
  const currentYear = new Date().getFullYear();

  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isGranting, setIsGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api<DashboardData>('/dashboard');
      setData(res);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load dashboard overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleGrantBalances = async () => {
    if (!confirm(`Run annual leave balance grant for ${currentYear}? This will idempotently allocate statutory leave quotas to all eligible employees.`)) {
      return;
    }

    try {
      setIsGranting(true);
      setGrantMessage(null);
      const res = await api<{ created: number }>('/leave/balances/grant', {
        method: 'POST',
        body: JSON.stringify({ year: currentYear }),
      });
      setGrantMessage({
        type: 'success',
        text: `Annual grant for ${currentYear} completed: ${res.created} new leave ledger allocations created.`,
      });
      await loadDashboard();
    } catch (err: any) {
      setGrantMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to execute annual grant',
      });
    } finally {
      setIsGranting(false);
    }
  };

  const formatDateRange = (start: string, end: string) => {
    try {
      const s = new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const e = new Date(end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return `${s} – ${e}`;
    } catch {
      return `${start} – ${end}`;
    }
  };

  const totalAvailableDays =
    data?.myBalances?.reduce((sum, b) => sum + (b.available || 0), 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-mono font-semibold bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300">
              {user?.tenantName || 'Human Resources'}
            </span>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Welcome back, {user?.name}. Here is an overview of your organization and workspace.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {can('balance.adjust') && (
            <button
              onClick={handleGrantBalances}
              disabled={isGranting}
              className="inline-flex items-center gap-2 px-3 py-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 rounded-md text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
            >
              {isGranting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Grant {currentYear} Balances
            </button>
          )}

          {can('leave.file') && (
            <Link
              href="/leave/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-md text-xs font-semibold hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-sm"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              File Leave Request
            </Link>
          )}
        </div>
      </div>

      {grantMessage && (
        <div
          className={`p-4 rounded-md border text-xs flex items-center justify-between gap-3 ${
            grantMessage.type === 'success'
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black'
              : 'border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100'
          }`}
        >
          <div className="flex items-center gap-2">
            {grantMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{grantMessage.text}</span>
          </div>
          <button
            onClick={() => setGrantMessage(null)}
            className="text-xs underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Operation Notice</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
          <Loader2 className="w-6 h-6 animate-spin mb-3" />
          <p className="text-sm">Loading workspace dashboard...</p>
        </div>
      ) : (
        <>
          {/* Key Metric Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
              <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
                <span>My Available Leave</span>
                <CalendarDays className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-100">
                {totalAvailableDays} <span className="text-xs font-normal text-neutral-400">days</span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">Available across all active policies</p>
            </div>

            {data?.awaitingMe !== undefined && (
              <Link
                href="/approvals"
                className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-black dark:hover:border-white transition-all group"
              >
                <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
                  <span>Pending My Approval</span>
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center justify-between">
                  <span>
                    {data.awaitingMe.count}{' '}
                    <span className="text-xs font-normal text-neutral-400">requests</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">Click to open Approvals hub</p>
              </Link>
            )}

            {data?.teamOnLeaveThisWeek !== undefined && (
              <div className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
                  <span>Out of Office This Week</span>
                  <Calendar className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-100">
                  {data.teamOnLeaveThisWeek.length}{' '}
                  <span className="text-xs font-normal text-neutral-400">members</span>
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">Approved schedule overlaps</p>
              </div>
            )}

            {data?.headcount !== undefined && (
              <Link
                href="/employees"
                className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-black dark:hover:border-white transition-all group"
              >
                <div className="flex items-center justify-between text-neutral-500 text-xs mb-2">
                  <span>Active Headcount</span>
                  <Users className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold font-mono tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center justify-between">
                  <span>
                    {data.headcount.total}{' '}
                    <span className="text-xs font-normal text-neutral-400">employees</span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-[11px] text-neutral-400 mt-1">Across {data.headcount.byDepartment.length} departments</p>
              </Link>
            )}
          </div>

          {/* Section: Needs Your Review (If awaitingMe has items) */}
          {data?.awaitingMe && data.awaitingMe.count > 0 && (
            <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <CheckSquare className="w-4 h-4" />
                  <h2 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    Requests Awaiting Your Approval ({data.awaitingMe.count})
                  </h2>
                </div>
                <Link
                  href="/approvals"
                  className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white inline-flex items-center gap-1"
                >
                  View all in Approvals <ArrowRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.awaitingMe.items.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                        <span>
                          {item.employee.firstName} {item.employee.lastName}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded border border-neutral-200 dark:border-neutral-800 text-neutral-500">
                          {item.leaveType.code}
                        </span>
                        <span className="text-xs text-neutral-500">({item.days} days)</span>
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                        {formatDateRange(item.startDate, item.endDate)} &bull; &ldquo;{item.reason}&rdquo;
                      </div>
                    </div>
                    <Link
                      href={`/approvals?id=${item.id}`}
                      className="px-3 py-1 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 shrink-0 transition-colors"
                    >
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section: Balances & Entitlements Overview */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                <h2 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  My Leave Balances ({currentYear})
                </h2>
              </div>
              <Link
                href="/leave"
                className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white inline-flex items-center gap-1"
              >
                View leave history <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {data?.myBalances.map((bal) => (
                <div
                  key={bal.leaveTypeId}
                  className="p-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold">{bal.code}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded border border-neutral-200 dark:border-neutral-800 text-neutral-500 font-mono">
                      {bal.balance} credited
                    </span>
                  </div>
                  <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-2 truncate">
                    {bal.name}
                  </div>
                  <div className="flex items-baseline justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
                    <span className="text-[11px] text-neutral-400">Available:</span>
                    <span className="text-base font-bold font-mono text-neutral-900 dark:text-neutral-100">
                      {bal.available} days
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Who is out this week & Headcount breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team on Leave This Week */}
            {data?.teamOnLeaveThisWeek !== undefined && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-2 pb-3 border-b border-neutral-100 dark:border-neutral-800">
                  <Calendar className="w-4 h-4" />
                  <h2 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    Out of Office This Week
                  </h2>
                </div>

                {data.teamOnLeaveThisWeek.length === 0 ? (
                  <p className="text-xs text-neutral-400 py-4 text-center">
                    All team members are in office this week.
                  </p>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {data.teamOnLeaveThisWeek.map((item) => (
                      <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {item.employee.firstName} {item.employee.lastName}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {item.employee.position}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-semibold text-[11px] px-1.5 py-0.5 rounded border border-neutral-200 dark:border-neutral-800">
                            {item.leaveType.code}
                          </span>
                          <div className="text-[10px] text-neutral-400 font-mono mt-0.5">
                            {formatDateRange(item.startDate, item.endDate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Headcount Breakdown */}
            {data?.headcount !== undefined && (
              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    <h2 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      Headcount by Department
                    </h2>
                  </div>
                  <Link
                    href="/employees"
                    className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white inline-flex items-center gap-1"
                  >
                    Directory <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                <div className="space-y-3">
                  {data.headcount.byDepartment.map((dept) => (
                    <div key={dept.departmentId} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {dept.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-neutral-100 dark:bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-black dark:bg-white h-1.5 rounded-full"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round((dept.count / (data.headcount?.total || 1)) * 100),
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 w-6 text-right">
                          {dept.count}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Section: My Recent Requests */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <h2 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                  My Recent Leave Filings
                </h2>
              </div>
              <Link
                href="/leave"
                className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white inline-flex items-center gap-1"
              >
                All filings <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {data?.myRecentRequests.length === 0 ? (
              <p className="text-xs text-neutral-400 py-4 text-center">
                You haven&apos;t filed any leave requests yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-2.5">Leave Type</th>
                      <th className="px-4 py-2.5">Schedule</th>
                      <th className="px-4 py-2.5">Days</th>
                      <th className="px-4 py-2.5">Reason</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {data?.myRecentRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                        <td className="px-4 py-3 font-semibold text-xs">
                          {req.leaveType.name} ({req.leaveType.code})
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-neutral-500">
                          {formatDateRange(req.startDate, req.endDate)}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono">{req.days} days</td>
                        <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-400 truncate max-w-xs">
                          {req.reason}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={req.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/leave/${req.id}`}
                            className="p-1 rounded text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 inline" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
