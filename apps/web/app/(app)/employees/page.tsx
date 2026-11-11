'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { UserAvatar } from '@/components/user-avatar';
import {
  Users,
  Search,
  Plus,
  Loader2,
  AlertCircle,
  Shield,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface EmployeeItem {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string;
  gender?: string;
  avatarUrl?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  hireDate: string;
  user?: {
    email: string;
    roles: string[];
    active: boolean;
  };
  department?: {
    id: string;
    name: string;
  };
  manager?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

interface EmployeesResponse {
  data: EmployeeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function EmployeesPage() {
  const { can } = useAuth();
  const [employees, setEmployees] = useState<EmployeeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEmployees = async (currentPage = 1, currentSearch = '', currentStatus = 'ACTIVE') => {
    try {
      setIsLoading(true);
      setError(null);
      let query = `/employees?page=${currentPage}&pageSize=15`;
      if (currentSearch.trim()) query += `&search=${encodeURIComponent(currentSearch.trim())}`;
      if (currentStatus !== 'ALL') query += `&status=${currentStatus}`;

      const res = await api<EmployeesResponse>(query);
      setEmployees(res.data);
      setTotal(res.total);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load employee directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees(page, search, statusFilter);
  }, [page, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchEmployees(1, search, statusFilter);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Employee Directory</h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                {total} {total === 1 ? 'employee' : 'employees'}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Manage organization members, departments, reporting structures, and access roles.
          </p>
        </div>

        {can('employee.write') && (
          <div>
            <Link
              href="/employees/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 rounded-md text-sm font-medium hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Employee
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
              Error loading employees
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Controls: Search and Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, employee #, email..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
          />
        </form>

        <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-800 p-0.5 bg-neutral-100 dark:bg-neutral-900 text-xs self-start sm:self-auto">
          {(['ACTIVE', 'INACTIVE', 'ALL'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded font-medium transition-colors ${
                statusFilter === tab
                  ? 'bg-white dark:bg-black text-neutral-900 dark:text-neutral-100 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100'
              }`}
            >
              {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Users className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              No Employees Found
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              No employee records match the given search criteria or filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Position</th>
                  <th className="px-5 py-3">Direct Manager</th>
                  <th className="px-5 py-3">Roles</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {employees.map((emp) => (
                  <tr
                    key={emp.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          src={emp.avatarUrl}
                          gender={emp.gender}
                          alt={`${emp.firstName} ${emp.lastName}`}
                          size="sm"
                        />
                        <div>
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {emp.firstName} {emp.lastName}
                          </div>
                          <div className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono">{emp.employeeNo}</span>
                            <span>•</span>
                            <span>{emp.user?.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-700 dark:text-neutral-300">
                      {emp.department?.name || '—'}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-700 dark:text-neutral-300 font-medium">
                      {emp.position}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400 text-xs">
                      {emp.manager ? `${emp.manager.firstName} ${emp.manager.lastName}` : 'None (Executive)'}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">
                        {emp.user?.roles.map((role) => (
                          <span
                            key={role}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono font-medium"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          emp.status === 'ACTIVE'
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'border border-neutral-300 text-neutral-500 dark:border-neutral-700'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <Link
                        href={`/employees/${emp.id}`}
                        className="font-medium text-xs text-neutral-900 dark:text-neutral-100 hover:underline"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
            <div>
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
