'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge, LeaveStatus } from '@/components/status-badge';
import {
  CheckSquare,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  ArrowRight,
  Filter,
  ShieldCheck,
  UserCheck,
  Users,
  CalendarDays,
  Briefcase,
  MapPin,
  Check,
  X,
} from 'lucide-react';

interface Approver {
  firstName: string;
  lastName: string;
  position: string;
}

interface ApprovalRecord {
  id: string;
  step: 'MANAGER' | 'HR';
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: string;
  approver: Approver;
}

interface AwaitingLeaveRequest {
  id: string;
  employeeId: string;
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
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNo: string;
    position: string;
    department?: { name: string };
    managerId?: string | null;
    manager?: { id: string; firstName: string; lastName: string } | null;
    user?: { roles: string[] };
  };
  approvals: ApprovalRecord[];
}

export default function ApprovalsPage() {
  const { user, can } = useAuth();
  const [requests, setRequests] = useState<AwaitingLeaveRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'awaiting' | 'all_pending'>('awaiting');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Approval category: 'leave' | 'attendance'
  const [approvalCategory, setApprovalCategory] = useState<'leave' | 'attendance'>('leave');
  const [attendanceRequests, setAttendanceRequests] = useState<any[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceDecisionItem, setAttendanceDecisionItem] = useState<any | null>(null);
  const [attendanceDecisionAction, setAttendanceDecisionAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [attendanceComment, setAttendanceComment] = useState('');
  const [isSubmittingAttendanceDecision, setIsSubmittingAttendanceDecision] = useState(false);

  // Decision Modal State
  const [activeItem, setActiveItem] = useState<AwaitingLeaveRequest | null>(null);
  const [decisionModal, setDecisionModal] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const isHrOrAdmin = can('leave.approve.hr');
  const isManager = can('leave.approve.manager');

  const fetchRequests = async (scope: 'awaiting' | 'all_pending') => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api<AwaitingLeaveRequest[]>(`/leave/requests?scope=${scope}`);
      setRequests(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch pending approvals');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests(activeTab);
  }, [activeTab]);

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem || !decisionModal) return;
    setDecisionError(null);

    if (decisionModal === 'REJECTED' && !comment.trim()) {
      setDecisionError('A reason is required to reject this request.');
      return;
    }

    try {
      setIsSubmitting(true);
      await api(`/leave/requests/${activeItem.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionModal,
          comment: comment.trim() || undefined,
        }),
      });

      // Close modal and refresh list
      setDecisionModal(null);
      setActiveItem(null);
      setComment('');
      await fetchRequests(activeTab);
    } catch (err: any) {
      setDecisionError(err instanceof ApiError ? err.message : 'Failed to record decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchAttendanceRequests = async () => {
    if (!can('attendance.approve')) return;
    try {
      setIsLoadingAttendance(true);
      const data = await api<any[]>('/attendance/corrections?scope=awaiting');
      setAttendanceRequests(data);
    } catch (err) {
      console.error('Failed to fetch attendance corrections:', err);
    } finally {
      setIsLoadingAttendance(false);
    }
  };

  useEffect(() => {
    fetchAttendanceRequests();
  }, []);

  const handleAttendanceDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attendanceDecisionItem) return;
    try {
      setIsSubmittingAttendanceDecision(true);
      await api(`/attendance/corrections/${attendanceDecisionItem.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: attendanceDecisionAction,
          comment: attendanceComment.trim() || undefined,
        }),
      });
      setAttendanceDecisionItem(null);
      setAttendanceComment('');
      await fetchAttendanceRequests();
    } catch (err: any) {
      alert(err instanceof ApiError ? err.message : 'Failed to record decision');
    } finally {
      setIsSubmittingAttendanceDecision(false);
    }
  };

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
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Leave Approvals</h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                {requests.length} {activeTab === 'awaiting' ? 'actionable' : 'pending'}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Review and authorize leave requests. Employee requests require 2-step verification (Manager → HR), while Manager/HR requests need only 1 approval.
          </p>
        </div>

        {/* Tab Filters */}
        {(isHrOrAdmin || isManager) && (
          <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700 self-start md:self-auto">
            <button
              onClick={() => setActiveTab('awaiting')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'awaiting'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              Awaiting My Action
            </button>
            <button
              onClick={() => setActiveTab('all_pending')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'all_pending'
                  ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white shadow-sm'
                  : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
              }`}
            >
              All Organization Pending
            </button>
          </div>
        )}
      </div>

      {/* Category Tabs: Leave vs Attendance & OB */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-px">
        <button
          onClick={() => setApprovalCategory('leave')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
            approvalCategory === 'leave'
              ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <CalendarDays className="w-4 h-4" /> Leave Requests
          {requests.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
              {requests.length}
            </span>
          )}
        </button>

        {can('attendance.approve') && (
          <button
            onClick={() => setApprovalCategory('attendance')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${
              approvalCategory === 'attendance'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Clock className="w-4 h-4" /> Attendance & OB Slips
            {attendanceRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                {attendanceRequests.length}
              </span>
            )}
          </button>
        )}
      </div>

      {approvalCategory === 'leave' && error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
              Error loading approvals
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* Main Table Card (Leave Requests) */}
      {approvalCategory === 'leave' && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading pending leave requests...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <CheckSquare className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              All Caught Up!
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              {activeTab === 'awaiting'
                ? 'There are currently no leave requests awaiting your review or decision.'
                : 'There are no active pending requests in the organization.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Dates</th>
                  <th className="px-5 py-3">Days</th>
                  <th className="px-5 py-3">Approval Workflow</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {requests.map((item) => {
                  const filerRoles = item.employee.user?.roles || [];
                  const isFilerMgmt = filerRoles.some((r) =>
                    ['MANAGER', 'HR', 'ADMIN'].includes(r),
                  );

                  // Current user capability check
                  const isDirectManager =
                    can('leave.approve.manager') &&
                    item.employee.managerId === user?.employeeId &&
                    item.employeeId !== user?.employeeId;

                  const isHr =
                    can('leave.approve.hr') && item.employeeId !== user?.employeeId;

                  // Management filers: direct manager or HR can decide
                  // Regular employee: direct manager can decide at PENDING_MANAGER, HR at PENDING_HR
                  const canUserDecide =
                    (item.status === 'PENDING_MANAGER' || item.status === 'PENDING_HR') &&
                    (isFilerMgmt
                      ? isDirectManager || isHr
                      : (item.status === 'PENDING_MANAGER' && isDirectManager) ||
                        (item.status === 'PENDING_HR' && isHr));

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                          <span>
                            {item.employee.firstName} {item.employee.lastName}
                          </span>
                          {isFilerMgmt && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
                              {filerRoles.find((r) => ['ADMIN', 'HR', 'MANAGER'].includes(r)) || 'MGMT'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                          <span>{item.employee.position}</span>
                          <span>•</span>
                          <span>{item.employee.employeeNo}</span>
                          {item.employee.department && (
                            <>
                              <span>•</span>
                              <span>{item.employee.department.name}</span>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {item.leaveType.name}
                        </div>
                        <div className="text-xs font-mono text-neutral-500">
                          {item.leaveType.code}
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                        <div>
                          {formatDate(item.startDate)}
                          {item.startDate !== item.endDate && ` – ${formatDate(item.endDate)}`}
                        </div>
                        <div className="text-xs text-neutral-400 italic truncate max-w-xs mt-0.5">
                          "{item.reason}"
                        </div>
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap font-medium text-neutral-900 dark:text-neutral-100">
                        {item.days} {item.days === 1 ? 'day' : 'days'}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap">
                        {isFilerMgmt ? (
                          <div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <ShieldCheck className="w-3 h-3" />
                              1-Step: Manager or HR
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                              Either Manager or HR can approve
                            </div>
                          </div>
                        ) : item.status === 'PENDING_MANAGER' ? (
                          <div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                              <Clock className="w-3 h-3" />
                              Step 1 of 2: Manager Review
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                              Manager: {item.employee.manager ? `${item.employee.manager.firstName} ${item.employee.manager.lastName}` : 'Unassigned'}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <UserCheck className="w-3 h-3" />
                              Step 2 of 2: HR Policy
                            </div>
                            <div className="text-[11px] text-neutral-500 mt-1">
                              Manager approved • Awaiting HR
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-2">
                          {canUserDecide ? (
                            <>
                              <button
                                onClick={() => {
                                  setActiveItem(item);
                                  setDecisionModal('REJECTED');
                                  setComment('');
                                  setDecisionError(null);
                                }}
                                className="px-2.5 py-1 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                              >
                                Reject
                              </button>
                              <button
                                onClick={() => {
                                  setActiveItem(item);
                                  setDecisionModal('APPROVED');
                                  setComment('');
                                  setDecisionError(null);
                                }}
                                className="px-2.5 py-1 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
                              >
                                Approve
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400 italic">
                              {item.status === 'PENDING_MANAGER' ? 'Awaiting Manager' : 'Awaiting HR'}
                            </span>
                          )}
                          <Link
                            href={`/leave/${item.id}`}
                            className="p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
                            title="View Full Details"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {/* Attendance & OB Approvals View */}
      {approvalCategory === 'attendance' && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
          {isLoadingAttendance ? (
            <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
              <Loader2 className="w-6 h-6 animate-spin mb-3" />
              <p className="text-sm">Loading pending attendance requests...</p>
            </div>
          ) : attendanceRequests.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <CheckSquare className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                All Caught Up!
              </h3>
              <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                There are currently no official business slips or attendance correction requests awaiting your action.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {attendanceRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                        {req.employee?.firstName} {req.employee?.lastName}
                      </span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        ({req.employee?.position} • {req.employee?.department?.name || 'General'})
                      </span>
                      {req.type === 'OFFICIAL_BUSINESS' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          Official Business (OB) Slip
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Missed Punch Correction
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-neutral-600 dark:text-neutral-300 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div>
                        <span className="text-neutral-400">Date:</span> {formatDate(req.date)}
                      </div>
                      {req.type === 'OFFICIAL_BUSINESS' ? (
                        <div>
                          <span className="text-neutral-400">Destination:</span> {req.destination || 'Field Client Site'}
                        </div>
                      ) : (
                        <div className="font-mono">
                          <span className="text-neutral-400 font-sans">Proposed:</span> In {req.proposedTimeIn ? new Date(req.proposedTimeIn).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--'} → Out {req.proposedTimeOut ? new Date(req.proposedTimeOut).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '--'}
                        </div>
                      )}
                      <div>
                        <span className="text-neutral-400">Location:</span> {req.locationType}
                      </div>
                    </div>

                    <div className="text-xs bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 rounded-lg p-2.5 text-neutral-700 dark:text-neutral-300">
                      <span className="font-semibold text-neutral-500 dark:text-neutral-400 mr-1.5">Reason:</span>
                      {req.reason}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setAttendanceDecisionItem(req);
                        setAttendanceDecisionAction('APPROVE');
                        setAttendanceComment('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAttendanceDecisionItem(req);
                        setAttendanceDecisionAction('REJECT');
                        setAttendanceComment('');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attendance Decision Modal */}
      {attendanceDecisionItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleAttendanceDecisionSubmit}
            className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                {attendanceDecisionAction === 'APPROVE' ? 'Approve' : 'Reject'} Attendance Request
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                {attendanceDecisionItem.employee?.firstName} {attendanceDecisionItem.employee?.lastName} • {attendanceDecisionItem.type === 'OFFICIAL_BUSINESS' ? 'OB Slip' : 'Missed Punch'} ({formatDate(attendanceDecisionItem.date)})
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Comments / Decision Note (Optional)
              </label>
              <textarea
                value={attendanceComment}
                onChange={(e) => setAttendanceComment(e.target.value)}
                rows={3}
                placeholder="Add optional notes for the employee..."
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setAttendanceDecisionItem(null)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingAttendanceDecision}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded text-white ${
                  attendanceDecisionAction === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                } disabled:opacity-50`}
              >
                {isSubmittingAttendanceDecision && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm {attendanceDecisionAction === 'APPROVE' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Decision Modal */}
      {decisionModal && activeItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleDecisionSubmit}
            className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl"
          >
            <div>
              <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                {decisionModal === 'APPROVED' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h3>
              <p className="text-xs text-neutral-500 mt-1">
                {activeItem.employee.firstName} {activeItem.employee.lastName} • {activeItem.leaveType.name} (
                {activeItem.days} {activeItem.days === 1 ? 'day' : 'days'})
              </p>
            </div>

            {decisionError && (
              <div className="p-2.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{decisionError}</span>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                {decisionModal === 'REJECTED' ? 'Reason for Rejection *' : 'Comments / Remarks (Optional)'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={
                  decisionModal === 'REJECTED'
                    ? 'State why this request cannot be approved...'
                    : 'Add any optional comments...'
                }
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required={decisionModal === 'REJECTED'}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDecisionModal(null);
                  setActiveItem(null);
                }}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm {decisionModal === 'APPROVED' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
