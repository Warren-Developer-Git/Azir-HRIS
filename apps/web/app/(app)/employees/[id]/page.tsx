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

  // Password reset modal
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Deactivate modal
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [empData, deptData, mgrData] = await Promise.all([
        api<EmployeeDetail>(`/employees/${id}`),
        api<Department[]>('/departments').catch(() => []),
        api<{ data: ManagerOption[] }>('/employees?scope=all&pageSize=50').catch(() => ({ data: [] })),
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
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load employee profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    try {
      setIsSaving(true);
      // 1. Update basic employee details if employee.write
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

      // 2. Update roles if role.assign
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

  const handleResetPassword = async () => {
    try {
      setIsResetting(true);
      const res = await api<{ temporaryPassword: string }>(`/employees/${id}/reset-password`, {
        method: 'POST',
      });
      setNewPassword(res.temporaryPassword);
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

  const handleRoleToggle = (role: string) => {
    if (role === 'EMPLOYEE') return;
    if (roles.includes(role)) {
      setRoles(roles.filter((r) => r !== role));
    } else {
      setRoles([...roles, role]);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <p className="text-sm">Loading employee record...</p>
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-neutral-400" />
        <h2 className="text-lg font-bold">Employee Not Found</h2>
        <p className="text-sm text-neutral-500">{error || 'Unable to locate this employee.'}</p>
        <Link
          href="/employees"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </Link>
      </div>
    );
  }

  const isSelf = user?.employeeId === employee.id;
  const canEdit = can('employee.write');

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/employees"
            className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">
                {employee.firstName} {employee.lastName}
              </h1>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                  employee.status === 'ACTIVE'
                    ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                    : 'border border-neutral-300 text-neutral-500 dark:border-neutral-700'
                }`}
              >
                {employee.status}
              </span>
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">
              Employee #: {employee.employeeNo} • {employee.user.email}
            </p>
          </div>
        </div>
      </div>

      {saveError && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Update Failed</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{saveError}</div>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="p-3 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Employee profile updated successfully.</span>
        </div>
      )}

      {/* Form / Details Card */}
      <form
        onSubmit={handleUpdate}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-6"
      >
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pb-2">
            General Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                First Name
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Last Name
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Position
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Department
              </label>
              <select
                disabled={!canEdit}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              >
                <option value="">None (Unassigned)</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Direct Manager
              </label>
              <select
                disabled={!canEdit}
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              >
                <option value="">None (Reports to Dept Head / Exec)</option>
                {managers
                  .filter((m) => m.id !== employee.id)
                  .map((mgr) => (
                    <option key={mgr.id} value={mgr.id}>
                      {mgr.firstName} {mgr.lastName} ({mgr.position})
                    </option>
                  ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Date of Hire
              </label>
              <input
                type="text"
                disabled
                value={new Date(employee.hireDate).toLocaleDateString()}
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 opacity-60"
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pb-2">
            Contact Information
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Phone Number
              </label>
              <input
                type="tel"
                disabled={!canEdit}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 9XX XXX XXXX"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Residential Address
              </label>
              <input
                type="text"
                disabled={!canEdit}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="City, Province"
                className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 disabled:opacity-60 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              />
            </div>
          </div>
        </div>

        {/* Roles assignment card */}
        {can('role.assign') && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              Roles & Permissions
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'] as const).map((role) => (
                <label
                  key={role}
                  className="flex items-center gap-2 p-2.5 rounded border border-neutral-200 dark:border-neutral-800 text-xs font-medium text-neutral-900 dark:text-neutral-100 cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                >
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    disabled={role === 'EMPLOYEE'}
                    onChange={() => handleRoleToggle(role)}
                    className="rounded border-neutral-300"
                  />
                  <span>{role}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {canEdit && (
          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>

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
