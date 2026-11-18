'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TableSkeleton } from '@/components/skeletons';
import {
  Sliders,
  Calendar,
  Building2,
  Clock,
  AlertCircle,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  X,
  RefreshCw,
  Globe,
} from 'lucide-react';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  kind: string;
  defaultDays: number;
  countingMode: string;
  minServiceMonths: number;
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
  const [message, setMessage] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // Modal states
  const [isDeptModalOpen, setIsDeptModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [deptName, setDeptName] = useState('');

  const [isLeaveTypeModalOpen, setIsLeaveTypeModalOpen] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<LeaveType | null>(null);
  const [leaveTypeCode, setLeaveTypeCode] = useState('');
  const [leaveTypeName, setLeaveTypeName] = useState('');
  const [leaveTypeKind, setLeaveTypeKind] = useState<'ANNUAL' | 'PER_EVENT' | 'SPECIAL'>('ANNUAL');
  const [leaveTypeDays, setLeaveTypeDays] = useState(5);
  const [leaveTypeMode, setLeaveTypeMode] = useState<'WORKING_DAYS' | 'CALENDAR_DAYS'>('WORKING_DAYS');
  const [leaveTypeMinMonths, setLeaveTypeMinMonths] = useState(0);

  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayType, setHolidayType] = useState<'REGULAR' | 'SPECIAL'>('REGULAR');

  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [syncYear, setSyncYear] = useState(2026);
  const [isSyncingHolidays, setIsSyncingHolidays] = useState(false);

  const loadData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [lt, h, d] = await Promise.all([
        api<LeaveType[]>('/leave-types?includeInactive=true').catch(() => []),
        api<Holiday[]>('/holidays').catch(() => []),
        api<Department[]>('/departments?includeInactive=true').catch(() => []),
      ]);
      setLeaveTypes(lt);
      setHolidays(h);
      setDepartments(d);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organization settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
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

  // --- Department CRUD Handlers ---
  const handleOpenDeptModal = (dept?: Department) => {
    setEditingDept(dept || null);
    setDeptName(dept ? dept.name : '');
    setModalError(null);
    setIsDeptModalOpen(true);
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptName.trim()) return;

    setModalSubmitting(true);
    setModalError(null);
    try {
      if (editingDept) {
        await api(`/departments/${editingDept.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: deptName.trim() }),
        });
        setMessage({ type: 'success', text: `Department "${deptName}" updated successfully.` });
      } else {
        await api('/departments', {
          method: 'POST',
          body: JSON.stringify({ name: deptName.trim() }),
        });
        setMessage({ type: 'success', text: `Department "${deptName}" created successfully.` });
      }
      setIsDeptModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to save department');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteDept = async (dept: Department) => {
    if (!confirm(`Are you sure you want to delete or deactivate department "${dept.name}"?`)) return;

    try {
      const res = await api<{ deleted?: boolean; deactivated?: boolean }>(`/departments/${dept.id}`, {
        method: 'DELETE',
      });
      if (res.deactivated) {
        setMessage({
          type: 'info',
          text: `Department "${dept.name}" is currently assigned to employee(s) and has been deactivated.`,
        });
      } else {
        setMessage({ type: 'success', text: `Department "${dept.name}" permanently deleted.` });
      }
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete department');
    }
  };

  // --- Leave Type CRUD Handlers ---
  const handleOpenLeaveTypeModal = (lt?: LeaveType) => {
    setEditingLeaveType(lt || null);
    setLeaveTypeCode(lt ? lt.code : '');
    setLeaveTypeName(lt ? lt.name : '');
    setLeaveTypeKind((lt ? lt.kind : 'ANNUAL') as any);
    setLeaveTypeDays(lt ? lt.defaultDays : 5);
    setLeaveTypeMode((lt ? lt.countingMode : 'WORKING_DAYS') as any);
    setLeaveTypeMinMonths(lt ? lt.minServiceMonths : 0);
    setModalError(null);
    setIsLeaveTypeModalOpen(true);
  };

  const handleSaveLeaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveTypeName.trim()) return;

    setModalSubmitting(true);
    setModalError(null);
    try {
      if (editingLeaveType) {
        await api(`/leave-types/${editingLeaveType.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: leaveTypeName.trim(),
            defaultDays: Number(leaveTypeDays),
            countingMode: leaveTypeMode,
            kind: leaveTypeKind,
            minServiceMonths: Number(leaveTypeMinMonths),
          }),
        });
        setMessage({ type: 'success', text: `Leave policy "${leaveTypeName}" updated successfully.` });
      } else {
        await api('/leave-types', {
          method: 'POST',
          body: JSON.stringify({
            code: leaveTypeCode.trim().toUpperCase(),
            name: leaveTypeName.trim(),
            defaultDays: Number(leaveTypeDays),
            countingMode: leaveTypeMode,
            kind: leaveTypeKind,
            minServiceMonths: Number(leaveTypeMinMonths),
          }),
        });
        setMessage({ type: 'success', text: `Leave policy "${leaveTypeName}" created successfully.` });
      }
      setIsLeaveTypeModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to save leave policy');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteLeaveType = async (lt: LeaveType) => {
    if (!confirm(`Are you sure you want to delete or deactivate leave policy "${lt.name}"?`)) return;

    try {
      const res = await api<{ deleted?: boolean; deactivated?: boolean }>(`/leave-types/${lt.id}`, {
        method: 'DELETE',
      });
      if (res.deactivated) {
        setMessage({
          type: 'info',
          text: `Leave policy "${lt.name}" has existing filings or ledger entries and has been deactivated.`,
        });
      } else {
        setMessage({ type: 'success', text: `Leave policy "${lt.name}" permanently deleted.` });
      }
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete leave policy');
    }
  };

  // --- Holiday CRUD Handlers ---
  const handleOpenHolidayModal = (h?: Holiday) => {
    setEditingHoliday(h || null);
    setHolidayName(h ? h.name : '');
    setHolidayDate(h ? h.date.split('T')[0] : '');
    setHolidayType((h ? h.type : 'REGULAR') as any);
    setModalError(null);
    setIsHolidayModalOpen(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayName.trim()) return;

    setModalSubmitting(true);
    setModalError(null);
    try {
      if (editingHoliday) {
        await api(`/holidays/${editingHoliday.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: holidayName.trim(),
            type: holidayType,
          }),
        });
        setMessage({ type: 'success', text: `Holiday "${holidayName}" updated successfully.` });
      } else {
        await api('/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: holidayName.trim(),
            date: holidayDate,
            type: holidayType,
          }),
        });
        setMessage({ type: 'success', text: `Holiday "${holidayName}" created successfully.` });
      }
      setIsHolidayModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err instanceof ApiError ? err.message : 'Failed to save holiday');
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteHoliday = async (h: Holiday) => {
    if (!confirm(`Are you sure you want to delete holiday "${h.name}"?`)) return;

    try {
      await api(`/holidays/${h.id}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: `Holiday "${h.name}" deleted successfully.` });
      await loadData();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete holiday');
    }
  };

  const handleSyncHolidays = async () => {
    setIsSyncingHolidays(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{
        source: string;
        year: number;
        countryCode: string;
        fetchedCount: number;
        createdCount: number;
        skippedCount: number;
      }>('/holidays/sync', {
        method: 'POST',
        body: JSON.stringify({ year: syncYear, countryCode: 'PH' }),
      });

      setMessage({
        type: 'success',
        text: `Synced ${res.year} ${res.countryCode} holidays from ${res.source}: ${res.createdCount} added, ${res.skippedCount} already existed.`,
      });
      await loadData();
    } catch (err: any) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Failed to sync holidays from external API',
      );
    } finally {
      setIsSyncingHolidays(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organization Settings</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Configure Philippine statutory leave policies, national holidays, and departmental units.
          </p>
        </div>

        {/* Action Button depending on active Tab */}
        <div>
          {tab === 'departments' && can('department.write') && (
            <button
              onClick={() => handleOpenDeptModal()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Department
            </button>
          )}

          {tab === 'leaveTypes' && can('leaveType.write') && (
            <button
              onClick={() => handleOpenLeaveTypeModal()}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Leave Type
            </button>
          )}

          {tab === 'holidays' && can('holiday.write') && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={syncYear}
                onChange={(e) => setSyncYear(Number(e.target.value))}
                aria-label="Sync year"
                className="px-2.5 py-2 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
              >
                <option value={2025}>2025 (PH)</option>
                <option value={2026}>2026 (PH)</option>
                <option value={2027}>2027 (PH)</option>
              </select>
              <button
                onClick={handleSyncHolidays}
                disabled={isSyncingHolidays}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors shadow-sm"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncingHolidays ? 'animate-spin' : ''}`}
                />
                {isSyncingHolidays ? 'Syncing...' : 'Sync PH Holidays (API)'}
              </button>
              <button
                onClick={() => handleOpenHolidayModal()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add Holiday
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Notifications / Alerts */}
      {message && (
        <div
          className={`p-4 rounded-md border text-sm flex items-start justify-between gap-3 ${
            message.type === 'success'
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black'
              : 'border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
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
          <button onClick={() => setError(null)} className="text-xs text-neutral-500 hover:text-black dark:hover:text-white">
            Dismiss
          </button>
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

      {/* Table Content */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={5} columns={5} embedded />
        ) : tab === 'leaveTypes' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Code</th>
                  <th className="px-5 py-3">Policy / Name</th>
                  <th className="px-5 py-3">Quota</th>
                  <th className="px-5 py-3">Counting Mode</th>
                  <th className="px-5 py-3">Kind</th>
                  <th className="px-5 py-3">Status</th>
                  {can('leaveType.write') && <th className="px-5 py-3 text-right">Actions</th>}
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
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          type.active
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {type.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    {can('leaveType.write') && (
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenLeaveTypeModal(type)}
                            className="p-1 rounded text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                            title="Edit Policy"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteLeaveType(type)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                            title="Delete or Deactivate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === 'holidays' ? (
          <div>
            <div className="px-5 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/30 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
              <Globe className="w-3.5 h-3.5 shrink-0" />
              <span>
                External API Integration: Philippine public holidays sync live from{' '}
                <span className="font-mono font-medium text-neutral-900 dark:text-neutral-200">
                  Nager.Date Public Holidays API
                </span>{' '}
                and automatically feed into Leave working days, DOLE SLAs, and Attendance rules.
              </span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Holiday Name</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Type</th>
                  {can('holiday.write') && <th className="px-5 py-3 text-right">Actions</th>}
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
                    {can('holiday.write') && (
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenHolidayModal(h)}
                            className="p-1 rounded text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                            title="Edit Holiday"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteHoliday(h)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                            title="Delete Holiday"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Department Name</th>
                  <th className="px-5 py-3">Status</th>
                  {can('department.write') && <th className="px-5 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-5 py-4 font-semibold text-neutral-900 dark:text-neutral-100">
                      {d.name}
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          d.active
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                      >
                        {d.active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    {can('department.write') && (
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenDeptModal(d)}
                            className="p-1 rounded text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
                            title="Edit Department"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDept(d)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors"
                            title="Delete or Deactivate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Department Modal --- */}
      {isDeptModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-lg font-bold">
                {editingDept ? 'Edit Department' : 'Create Department'}
              </h2>
              <button
                onClick={() => setIsDeptModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDept} className="mt-4 space-y-4">
              {modalError && (
                <div className="p-3 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Department Name *</label>
                <input
                  type="text"
                  required
                  value={deptName}
                  onChange={(e) => setDeptName(e.target.value)}
                  placeholder="e.g. Finance, Operations"
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsDeptModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : editingDept ? 'Update Department' : 'Create Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Leave Type Modal --- */}
      {isLeaveTypeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-lg font-bold">
                {editingLeaveType ? 'Edit Leave Policy' : 'Create Leave Policy'}
              </h2>
              <button
                onClick={() => setIsLeaveTypeModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLeaveType} className="mt-4 space-y-4">
              {modalError && (
                <div className="p-3 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100">
                  {modalError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Code *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingLeaveType}
                    value={leaveTypeCode}
                    onChange={(e) => setLeaveTypeCode(e.target.value.toUpperCase())}
                    placeholder="e.g. BER, STUDY"
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black uppercase font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Quota (Days) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={365}
                    value={leaveTypeDays}
                    onChange={(e) => setLeaveTypeDays(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Policy Name *</label>
                <input
                  type="text"
                  required
                  value={leaveTypeName}
                  onChange={(e) => setLeaveTypeName(e.target.value)}
                  placeholder="e.g. Bereavement Leave"
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1">Allocation Kind</label>
                  <select
                    value={leaveTypeKind}
                    onChange={(e) => setLeaveTypeKind(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                  >
                    <option value="ANNUAL">ANNUAL</option>
                    <option value="PER_EVENT">PER_EVENT</option>
                    <option value="SPECIAL">SPECIAL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Counting Mode</label>
                  <select
                    value={leaveTypeMode}
                    onChange={(e) => setLeaveTypeMode(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                  >
                    <option value="WORKING_DAYS">Working Days (excludes Sun & Hol)</option>
                    <option value="CALENDAR_DAYS">Calendar Days</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Minimum Service Required (Months)</label>
                <input
                  type="number"
                  min={0}
                  value={leaveTypeMinMonths}
                  onChange={(e) => setLeaveTypeMinMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsLeaveTypeModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : editingLeaveType ? 'Update Policy' : 'Create Policy'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Holiday Modal --- */}
      {isHolidayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg p-6 shadow-xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-200 dark:border-neutral-800">
              <h2 className="text-lg font-bold">
                {editingHoliday ? 'Edit Holiday' : 'Create Holiday'}
              </h2>
              <button
                onClick={() => setIsHolidayModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveHoliday} className="mt-4 space-y-4">
              {modalError && (
                <div className="p-3 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="e.g. Rizal Day, Labor Day"
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Date *</label>
                <input
                  type="date"
                  required
                  disabled={!!editingHoliday}
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-mono disabled:opacity-50 cursor-pointer dark:[color-scheme:dark]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Holiday Type</label>
                <select
                  value={holidayType}
                  onChange={(e) => setHolidayType(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                >
                  <option value="REGULAR">Regular Holiday (100% premium)</option>
                  <option value="SPECIAL">Special Non-Working Day (30% premium)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsHolidayModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : editingHoliday ? 'Update Holiday' : 'Create Holiday'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
