'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  Clock,
  MapPin,
  Calendar,
  CheckCircle,
  CheckSquare,
  AlertTriangle,
  Briefcase,
  FileCheck,
  Building,
  Laptop,
  Check,
  X,
  Plus,
  Users,
  Search,
  Filter,
  ArrowRight,
  Info,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface AttendanceRecord {
  id: string;
  date: string;
  timeIn: string | null;
  timeOut: string | null;
  locationType: 'OFFICE' | 'FIELD_CLIENT_SITE' | 'REMOTE_WFH';
  source: 'WEB_PUNCH' | 'BIOMETRIC_DEVICE' | 'CORRECTION_OB' | 'SYSTEM_AUTO';
  status:
    | 'PRESENT'
    | 'LATE'
    | 'UNDERTIME'
    | 'ABSENT'
    | 'OFFICIAL_BUSINESS'
    | 'ON_LEAVE'
    | 'HOLIDAY'
    | 'REST_DAY';
  lateMinutes: number;
  undertimeMinutes: number;
  notes: string | null;
}

interface AttendanceCorrectionRequest {
  id: string;
  employeeId: string;
  date: string;
  type: 'MISSED_PUNCH' | 'OFFICIAL_BUSINESS';
  proposedTimeIn: string | null;
  proposedTimeOut: string | null;
  locationType: 'OFFICE' | 'FIELD_CLIENT_SITE' | 'REMOTE_WFH';
  destination: string | null;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNo: string;
    position: string;
    department?: { name: string };
  };
  decidedBy?: {
    firstName: string;
    lastName: string;
  } | null;
}

interface TeamMemberAttendance {
  employeeId: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  attendance: AttendanceRecord | null;
}

