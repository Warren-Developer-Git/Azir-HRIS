'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';

export default function DashboardPage() {
  const { user, can } = useAuth();
  const currentYear = new Date().getFullYear();

  const [isGranting, setIsGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
    } catch (err: any) {
      setGrantMessage({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'Failed to execute annual grant',
      });
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Welcome back, {user?.name}. Here is an overview of your workspace.
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

      {/* Quick shortcuts grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {can('leave.file') && (
          <Link
            href="/leave"
            className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                <CalendarDays className="w-5 h-5 text-neutral-800 dark:text-neutral-200" />
              </span>
              <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <h3 className="font-semibold text-base mb-1">My Leave & Balances</h3>
            <p className="text-xs text-neutral-500">
              Check available days (SIL, Vacation, Sick) and track request history.
            </p>
          </Link>
        )}

        {(can('leave.approve.manager') || can('leave.approve.hr')) && (
          <Link
            href="/approvals"
            className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                <CheckSquare className="w-5 h-5 text-neutral-800 dark:text-neutral-200" />
              </span>
              <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <h3 className="font-semibold text-base mb-1">Pending Approvals</h3>
            <p className="text-xs text-neutral-500">
              Review and decide on operational schedule and policy compliance.
            </p>
          </Link>
        )}

        {can('employee.read.all') && (
          <Link
            href="/employees"
            className="p-5 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-neutral-400 dark:hover:border-neutral-600 transition-all group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="p-2.5 rounded-md bg-neutral-100 dark:bg-neutral-800">
                <Users className="w-5 h-5 text-neutral-800 dark:text-neutral-200" />
              </span>
              <ArrowRight className="w-4 h-4 text-neutral-400 group-hover:translate-x-1 transition-transform" />
            </div>
            <h3 className="font-semibold text-base mb-1">Employee Directory</h3>
            <p className="text-xs text-neutral-500">
              Manage organization structure, profiles, roles, and records.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
