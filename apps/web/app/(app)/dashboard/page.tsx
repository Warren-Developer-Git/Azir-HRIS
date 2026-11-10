'use client';

import React from 'react';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { CalendarDays, CheckSquare, Users, ArrowRight } from 'lucide-react';

export default function DashboardPage() {
  const { user, can } = useAuth();

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
          {can('leave.file') && (
            <Link
              href="/leave/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              File Leave Request
            </Link>
          )}
        </div>
      </div>

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
