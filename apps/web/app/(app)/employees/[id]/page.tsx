'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  ArrowLeft,
  User,
  Building,
  KeyRound,
  Shield,
  Trash2,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  Save,
  CalendarDays,
  Sliders,
  X,
  CheckCircle,
} from 'lucide-react';

interface EmployeeDetail {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string;
  departmentId: string | null;
  managerId: string | null;
  hireDate: string;
  gender: string;
  maritalStatus: string;
  phone: string | null;
  address: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  user: {
    id: string;
    email: string;
    roles: string[];
    active: boolean;
  };
  department?: { id: string; name: string };
  manager?: { id: string; firstName: string; lastName: string; employeeNo: string };
}

interface Department {
  id: string;
  name: string;
}

interface ManagerOption {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
}

interface LeaveBalanceSummary {
  leaveTypeId: string;
  code: string;
  name: string;
  balance: number;
  pending: number;
  available: number;
}

interface LeaveTypeOption {
  id: string;
  code: string;
  name: string;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, can } = useAuth();
  const id = params?.id as string;

  const [employee, setEmployee] = useState<EmployeeDetail | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [gender, setGender] = useState('FEMALE');
  const [maritalStatus, setMaritalStatus] = useState('SINGLE');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [roles, setRoles] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Leave balances state
  const currentYear = new Date().getFullYear();
  const [balanceYear, setBalanceYear] = useState<number>(currentYear);
  const [balances, setBalances] = useState<LeaveBalanceSummary[]>([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [yearlyTypes, setYearlyTypes] = useState<LeaveTypeOption[]>([]);

  // Adjustment Modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustTypeId, setAdjustTypeId] = useState('');
  const [adjustDays, setAdjustDays] = useState<number>(1);
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Password reset modal
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Deactivate modal
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const fetchBalances = async (targetYear: number) => {
    try {
      setIsLoadingBalances(true);
      const res = await api<LeaveBalanceSummary[]>(`/employees/${id}/balances?year=${targetYear}`);
      setBalances(res);
    } catch {
      setBalances([]);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [empData, deptData, mgrData, typesData] = await Promise.all([
        api<EmployeeDetail>(`/employees/${id}`),
        api<Department[]>('/departments').catch(() => []),
        api<{ data: ManagerOption[] }>('/employees?scope=all&pageSize=50').catch(() => ({ data: [] })),
        api<Array<{ id: string; code: string; name: string; kind: string }>>('/leave-types').catch(() => []),
      ]);

      setEmployee(empData);
      setFirstName(empData.firstName);
      setLastName(empData.lastName);
      setPosition(empData.position);
      setDepartmentId(empData.departmentId || '');
      setManagerId(empData.managerId || '');
      setGender(empData.gender);
      setMaritalStatus(empData.maritalStatus);
      setPhone(empData.phone || '');
      setAddress(empData.address || '');
      setRoles(empData.user.roles);

      setDepartments(deptData);
      setManagers(mgrData.data || []);
      const yearly = typesData.filter((t) => t.kind === 'YEARLY');
      setYearlyTypes(yearly);
      if (yearly.length > 0) {
        setAdjustTypeId(yearly[0].id);
      }

      await fetchBalances(balanceYear);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load employee profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const handleYearChange = async (newYear: number) => {
    setBalanceYear(newYear);
    await fetchBalances(newYear);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    try {
      setIsSaving(true);
      if (can('employee.write')) {
        await api(`/employees/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            position: position.trim(),
            departmentId: departmentId || null,
            managerId: managerId || null,
            gender: gender as any,
            maritalStatus: maritalStatus as any,
            phone: phone.trim() || null,
            address: address.trim() || null,
          }),
        });
      }

      if (can('role.assign') && roles.length > 0) {
        await api(`/employees/${id}/roles`, {
          method: 'PUT',
          body: JSON.stringify({ roles }),
        });
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await fetchDetail();
    } catch (err: any) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to update employee');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustReason.trim()) return;

    setIsAdjusting(true);
    setAdjustError(null);
    setAdjustSuccess(null);

    try {
      await api(`/employees/${id}/balance-adjustments`, {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId: adjustTypeId,
          year: balanceYear,
          days: Number(adjustDays),
          reason: adjustReason.trim(),
        }),
      });

      setAdjustSuccess(`Balance adjusted by ${adjustDays > 0 ? '+' : ''}${adjustDays} days.`);
      setTimeout(() => setAdjustSuccess(null), 3000);
      setShowAdjustModal(false);
      setAdjustReason('');
      setAdjustDays(1);
      await fetchBalances(balanceYear);
    } catch (err: any) {
      setAdjustError(err instanceof ApiError ? err.message : 'Failed to adjust balance');
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirm(`Reset password for ${employee?.firstName} ${employee?.lastName}?`)) return;

    try {
      setIsResetting(true);
      const res = await api<{ temporaryPassword?: string }>(`/employees/${id}/reset-password`, {
        method: 'POST',
      });
      if (res.temporaryPassword) {
        setNewPassword(res.temporaryPassword);
      }
    } catch (err: any) {
      alert(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDeactivate = async () => {
    try {
      setIsDeactivating(true);
      await api(`/employees/${id}/deactivate`, { method: 'POST' });
      setShowDeactivateModal(false);
      await fetchDetail();
    } catch (err: any) {
      alert(err instanceof ApiError ? err.message : 'Failed to deactivate employee');
    } finally {
      setIsDeactivating(false);
    }
  };

  const toggleRole = (r: string) => {
    if (roles.includes(r)) {
      if (roles.length === 1) return;
      setRoles(roles.filter((role) => role !== r));
    } else {
      setRoles([...roles, r]);
    }
  };

  const isSelf = user?.employeeId === id;
  const canEdit = can('employee.write') || can('role.assign');

  if (isLoading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <p className="text-sm">Loading employee profile...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <Link
          href="/employees"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </Link>
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Profile Error</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error || 'Employee not found'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <Link
            href="/employees"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Directory
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {employee.firstName} {employee.lastName}
            </h1>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                employee.status === 'ACTIVE'
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                  : 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
              }`}
            >
              {employee.status}
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-1 font-mono">
            {employee.employeeNo} &bull; {employee.position} &bull; {employee.department?.name || 'Unassigned'}
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 rounded-md border border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black text-xs flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Profile changes saved successfully.</span>
        </div>
      )}

      {saveError && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-xs flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
          <AlertCircle className="w-4 h-4 text-neutral-900 dark:text-neutral-100" />
          <span>{saveError}</span>
        </div>
      )}

      {adjustSuccess && (
        <div className="p-4 rounded-md border border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>{adjustSuccess}</span>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleUpdate} className="space-y-6">
        {/* Employment & Personal Information */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Personal & Position Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">First Name</label>
              <input
                type="text"
                disabled={!can('employee.write')}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Last Name</label>
              <input
                type="text"
                disabled={!can('employee.write')}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Position / Job Title</label>
              <input
                type="text"
                disabled={!can('employee.write')}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Department</label>
              <select
                disabled={!can('employee.write')}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              >
                <option value="">No Department Assigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Direct Manager</label>
              <select
                disabled={!can('employee.write')}
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              >
                <option value="">No Direct Manager</option>
                {managers
                  .filter((m) => m.id !== id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName} ({m.position})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Hire Date</label>
              <input
                type="text"
                disabled
                value={employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : ''}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 opacity-60 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Gender</label>
              <select
                disabled={!can('employee.write')}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              >
                <option value="FEMALE">Female</option>
                <option value="MALE">Male</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">Marital Status</label>
              <select
                disabled={!can('employee.write')}
                value={maritalStatus}
                onChange={(e) => setMaritalStatus(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              >
                <option value="SINGLE">Single</option>
                <option value="MARRIED">Married</option>
                <option value="WIDOWED">Widowed</option>
                <option value="DIVORCED">Divorced</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Contact Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Phone Number</label>
              <input
                type="text"
                disabled={!can('employee.write')}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 912 345 6789"
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Work Email</label>
              <input
                type="text"
                disabled
                value={employee.user.email}
                className="w-full px-3 py-2 text-sm rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 opacity-60 font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold mb-1">Residential Address</label>
              <input
                type="text"
                disabled={!can('employee.write')}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Unit, Street, Barangay, City"
                className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black disabled:opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Roles & Permissions */}
        {can('role.assign') && (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
              System Roles & RBAC
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'] as const).map((r) => {
                const isChecked = roles.includes(r);
                return (
                  <label
                    key={r}
                    className={`flex items-center gap-2 p-3 rounded border text-xs font-medium cursor-pointer transition-colors ${
                      isChecked
                        ? 'border-black dark:border-white bg-neutral-100 dark:bg-neutral-800 font-semibold'
                        : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleRole(r)}
                      className="accent-black dark:accent-white"
                    />
                    <span>{r}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

      {/* Leave Entitlements & Balances Section */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-neutral-800">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Leave Entitlements & Balances
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Annual statutory quotas, approved deductions, and available days.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs">
              <span className="text-neutral-500">Year:</span>
              <select
                value={balanceYear}
                onChange={(e) => handleYearChange(Number(e.target.value))}
                className="px-2 py-1 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-mono font-semibold"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            {can('balance.adjust') && (
              <button
                type="button"
                onClick={() => {
                  setAdjustError(null);
                  setShowAdjustModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors shadow-xs"
              >
                <Sliders className="w-3.5 h-3.5" />
                Adjust Balance
              </button>
            )}
          </div>
        </div>

        {isLoadingBalances ? (
          <div className="py-8 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <p className="text-xs">Loading balances for {balanceYear}...</p>
          </div>
        ) : balances.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">
            No annual leave quotas granted for {balanceYear}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Policy Name</th>
                  <th className="px-4 py-2.5">Current Balance</th>
                  <th className="px-4 py-2.5">Pending Approval</th>
                  <th className="px-4 py-2.5">Net Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {balances.map((b) => (
                  <tr key={b.leaveTypeId} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                    <td className="px-4 py-3 font-mono font-bold text-xs">{b.code}</td>
                    <td className="px-4 py-3 text-xs font-medium">{b.name}</td>
                    <td className="px-4 py-3 text-xs font-semibold font-mono">{b.balance} days</td>
                    <td className="px-4 py-3 text-xs text-neutral-500 font-mono">{b.pending} days</td>
                    <td className="px-4 py-3 text-xs font-bold font-mono">
                      <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">
                        {b.available} days
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Danger Zone / Admin Actions */}
      {canEdit && (
        <div className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-6 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Account Management & Actions
          </h3>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
            <div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Reset Login Password
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                Generate a new temporary password for this user's portal access.
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={isResetting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            >
              {isResetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <KeyRound className="w-3.5 h-3.5" />
              Reset Password
            </button>
          </div>

          {!isSelf && employee.status === 'ACTIVE' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
              <div>
                <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Deactivate Employee
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  Revoke portal access and mark this employment record as inactive.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeactivateModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Deactivate Record
              </button>
            </div>
          )}
        </div>
      )}

      {/* Adjust Balance Modal */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                Adjust Leave Balance
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              {adjustError && (
                <div className="p-3 text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100">
                  {adjustError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold mb-1">Leave Policy *</label>
                <select
                  value={adjustTypeId}
                  onChange={(e) => setAdjustTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-medium"
                >
                  {yearlyTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} &mdash; {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Year</label>
                <input
                  type="number"
                  disabled
                  value={balanceYear}
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 font-mono opacity-60"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">
                  Days Adjustment (+ to add, - to deduct) *
                </label>
                <input
                  type="number"
                  required
                  step="1"
                  value={adjustDays}
                  onChange={(e) => setAdjustDays(Number(e.target.value))}
                  placeholder="e.g. 2 or -1"
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-mono font-bold"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Positive numbers increase balance; negative numbers deduct. Total balance cannot fall below 0.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Adjustment Reason *</label>
                <textarea
                  required
                  rows={2}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Overtime credit compensation, Disciplinary deduction"
                  className="w-full px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjusting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-50"
                >
                  {isAdjusting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {newPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              New Password Generated
            </h3>
            <p className="text-xs text-neutral-500">
              The employee can log in using this temporary password:
            </p>

            <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 flex items-center justify-between">
              <code className="text-base font-mono font-bold text-neutral-900 dark:text-white">
                {newPassword}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newPassword);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setNewPassword(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate Modal */}
      {showDeactivateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Deactivate Employee?
            </h3>
            <p className="text-xs text-neutral-500">
              Are you sure you want to deactivate {employee.firstName} {employee.lastName}? This will immediately disable their login session.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeactivateModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={isDeactivating}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isDeactivating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
