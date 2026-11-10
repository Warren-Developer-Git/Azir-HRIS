'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Sliders,
  Calendar,
  Building,
  Clock,
  Loader2,
  AlertCircle,
  Tag,
} from 'lucide-react';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  kind: string;
  defaultDays: number;
  countingMode: string;
  active: boolean;
}

interface Holiday {
  id: string;
  date: string;
  name: string;
  type: string;
}

interface Department {
  id: string;
  name: string;
  active: boolean;
}

export default function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<'leaveTypes' | 'holidays' | 'departments'>('leaveTypes');

  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        setError(null);
        const [lt, h, d] = await Promise.all([
          api<LeaveType[]>('/leave-types').catch(() => []),
          api<Holiday[]>('/holidays').catch(() => []),
          api<Department[]>('/departments').catch(() => []),
        ]);
        setLeaveTypes(lt);
        setHolidays(h);
        setDepartments(d);
      } catch (err: any) {
        setError(err instanceof ApiError ? err.message : 'Failed to load organization settings');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const formatDate = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Review Philippine statutory leave policies, national holidays, and departmental units.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Error loading settings</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100 dark:bg-neutral-900 text-xs font-medium">
        <button
          onClick={() => setTab('leaveTypes')}
          className={`px-4 py-1.5 rounded transition-colors ${
            tab === 'leaveTypes'
              ? 'bg-white dark:bg-black text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Leave Types ({leaveTypes.length})
        </button>
        <button
          onClick={() => setTab('holidays')}
          className={`px-4 py-1.5 rounded transition-colors ${
            tab === 'holidays'
              ? 'bg-white dark:bg-black text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Holidays ({holidays.length})
        </button>
        <button
          onClick={() => setTab('departments')}
          className={`px-4 py-1.5 rounded transition-colors ${
            tab === 'departments'
              ? 'bg-white dark:bg-black text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Departments ({departments.length})
        </button>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading configuration...</p>
          </div>
        ) : tab === 'leaveTypes' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Policy / Name</th>
                  <th className="px-5 py-3">Entitlement Quota</th>
                  <th className="px-5 py-3">Counting Mode</th>
                  <th className="px-5 py-3">Allocation Kind</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {leaveTypes.map((type) => (
                  <tr key={type.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-5 py-4 whitespace-nowrap font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                      {type.code}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap font-medium text-neutral-900 dark:text-neutral-100">
                      {type.name}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                      {type.defaultDays} days
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-xs text-neutral-600 dark:text-neutral-400">
                      {type.countingMode.toLowerCase().replace('_', ' ')}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold">
                        {type.kind}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'holidays' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Holiday Name</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {holidays.map((h) => (
                  <tr key={h.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-5 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                      {h.name}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                      {formatDate(h.date)}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-800 font-semibold">
                        {h.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Department Name</th>
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-5 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                      {d.name}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-semibold">
                        {d.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
