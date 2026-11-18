'use client';

import { DetailPageSkeleton } from '@/components/skeletons';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, downloadStorageFile } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge, LeaveStatus } from '@/components/status-badge';
import {
  ArrowLeft,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  User,
  Building,
  Paperclip,
  Download,
} from 'lucide-react';

interface ApprovalRecord {
  id: string;
  step: 'MANAGER' | 'HR';
  decision: 'APPROVED' | 'REJECTED';
  comment: string | null;
  decidedAt: string;
  approver: {
    firstName: string;
    lastName: string;
    position: string;
  };
}

interface LeaveRequestDetail {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  attachmentKey?: string | null;
  attachmentName?: string | null;
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

export default function LeaveDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, can } = useAuth();
  const id = params?.id as string;

  const [request, setRequest] = useState<LeaveRequestDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Cancel dialog state
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);

  // Decision dialog state (for manager/HR)
  const [decisionModal, setDecisionModal] = useState<'APPROVED' | 'REJECTED' | null>(null);
  const [decisionComment, setDecisionComment] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [isDownloadingAttachment, setIsDownloadingAttachment] = useState(false);
  const [attachmentDownloadError, setAttachmentDownloadError] = useState<string | null>(null);

  const handleDownloadAttachment = async () => {
    if (!request?.attachmentKey) return;
    try {
      setAttachmentDownloadError(null);
      setIsDownloadingAttachment(true);
      await downloadStorageFile(
        request.attachmentKey,
        request.attachmentName || undefined,
      );
    } catch (err: unknown) {
      setAttachmentDownloadError(
        err instanceof ApiError ? err.message : 'Failed to download supporting document',
      );
    } finally {
      setIsDownloadingAttachment(false);
    }
  };

  const fetchDetail = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api<LeaveRequestDetail>(`/leave/requests/${id}`);
      setRequest(data);
      setEditStartDate(data.startDate.slice(0, 10));
      setEditEndDate(data.endDate.slice(0, 10));
      setEditReason(data.reason);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load request details');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchDetail();
    }
  }, [id]);

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    try {
      setIsSubmittingEdit(true);
      const updated = await api<LeaveRequestDetail>(`/leave/requests/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          startDate: editStartDate,
          endDate: editEndDate,
          reason: editReason.trim(),
        }),
      });
      setIsEditing(false);
      await fetchDetail();
    } catch (err: any) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to update request');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleCancel = async () => {
    try {
      setIsCancelling(true);
      await api(`/leave/requests/${id}/cancel`, { method: 'POST' });
      setShowCancelModal(false);
      await fetchDetail();
    } catch (err: any) {
      alert(err instanceof ApiError ? err.message : 'Failed to cancel request');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModal) return;
    setDecisionError(null);

    if (decisionModal === 'REJECTED' && !decisionComment.trim()) {
      setDecisionError('A reason is required to reject this request.');
      return;
    }

    try {
      setIsSubmittingDecision(true);
      await api(`/leave/requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionModal,
          comment: decisionComment.trim() || undefined,
        }),
      });
      setDecisionModal(null);
      setDecisionComment('');
      await fetchDetail();
    } catch (err: any) {
      setDecisionError(err instanceof ApiError ? err.message : 'Failed to record decision');
    } finally {
      setIsSubmittingDecision(false);
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

  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return <DetailPageSkeleton cards={2} />;
  }

  if (error || !request) {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-4 text-center">
        <AlertCircle className="w-10 h-10 mx-auto text-neutral-400" />
        <h2 className="text-lg font-bold">Request Not Found</h2>
        <p className="text-sm text-neutral-500">{error || 'Unable to locate this leave request.'}</p>
        <Link
          href="/leave"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Leave
        </Link>
      </div>
    );
  }

  const isRequester = user?.employeeId === request.employeeId;
  const canEdit = isRequester && request.status === 'PENDING_MANAGER';
  const canCancel = isRequester && ['PENDING_MANAGER', 'PENDING_HR'].includes(request.status);

  const filerRoles = request.employee.user?.roles || [];
  const isFilerMgmt = filerRoles.some((r: string) => ['MANAGER', 'HR', 'ADMIN'].includes(r));

  // Decision capability check
  const isDirectManager =
    can('leave.approve.manager') &&
    request.employee.managerId === user?.employeeId &&
    request.employeeId !== user?.employeeId;

  const isHrApprover =
    can('leave.approve.hr') &&
    request.employeeId !== user?.employeeId;

  // Management filers: 1-step approval where either manager OR HR can decide
  // Regular employee filers: strictly 2-step (manager decides at PENDING_MANAGER, HR at PENDING_HR)
  const canDecide =
    (request.status === 'PENDING_MANAGER' || request.status === 'PENDING_HR') &&
    (isFilerMgmt
      ? isDirectManager || isHrApprover
      : (request.status === 'PENDING_MANAGER' && isDirectManager) ||
        (request.status === 'PENDING_HR' && isHrApprover));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/leave"
            className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{request.leaveType.name}</h1>
              <StatusBadge status={request.status} />
            </div>
            <p className="text-xs text-neutral-500 font-mono mt-0.5">Request ID: {request.id}</p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2">
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit Dates
            </button>
          )}

          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Decision Banner for Manager or HR */}
      {canDecide && (
        <div className="p-4 rounded-lg border-2 border-neutral-900 dark:border-white bg-neutral-50 dark:bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
              {isFilerMgmt
                ? 'Action Required: Manager or HR Approval (1-Step Fast Track)'
                : request.status === 'PENDING_MANAGER'
                ? 'Action Required: Step 1 of 2 – Manager Review'
                : 'Action Required: Step 2 of 2 – HR Policy Verification'}
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              {isFilerMgmt
                ? 'As a Manager or HR team member request, either direct manager or HR can authorize this request directly.'
                : request.status === 'PENDING_MANAGER'
                ? 'Please review operational team coverage and endorse this request.'
                : 'Please verify company leave policy and quota balance to finalize approval.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDecisionModal('REJECTED');
                setDecisionComment('');
                setDecisionError(null);
              }}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-800 transition-colors"
            >
              Reject...
            </button>
            <button
              onClick={() => {
                setDecisionModal('APPROVED');
                setDecisionComment('');
                setDecisionError(null);
              }}
              className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
            >
              Approve Request
            </button>
          </div>
        </div>
      )}

      {/* Main Request Information Card */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
        {/* Employee Info Header */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center font-bold text-sm">
              {request.employee.firstName[0]}
              {request.employee.lastName[0]}
            </div>
            <div>
              <div className="font-semibold text-sm">
                {request.employee.firstName} {request.employee.lastName}
              </div>
              <div className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
                <span>{request.employee.position}</span>
                <span>•</span>
                <span>{request.employee.employeeNo}</span>
              </div>
            </div>
          </div>
          <div className="text-right text-xs text-neutral-500">
            <div>Filed on</div>
            <div className="font-medium text-neutral-800 dark:text-neutral-200">
              {formatDate(request.createdAt)}
            </div>
          </div>
        </div>

        {/* Edit Form or View Details */}
        {isEditing ? (
          <form onSubmit={handleEditSubmit} className="p-5 space-y-4 bg-neutral-50/50 dark:bg-neutral-950/50">
            {editError && (
              <div className="p-3 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-800 dark:text-neutral-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Start Date
                </label>
                <input
                  type="date"
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white cursor-pointer dark:[color-scheme:dark]"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  End Date
                </label>
                <input
                  type="date"
                  value={editEndDate}
                  min={editStartDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white cursor-pointer dark:[color-scheme:dark]"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                Reason
              </label>
              <textarea
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-1.5 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingEdit}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              >
                {isSubmittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
                Duration
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {request.days} {request.days === 1 ? 'working day' : 'working days'}
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {formatDate(request.startDate)} – {formatDate(request.endDate)}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
                Leave Classification
              </div>
              <div className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                {request.leaveType.name}
              </div>
              <div className="text-xs font-mono text-neutral-500 mt-0.5">
                Type Code: {request.leaveType.code}
              </div>
            </div>

            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
                Reason
              </div>
              <div className="text-sm text-neutral-800 dark:text-neutral-200">
                {request.reason}
              </div>
            </div>
          </div>
        )}

        {request.attachmentKey && (
          <div className="px-5 py-3.5 border-t border-neutral-100 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-950/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-neutral-800 dark:text-neutral-200">
              <Paperclip className="w-4 h-4 text-neutral-500 shrink-0" />
              <span className="font-medium">Supporting Document:</span>
              <span className="text-neutral-600 dark:text-neutral-400">
                {request.attachmentName || 'Attachment'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDownloadAttachment}
              disabled={isDownloadingAttachment}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-900 dark:text-neutral-100 disabled:opacity-50 transition-colors"
            >
              {isDownloadingAttachment ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              {isDownloadingAttachment ? 'Downloading...' : 'Download Document'}
            </button>
            {attachmentDownloadError && (
              <div className="w-full text-xs text-red-600 dark:text-red-400">
                {attachmentDownloadError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Approval History / Timeline */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Approval Workflow Timeline
        </h2>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-neutral-200 dark:before:bg-neutral-800">
          {/* Step 1: Submission */}
          <div className="relative flex items-start gap-4">
            <span className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white dark:bg-neutral-900 border-2 border-neutral-900 dark:border-white flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-white" />
            </span>
            <div>
              <div className="text-xs font-medium text-neutral-900 dark:text-neutral-100">
                Application Submitted
              </div>
              <div className="text-xs text-neutral-500 mt-0.5">
                By {request.employee.firstName} {request.employee.lastName} on {formatDateTime(request.createdAt)}
              </div>
            </div>
          </div>

          {isFilerMgmt ? (
            /* 1-Step Approval Workflow for Manager / HR */
            (() => {
              const approval = request.approvals[0];
              const isPending = request.status === 'PENDING_MANAGER' || request.status === 'PENDING_HR';

              return (
                <div className="relative flex items-start gap-4">
                  <span
                    className={`absolute -left-6 top-1 w-5 h-5 rounded-full bg-white dark:bg-neutral-900 border-2 flex items-center justify-center ${
                      approval
                        ? approval.decision === 'APPROVED'
                          ? 'border-neutral-900 dark:border-white'
                          : 'border-neutral-400 dark:border-neutral-600'
                        : isPending
                        ? 'border-neutral-400 animate-pulse'
                        : 'border-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    {approval && approval.decision === 'APPROVED' ? (
                      <CheckCircle className="w-3 h-3 text-neutral-900 dark:text-white" />
                    ) : approval && approval.decision === 'REJECTED' ? (
                      <XCircle className="w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                    ) : (
                      <Clock className="w-2.5 h-2.5 text-neutral-400" />
                    )}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      1-Step Authorization (Direct Manager or HR)
                    </div>
                    {approval ? (
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {approval.decision === 'APPROVED' ? 'Approved' : 'Rejected'}
                        </span>{' '}
                        by {approval.approver.firstName} {approval.approver.lastName} ({approval.step}) on{' '}
                        {formatDateTime(approval.decidedAt)}
                        {approval.comment && (
                          <div className="mt-1.5 p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 italic">
                            "{approval.comment}"
                          </div>
                        )}
                      </div>
                    ) : isPending ? (
                      <div className="text-xs text-neutral-500 mt-0.5">
                        Awaiting 1 authorization from either direct manager or HR...
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400 mt-0.5">Cancelled</div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            /* 2-Step Approval Workflow for Regular Employee */
            <>
              {/* Step 1: Manager Approval */}
              {(() => {
                const managerApproval = request.approvals.find((a) => a.step === 'MANAGER');
                const isManagerPending = request.status === 'PENDING_MANAGER';

                return (
                  <div className="relative flex items-start gap-4">
                    <span
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full bg-white dark:bg-neutral-900 border-2 flex items-center justify-center ${
                        managerApproval
                          ? managerApproval.decision === 'APPROVED'
                            ? 'border-neutral-900 dark:border-white'
                            : 'border-neutral-400 dark:border-neutral-600'
                          : isManagerPending
                          ? 'border-neutral-400 animate-pulse'
                          : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {managerApproval && managerApproval.decision === 'APPROVED' ? (
                        <CheckCircle className="w-3 h-3 text-neutral-900 dark:text-white" />
                      ) : managerApproval && managerApproval.decision === 'REJECTED' ? (
                        <XCircle className="w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      ) : (
                        <Clock className="w-2.5 h-2.5 text-neutral-400" />
                      )}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        Step 1 of 2: Manager Review
                      </div>
                      {managerApproval ? (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {managerApproval.decision === 'APPROVED' ? 'Approved' : 'Rejected'}
                          </span>{' '}
                          by {managerApproval.approver.firstName} {managerApproval.approver.lastName} on{' '}
                          {formatDateTime(managerApproval.decidedAt)}
                          {managerApproval.comment && (
                            <div className="mt-1.5 p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 italic">
                              "{managerApproval.comment}"
                            </div>
                          )}
                        </div>
                      ) : isManagerPending ? (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Awaiting manager operational verification...
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400 mt-0.5">Skipped or not required</div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Step 2: HR Policy Approval */}
              {(() => {
                const hrApproval = request.approvals.find((a) => a.step === 'HR');
                const isHrPending = request.status === 'PENDING_HR';

                return (
                  <div className="relative flex items-start gap-4">
                    <span
                      className={`absolute -left-6 top-1 w-5 h-5 rounded-full bg-white dark:bg-neutral-900 border-2 flex items-center justify-center ${
                        hrApproval
                          ? hrApproval.decision === 'APPROVED'
                            ? 'border-neutral-900 dark:border-white'
                            : 'border-neutral-400 dark:border-neutral-600'
                          : isHrPending
                          ? 'border-neutral-400 animate-pulse'
                          : 'border-neutral-300 dark:border-neutral-700'
                      }`}
                    >
                      {hrApproval && hrApproval.decision === 'APPROVED' ? (
                        <CheckCircle className="w-3 h-3 text-neutral-900 dark:text-white" />
                      ) : hrApproval && hrApproval.decision === 'REJECTED' ? (
                        <XCircle className="w-3 h-3 text-neutral-600 dark:text-neutral-400" />
                      ) : (
                        <Clock className="w-2.5 h-2.5 text-neutral-400" />
                      )}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        Step 2 of 2: HR Policy & Quota Verification
                      </div>
                      {hrApproval ? (
                        <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">
                            {hrApproval.decision === 'APPROVED' ? 'Approved' : 'Rejected'}
                          </span>{' '}
                          by {hrApproval.approver.firstName} {hrApproval.approver.lastName} on{' '}
                          {formatDateTime(hrApproval.decidedAt)}
                          {hrApproval.comment && (
                            <div className="mt-1.5 p-2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 italic">
                              "{hrApproval.comment}"
                            </div>
                          )}
                        </div>
                      ) : isHrPending ? (
                        <div className="text-xs text-neutral-500 mt-0.5">
                          Awaiting HR final review and quota deduction...
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400 mt-0.5">Pending earlier step completion</div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Cancel Leave Request?
            </h3>
            <p className="text-xs text-neutral-500">
              Are you sure you want to cancel this leave application? This will release the requested days back to your available balance.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Keep Request
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={isCancelling}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal (Approve or Reject) */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={handleDecision}
            className="max-w-md w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4 shadow-xl"
          >
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              {decisionModal === 'APPROVED' ? 'Approve Leave Request' : 'Reject Leave Request'}
            </h3>
            <p className="text-xs text-neutral-500">
              {decisionModal === 'APPROVED'
                ? 'Confirming approval for this request. An optional remark can be added.'
                : 'A reason or comment is required when rejecting a leave application.'}
            </p>

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
                value={decisionComment}
                onChange={(e) => setDecisionComment(e.target.value)}
                rows={3}
                placeholder={
                  decisionModal === 'REJECTED'
                    ? 'State why this leave request cannot be approved...'
                    : 'Notes or instructions for the employee...'
                }
                className="w-full px-3 py-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                required={decisionModal === 'REJECTED'}
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingDecision}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 disabled:opacity-50"
              >
                {isSubmittingDecision && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm {decisionModal === 'APPROVED' ? 'Approval' : 'Rejection'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