function AttendanceContent() {
  const { user, can } = useAuth();
  const searchParams = useSearchParams();

  // Permissions
  const canPunch = can('attendance.punch');
  const canApprove = can('attendance.approve');
  const isHrOrAdmin = can('attendance.view.all') || can('attendance.manage');

  // Tabs: 'dtr' | 'ob_requests' | 'team' | 'approvals'
  const initialTab = (searchParams.get('tab') as any) || 'dtr';
  const [activeTab, setActiveTab] = useState<'dtr' | 'ob_requests' | 'team' | 'approvals'>(initialTab);

  // Live Philippines Standard Time clock
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  // Today state
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [punchLocation, setPunchLocation] = useState<'OFFICE' | 'FIELD_CLIENT_SITE' | 'REMOTE_WFH'>('OFFICE');
  const [punchNotes, setPunchNotes] = useState('');
  const [isPunching, setIsPunching] = useState(false);
  const [punchError, setPunchError] = useState<string | null>(null);

  // My DTR State
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [myDtr, setMyDtr] = useState<AttendanceRecord[]>([]);
  const [isLoadingDtr, setIsLoadingDtr] = useState(false);

  // OB / Correction Requests State
  const [corrections, setCorrections] = useState<AttendanceCorrectionRequest[]>([]);
  const [isLoadingCorrections, setIsLoadingCorrections] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newReqType, setNewReqType] = useState<'OFFICIAL_BUSINESS' | 'MISSED_PUNCH'>('OFFICIAL_BUSINESS');
  const [newReqDate, setNewReqDate] = useState(new Date().toISOString().slice(0, 10));
  const [newReqLocation, setNewReqLocation] = useState<'OFFICE' | 'FIELD_CLIENT_SITE' | 'REMOTE_WFH'>('FIELD_CLIENT_SITE');
  const [newReqDestination, setNewReqDestination] = useState('');
  const [newReqTimeIn, setNewReqTimeIn] = useState('09:00');
  const [newReqTimeOut, setNewReqTimeOut] = useState('18:00');
  const [newReqReason, setNewReqReason] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [reqModalError, setReqModalError] = useState<string | null>(null);

  // Team Attendance State
  const [teamDate, setTeamDate] = useState(new Date().toISOString().slice(0, 10));
  const [teamList, setTeamList] = useState<TeamMemberAttendance[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');

  // Approvals State
  const [pendingApprovals, setPendingApprovals] = useState<AttendanceCorrectionRequest[]>([]);
  const [isLoadingApprovals, setIsLoadingApprovals] = useState(false);
  const [decisionModalItem, setDecisionModalItem] = useState<AttendanceCorrectionRequest | null>(null);
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [decisionComment, setDecisionComment] = useState('');
  const [isSubmittingDecision, setIsSubmittingDecision] = useState(false);

  // Update clock every second
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch today's punch status
  const fetchToday = async () => {
    try {
      const data = await api<AttendanceRecord | null>('/attendance/today');
      setTodayRecord(data);
      if (data?.locationType) {
        setPunchLocation(data.locationType);
      }
    } catch (err: any) {
      console.error('Failed to fetch today attendance:', err);
    }
  };

  // Fetch My DTR
  const fetchMyDtr = async (month: string) => {
    try {
      setIsLoadingDtr(true);
      const data = await api<AttendanceRecord[]>(`/attendance/my-dtr?month=${month}`);
      setMyDtr(data);
    } catch (err: any) {
      console.error('Failed to fetch DTR:', err);
    } finally {
      setIsLoadingDtr(false);
    }
  };

  // Fetch Corrections
  const fetchCorrections = async () => {
    try {
      setIsLoadingCorrections(true);
      const data = await api<AttendanceCorrectionRequest[]>('/attendance/corrections?scope=mine');
      setCorrections(data);
    } catch (err: any) {
      console.error('Failed to fetch corrections:', err);
    } finally {
      setIsLoadingCorrections(false);
    }
  };

  // Fetch Team Attendance
  const fetchTeam = async (date: string) => {
    if (!canApprove) return;
    try {
      setIsLoadingTeam(true);
      const data = await api<TeamMemberAttendance[]>(`/attendance/team-dtr?date=${date}`);
      setTeamList(data);
    } catch (err: any) {
      console.error('Failed to fetch team attendance:', err);
    } finally {
      setIsLoadingTeam(false);
    }
  };

  // Fetch Pending Approvals
  const fetchPendingApprovals = async () => {
    if (!canApprove) return;
    try {
      setIsLoadingApprovals(true);
      const data = await api<AttendanceCorrectionRequest[]>('/attendance/corrections?scope=awaiting');
      setPendingApprovals(data);
    } catch (err: any) {
      console.error('Failed to fetch pending approvals:', err);
    } finally {
      setIsLoadingApprovals(false);
    }
  };

  useEffect(() => {
    fetchToday();
  }, []);

  useEffect(() => {
    if (activeTab === 'dtr') {
      fetchMyDtr(selectedMonth);
    } else if (activeTab === 'ob_requests') {
      fetchCorrections();
    } else if (activeTab === 'team') {
      fetchTeam(teamDate);
    } else if (activeTab === 'approvals') {
      fetchPendingApprovals();
    }
  }, [activeTab, selectedMonth, teamDate]);

  // Handle Punch In / Out
  const handlePunch = async () => {
    try {
      setIsPunching(true);
      setPunchError(null);
      const res = await api<{ action: string; record: AttendanceRecord }>('/attendance/punch', {
        method: 'POST',
        body: JSON.stringify({
          locationType: punchLocation,
          notes: punchNotes.trim() || undefined,
        }),
      });
      setTodayRecord(res.record);
      setPunchNotes('');
      // Refresh current month DTR
      fetchMyDtr(selectedMonth);
    } catch (err: any) {
      setPunchError(err instanceof ApiError ? err.message : 'Punch action failed');
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Create Correction / OB Request
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingReq(true);
      setReqModalError(null);

      const payload: any = {
        type: newReqType,
        date: newReqDate,
        locationType: newReqLocation,
        reason: newReqReason.trim(),
      };

      if (newReqType === 'OFFICIAL_BUSINESS') {
        payload.destination = newReqDestination.trim();
      } else {
        payload.proposedTimeIn = `${newReqDate}T${newReqTimeIn}:00.000Z`;
        payload.proposedTimeOut = `${newReqDate}T${newReqTimeOut}:00.000Z`;
      }

      await api('/attendance/corrections', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setIsCreateModalOpen(false);
      setNewReqReason('');
      setNewReqDestination('');
      fetchCorrections();
    } catch (err: any) {
      setReqModalError(err instanceof ApiError ? err.message : 'Failed to submit request');
    } finally {
      setIsSubmittingReq(false);
    }
  };

  // Handle Decide Request
  const handleDecideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionModalItem) return;

    try {
      setIsSubmittingDecision(true);
      await api(`/attendance/corrections/${decisionModalItem.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionAction,
          comment: decisionComment.trim() || undefined,
        }),
      });

      setDecisionModalItem(null);
      setDecisionComment('');
      fetchPendingApprovals();
    } catch (err: any) {
      alert(err instanceof ApiError ? err.message : 'Decision submission failed');
    } finally {
      setIsSubmittingDecision(false);
    }
  };

  // Compute DTR Summary
  const presentDays = myDtr.filter((r) => r.status === 'PRESENT' || r.status === 'LATE' || r.status === 'UNDERTIME').length;
  const obDays = myDtr.filter((r) => r.status === 'OFFICIAL_BUSINESS').length;
  const leaveDays = myDtr.filter((r) => r.status === 'ON_LEAVE').length;
  const totalLateMins = myDtr.reduce((acc, r) => acc + (r.lateMinutes || 0), 0);
  const totalUnderMins = myDtr.reduce((acc, r) => acc + (r.undertimeMinutes || 0), 0);
  const absentDays = myDtr.filter((r) => r.status === 'ABSENT').length;

  const formatTimeOnly = (isoString?: string | null) => {
    if (!isoString) return '--:--';
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(isoString));
    } catch {
      return '--:--';
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: AttendanceRecord['status']) => {
    switch (status) {
      case 'PRESENT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            Present
          </span>
        );
      case 'OFFICIAL_BUSINESS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
            Official Business (OB)
          </span>
        );
      case 'LATE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Late
          </span>
        );
      case 'UNDERTIME':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
            Undertime
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            On Leave
          </span>
        );
      case 'HOLIDAY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            Holiday
          </span>
        );
      case 'REST_DAY':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300">
            Rest Day
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            Absent
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const getLocationBadge = (loc: AttendanceRecord['locationType']) => {
    switch (loc) {
      case 'OFFICE':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-300">
            <Building className="w-3.5 h-3.5 text-neutral-500" /> Office
          </span>
        );
      case 'FIELD_CLIENT_SITE':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium">
            <MapPin className="w-3.5 h-3.5 text-blue-500" /> Client Site / Field
          </span>
        );
      case 'REMOTE_WFH':
        return (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <Laptop className="w-3.5 h-3.5 text-emerald-500" /> Remote / WFH
          </span>
        );
      default:
        return null;
    }
  };

  const isClockedIn = Boolean(todayRecord?.timeIn);
  const isClockedOut = Boolean(todayRecord?.timeOut);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 flex items-center gap-2.5">
            <Clock className="w-7 h-7 text-primary-600 dark:text-primary-400" />
            Attendance & Daily Time Record (DTR)
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
            Official DOLE-compliant attendance tracking, field deployment passes, and time records.
          </p>
        </div>

        {/* Live Philippine Standard Time Badge */}
        <div className="flex items-center gap-3 bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700/80 rounded-xl px-4 py-2.5 shadow-sm">
          <Clock className="w-5 h-5 text-primary-600 dark:text-primary-400 animate-pulse" />
          <div>
            <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">
              Philippine Standard Time (GMT+8)
            </div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tabular-nums">
              {currentTime
                ? new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Manila',
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true,
                  }).format(currentTime)
                : 'Loading clock...'}
            </div>
          </div>
        </div>
      </div>

      {/* Clock In / Out Quick Punch Hero */}
      <div className="bg-gradient-to-br from-white to-neutral-50 dark:from-neutral-900 dark:to-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Status Column */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Today's Punch Status
              </span>
              {todayRecord && getStatusBadge(todayRecord.status)}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700/80 rounded-xl p-3.5">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Time In</div>
                <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums mt-0.5">
                  {formatTimeOnly(todayRecord?.timeIn)}
                </div>
                {todayRecord?.lateMinutes ? (
                  <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mt-1">
                    Late by {todayRecord.lateMinutes} mins
                  </div>
                ) : isClockedIn ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    On Time (Grace: 15m)
                  </div>
                ) : null}
              </div>

              <div className="bg-white dark:bg-neutral-800/90 border border-neutral-200 dark:border-neutral-700/80 rounded-xl p-3.5">
                <div className="text-xs text-neutral-500 dark:text-neutral-400">Time Out</div>
                <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tabular-nums mt-0.5">
                  {formatTimeOnly(todayRecord?.timeOut)}
                </div>
                {todayRecord?.undertimeMinutes ? (
                  <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mt-1">
                    Undertime: {todayRecord.undertimeMinutes} mins
                  </div>
                ) : isClockedOut ? (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    Full Shift Completed
                  </div>
                ) : null}
              </div>
            </div>

            {todayRecord?.locationType && (
              <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <span>Location Tag:</span>
                {getLocationBadge(todayRecord.locationType)}
              </div>
            )}
          </div>

          {/* Action Column */}
          <div className="lg:col-span-7 bg-white dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/60 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Location Selector */}
              <div className="sm:w-1/2">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Work Location
                </label>
                <select
                  value={punchLocation}
                  disabled={isClockedOut}
                  onChange={(e) => setPunchLocation(e.target.value as any)}
                  className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="OFFICE" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    🏢 Primary Office
                  </option>
                  <option value="FIELD_CLIENT_SITE" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    📍 Client Site / Field Work
                  </option>
                  <option value="REMOTE_WFH" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    💻 Remote / Work From Home
                  </option>
                </select>
              </div>

              {/* Punch Button */}
              <div className="sm:w-1/2 flex flex-col justify-end">
                <button
                  type="button"
                  onClick={handlePunch}
                  disabled={isPunching || isClockedOut}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 ${
                    isClockedOut
                      ? 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500 cursor-not-allowed'
                      : !isClockedIn
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 active:scale-[0.98]'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-500/20 active:scale-[0.98]'
                  }`}
                >
                  {isPunching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Recording...
                    </>
                  ) : isClockedOut ? (
                    <>
                      <CheckCircle className="w-4 h-4" /> Shift Completed Today
                    </>
                  ) : !isClockedIn ? (
                    <>
                      <Clock className="w-4 h-4" /> Clock In (9:00 AM Shift)
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Clock Out for the Day
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Optional Notes */}
            {!isClockedOut && (
              <div>
                <input
                  type="text"
                  placeholder="Optional note / client destination (e.g. BGC Client Presentation)..."
                  value={punchNotes}
                  onChange={(e) => setPunchNotes(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-2 placeholder-neutral-400 focus:ring-1 focus:ring-primary-500"
                />
              </div>
            )}

            {punchError && (
              <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{punchError}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-px overflow-x-auto">
        <button
          onClick={() => setActiveTab('dtr')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'dtr'
              ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <Calendar className="w-4 h-4" /> My Monthly DTR
        </button>

        <button
          onClick={() => setActiveTab('ob_requests')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'ob_requests'
              ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
              : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
          }`}
        >
          <Briefcase className="w-4 h-4" /> Field Work (OB) & Corrections
        </button>

        {canApprove && (
          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'team'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Users className="w-4 h-4" /> Team Attendance Roster
          </button>
        )}

        {canApprove && (
          <button
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap relative ${
              activeTab === 'approvals'
                ? 'border-primary-600 text-primary-600 dark:border-primary-400 dark:text-primary-400'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <FileCheck className="w-4 h-4" /> Awaiting Approvals
            {pendingApprovals.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white">
                {pendingApprovals.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* TAB 1: MY DTR */}
      {activeTab === 'dtr' && (
        <div className="space-y-6">
          {/* Header Controls & Month Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Select Month:
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <button
              onClick={() => {
                setNewReqType('OFFICIAL_BUSINESS');
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> File OB Slip / Correction
            </button>
          </div>

          {/* DTR Monthly Summary Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">Days Present</div>
              <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100 mt-1">{presentDays}</div>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Official Business (OB)</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{obDays}</div>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Approved Leaves</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{leaveDays}</div>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Late Minutes</div>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{totalLateMins}m</div>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Undertime Minutes</div>
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{totalUnderMins}m</div>
            </div>
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-rose-600 dark:text-rose-400 font-medium">Unexcused Absences</div>
              <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{absentDays}</div>
            </div>
          </div>

          {/* DTR Table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">
                Daily Time Log ({selectedMonth})
              </h3>
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Standard Shift: 9:00 AM - 6:00 PM (15m grace period)
              </span>
            </div>

            {isLoadingDtr ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading attendance records...
              </div>
            ) : myDtr.length === 0 ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No attendance records found for this month.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Time In</th>
                      <th className="px-6 py-3">Time Out</th>
                      <th className="px-6 py-3">Location</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Late (min)</th>
                      <th className="px-6 py-3">Undertime (min)</th>
                      <th className="px-6 py-3">Notes / Destination</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-mono text-xs">
                    {myDtr.map((row) => (
                      <tr key={row.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                        <td className="px-6 py-3.5 font-medium font-sans text-neutral-900 dark:text-neutral-100">
                          {formatDateDisplay(row.date)}
                        </td>
                        <td className="px-6 py-3.5 text-neutral-800 dark:text-neutral-200">
                          {formatTimeOnly(row.timeIn)}
                        </td>
                        <td className="px-6 py-3.5 text-neutral-800 dark:text-neutral-200">
                          {formatTimeOnly(row.timeOut)}
                        </td>
                        <td className="px-6 py-3.5 font-sans">
                          {getLocationBadge(row.locationType)}
                        </td>
                        <td className="px-6 py-3.5 font-sans">
                          {getStatusBadge(row.status)}
                        </td>
                        <td className="px-6 py-3.5">
                          {row.lateMinutes > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-semibold">{row.lateMinutes}</span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          {row.undertimeMinutes > 0 ? (
                            <span className="text-orange-600 dark:text-orange-400 font-semibold">{row.undertimeMinutes}</span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 font-sans text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                          {row.notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: OB SLIPS & CORRECTIONS */}
      {activeTab === 'ob_requests' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
                Official Business (OB) & Attendance Corrections
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Submit an OB pass for client deployments, fieldwork, or rectify missed punches. Requires 1-step manager approval.
              </p>
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary-600 hover:bg-primary-700 text-white shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" /> File New Request
            </button>
          </div>

          {/* Requests List Table */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            {isLoadingCorrections ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading requests...
              </div>
            ) : corrections.length === 0 ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No Official Business slips or attendance correction requests filed yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-6 py-3">Date</th>
                      <th className="px-6 py-3">Type</th>
                      <th className="px-6 py-3">Destination / Times</th>
                      <th className="px-6 py-3">Reason</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Decision Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                    {corrections.map((req) => (
                      <tr key={req.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                        <td className="px-6 py-3.5 font-medium text-neutral-900 dark:text-neutral-100">
                          {formatDateDisplay(req.date)}
                        </td>
                        <td className="px-6 py-3.5">
                          {req.type === 'OFFICIAL_BUSINESS' ? (
                            <span className="inline-flex items-center gap-1 text-blue-700 dark:text-blue-300 font-semibold">
                              <Briefcase className="w-3.5 h-3.5" /> OB Slip (Field Work)
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
                              <Clock className="w-3.5 h-3.5" /> Missed Punch
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-neutral-700 dark:text-neutral-300">
                          {req.type === 'OFFICIAL_BUSINESS' ? (
                            <span>{req.destination || 'Field Deployment'}</span>
                          ) : (
                            <span className="font-mono">
                              In: {formatTimeOnly(req.proposedTimeIn)} | Out: {formatTimeOnly(req.proposedTimeOut)}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                          {req.reason}
                        </td>
                        <td className="px-6 py-3.5">
                          {req.status === 'PENDING' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              Pending Approval
                            </span>
                          )}
                          {req.status === 'APPROVED' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              Approved
                            </span>
                          )}
                          {req.status === 'REJECTED' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              Rejected
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3.5 text-neutral-500 dark:text-neutral-400">
                          {req.decisionNote ? (
                            <span>
                              {req.decisionNote}
                              {req.decidedBy && ` (${req.decidedBy.firstName} ${req.decidedBy.lastName})`}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TEAM ATTENDANCE ROSTER (MANAGERS & HR) */}
      {activeTab === 'team' && canApprove && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Target Date:
              </label>
              <input
                type="date"
                value={teamDate}
                onChange={(e) => setTeamDate(e.target.value)}
                className="text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 px-3 py-1.5 focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-neutral-400" />
              <input
                type="text"
                placeholder="Filter team member..."
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            {isLoadingTeam ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading team roster...
              </div>
            ) : teamList.length === 0 ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                No team members found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-50 dark:bg-neutral-800/60 text-xs font-semibold text-neutral-500 dark:text-neutral-400 border-b border-neutral-200 dark:border-neutral-800">
                    <tr>
                      <th className="px-6 py-3">Employee</th>
                      <th className="px-6 py-3">Department</th>
                      <th className="px-6 py-3">Position</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Time In</th>
                      <th className="px-6 py-3">Time Out</th>
                      <th className="px-6 py-3">Location</th>
                      <th className="px-6 py-3">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-xs">
                    {teamList
                      .filter(
                        (t) =>
                          `${t.firstName} ${t.lastName} ${t.employeeNo}`
                            .toLowerCase()
                            .includes(teamSearch.toLowerCase()),
                      )
                      .map((t) => (
                        <tr key={t.employeeId} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                          <td className="px-6 py-3.5 font-medium text-neutral-900 dark:text-neutral-100">
                            <div>{t.firstName} {t.lastName}</div>
                            <div className="text-[11px] text-neutral-400">{t.employeeNo}</div>
                          </td>
                          <td className="px-6 py-3.5 text-neutral-600 dark:text-neutral-400">{t.department}</td>
                          <td className="px-6 py-3.5 text-neutral-600 dark:text-neutral-400">{t.position}</td>
                          <td className="px-6 py-3.5">
                            {t.attendance ? (
                              getStatusBadge(t.attendance.status)
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                                Not Clocked In
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-neutral-800 dark:text-neutral-200">
                            {formatTimeOnly(t.attendance?.timeIn)}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-neutral-800 dark:text-neutral-200">
                            {formatTimeOnly(t.attendance?.timeOut)}
                          </td>
                          <td className="px-6 py-3.5">
                            {t.attendance?.locationType ? getLocationBadge(t.attendance.locationType) : '-'}
                          </td>
                          <td className="px-6 py-3.5 text-neutral-500 dark:text-neutral-400 max-w-xs truncate">
                            {t.attendance?.notes || '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AWAITING APPROVALS (MANAGERS & HR) */}
      {activeTab === 'approvals' && canApprove && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Pending Field Work (OB) & Missed Punch Approvals
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Review and act on attendance requests submitted by your team members.
            </p>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm">
            {isLoadingApprovals ? (
              <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading pending approvals...
              </div>
            ) : pendingApprovals.length === 0 ? (
              <div className="p-12 text-center text-neutral-500">
                <CheckSquare className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  All Caught Up!
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
                  There are currently no pending attendance requests requiring your approval.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {pendingApprovals.map((req) => (
                  <div key={req.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
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
                          <span className="text-neutral-400">Date:</span> {formatDateDisplay(req.date)}
                        </div>
                        {req.type === 'OFFICIAL_BUSINESS' ? (
                          <div>
                            <span className="text-neutral-400">Destination:</span> {req.destination || 'Field Client Site'}
                          </div>
                        ) : (
                          <div className="font-mono">
                            <span className="text-neutral-400 font-sans">Proposed:</span> In {formatTimeOnly(req.proposedTimeIn)} → Out {formatTimeOnly(req.proposedTimeOut)}
                          </div>
                        )}
                        <div>
                          <span className="text-neutral-400">Location:</span> {getLocationBadge(req.locationType)}
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
                          setDecisionModalItem(req);
                          setDecisionAction('APPROVE');
                          setDecisionComment('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all"
                      >
                        <Check className="w-3.5 h-3.5" /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDecisionModalItem(req);
                          setDecisionAction('REJECT');
                          setDecisionComment('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all"
                      >
                        <X className="w-3.5 h-3.5" /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: FILE OB SLIP / MISSED PUNCH */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                File Official Business (OB) / Correction
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Request Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewReqType('OFFICIAL_BUSINESS')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newReqType === 'OFFICIAL_BUSINESS'
                        ? 'border-primary-600 bg-primary-50/50 dark:bg-primary-950/20 text-primary-900 dark:text-primary-100 font-semibold'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <Briefcase className="w-4 h-4 mb-1 text-primary-600 dark:text-primary-400" />
                    <div className="text-xs">OB Slip (Field Work)</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5 font-normal">0 penalty, marks day present</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewReqType('MISSED_PUNCH')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      newReqType === 'MISSED_PUNCH'
                        ? 'border-primary-600 bg-primary-50/50 dark:bg-primary-950/20 text-primary-900 dark:text-primary-100 font-semibold'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <Clock className="w-4 h-4 mb-1 text-amber-600 dark:text-amber-400" />
                    <div className="text-xs">Missed Punch</div>
                    <div className="text-[10px] text-neutral-400 mt-0.5 font-normal">Rectify forgotten badge in/out</div>
                  </button>
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Target Date
                </label>
                <input
                  type="date"
                  required
                  value={newReqDate}
                  onChange={(e) => setNewReqDate(e.target.value)}
                  className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Location Type */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Location Type
                </label>
                <select
                  value={newReqLocation}
                  onChange={(e) => setNewReqLocation(e.target.value as any)}
                  className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                >
                  <option value="FIELD_CLIENT_SITE" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    📍 Client Site / Field Work
                  </option>
                  <option value="OFFICE" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    🏢 Primary Office
                  </option>
                  <option value="REMOTE_WFH" className="bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100">
                    💻 Remote / Work From Home
                  </option>
                </select>
              </div>

              {/* Fields for OB */}
              {newReqType === 'OFFICIAL_BUSINESS' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                    Destination / Client Site Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BGC Corporate Tower, Makati Client HQ"
                    value={newReqDestination}
                    onChange={(e) => setNewReqDestination(e.target.value)}
                    className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              {/* Fields for Missed Punch */}
              {newReqType === 'MISSED_PUNCH' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Proposed Time In
                    </label>
                    <input
                      type="time"
                      required
                      value={newReqTimeIn}
                      onChange={(e) => setNewReqTimeIn(e.target.value)}
                      className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                      Proposed Time Out
                    </label>
                    <input
                      type="time"
                      required
                      value={newReqTimeOut}
                      onChange={(e) => setNewReqTimeOut(e.target.value)}
                      className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Justification / Purpose
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the technical reason, client meeting agenda, or cause of missed punch..."
                  value={newReqReason}
                  onChange={(e) => setNewReqReason(e.target.value)}
                  className="w-full text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {reqModalError && (
                <div className="flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-lg border border-rose-200 dark:border-rose-900">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reqModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReq}
                  className="px-5 py-2 text-xs font-semibold bg-primary-600 hover:bg-primary-700 text-white rounded-lg shadow-sm flex items-center gap-1.5"
                >
                  {isSubmittingReq ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting...
                    </>
                  ) : (
                    'Submit to Manager'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DECIDE REQUEST (APPROVE / REJECT) */}
      {decisionModalItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <h3 className="font-bold text-neutral-900 dark:text-neutral-100 text-base">
                {decisionAction === 'APPROVE' ? 'Approve' : 'Reject'} Attendance Request
              </h3>
              <button
                onClick={() => setDecisionModalItem(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="text-xs text-neutral-600 dark:text-neutral-300 space-y-1.5 bg-neutral-50 dark:bg-neutral-800/60 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <div>
                <span className="font-semibold text-neutral-500">Employee:</span> {decisionModalItem.employee?.firstName} {decisionModalItem.employee?.lastName}
              </div>
              <div>
                <span className="font-semibold text-neutral-500">Date:</span> {formatDateDisplay(decisionModalItem.date)}
              </div>
              <div>
                <span className="font-semibold text-neutral-500">Type:</span> {decisionModalItem.type === 'OFFICIAL_BUSINESS' ? 'Official Business (OB) Slip' : 'Missed Punch Correction'}
              </div>
              <div>
                <span className="font-semibold text-neutral-500">Reason:</span> {decisionModalItem.reason}
              </div>
            </div>

            <form onSubmit={handleDecideSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                  Manager Decision Note (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Field assignment confirmed with client..."
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  className="w-full text-xs rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 p-2.5 focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDecisionModalItem(null)}
                  className="px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingDecision}
                  className={`px-5 py-2 text-xs font-semibold text-white rounded-lg shadow-sm flex items-center gap-1.5 ${
                    decisionAction === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isSubmittingDecision ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Processing...
                    </>
                  ) : decisionAction === 'APPROVE' ? (
                    'Confirm Approval'
                  ) : (
                    'Confirm Rejection'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Loading Attendance & DTR...
        </div>
      }
    >
      <AttendanceContent />
    </Suspense>
  );
}
