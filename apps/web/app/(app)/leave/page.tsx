'use client';

import React, { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { StatusBadge, LeaveStatus } from '@/components/status-badge';
import { StatCardsSkeleton, TableSkeleton } from '@/components/skeletons';
import { CalendarDays, Plus, AlertCircle } from 'lucide-react';

interface LeaveBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  balance: number;
  pending: number;
  available: number;
}

interface LeaveRequestItem {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveStatus;
  createdAt: string;
  leaveType: {
    id: string;
    code: string;
    name: string;
  };
}

export default function LeavePage() {
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [requests, setRequests] = useState<LeaveRequestItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [balData, reqData] = await Promise.all([
        api<LeaveBalance[]>('/leave/balances'),
        api<LeaveRequestItem[]>('/leave/requests?scope=mine'),
      ]);
      setBalances(balData);
      setRequests(reqData);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load leave records');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredRequests = requests.filter((r) => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return r.status === 'PENDING_MANAGER' || r.status === 'PENDING_HR';
    return r.status === filter;
  });

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave & Balances</h1>
          <p className="text-sm text-neutral-500 mt-1">
            View your yearly leave allocations, file new leave requests, and track approval status.
          </p>
        </div>
        <div>
          <Link
            href="/leave/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
            File Leave Request
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-neutral-900 dark:text-neutral-100">Error loading leave data</div>
            <div className="text-neutral-600 dark:text-neutral-400 mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Balances Section */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Current Year Balances ({new Date().getFullYear()})
        </h2>

        {isLoading ? (
          <StatCardsSkeleton count={3} />
        ) : balances.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-500 text-sm">
            No yearly leave balances assigned for this period.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {balances.map((bal) => (
              <div
                key={bal.leaveTypeId}
                className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                      {bal.name}
                    </span>
                    <span className="px-2 py-0.5 text-xs font-mono font-medium rounded border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400">
                      {bal.code}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
                      {bal.available}
                    </span>
                    <span className="text-xs text-neutral-500 font-medium">days available</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
                  <span>Balance: {bal.balance}</span>
                  <span>Pending: {bal.pending}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Requests History Section */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
            My Leave Requests
          </h2>

          {/* Filter Pills */}
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100 dark:bg-neutral-900 text-xs">
            {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  filter === tab
                    ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
                }`}
              >
                {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Requests Table */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={5} columns={5} embedded />
          ) : filteredRequests.length === 0 ? (
            <div className="p-10 text-center text-neutral-500">
              <CalendarDays className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
              <p className="text-sm font-medium">No leave requests found</p>
              <p className="text-xs text-neutral-400 mt-1">
                {filter === 'ALL'
                  ? 'You have not submitted any leave requests yet.'
                  : `No requests currently match the "${filter.toLowerCase()}" filter.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Type</th>
                    <th className="px-5 py-3">Dates</th>
                    <th className="px-5 py-3">Days</th>
                    <th className="px-5 py-3">Reason</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                  {filteredRequests.map((req) => (
                    <tr
                      key={req.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {req.leaveType.name}
                        </div>
                        <div className="text-xs font-mono text-neutral-500">
                          {req.leaveType.code}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                        {formatDate(req.startDate)}
                        {req.startDate !== req.endDate && ` – ${formatDate(req.endDate)}`}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap font-medium text-neutral-900 dark:text-neutral-100">
                        {req.days} {req.days === 1 ? 'day' : 'days'}
                      </td>
                      <td className="px-5 py-4 max-w-xs truncate text-neutral-500 dark:text-neutral-400">
                        {req.reason}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <StatusBadge status={req.status} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <Link
                          href={`/leave/${req.id}`}
                          className="font-medium text-neutral-900 dark:text-neutral-100 hover:underline text-xs"
                        >
                          View Details →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
