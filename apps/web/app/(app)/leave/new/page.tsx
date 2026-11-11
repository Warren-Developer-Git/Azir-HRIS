'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { CalendarDays, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface LeaveType {
  id: string;
  code: string;
  name: string;
  kind: 'YEARLY' | 'PER_EVENT';
  defaultDays: number;
  countingMode: 'WORKING_DAYS' | 'CALENDAR_DAYS';
  description?: string;
}

function toYMD(val: string): string {
  if (!val) return '';
  const trimmed = val.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('T')) return trimmed.split('T')[0];
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [m, d, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0];
  }
  return trimmed;
}

export default function NewLeavePage() {
  const router = useRouter();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [isLoadingTypes, setIsLoadingTypes] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadTypes() {
      try {
        setIsLoadingTypes(true);
        const data = await api<LeaveType[]>('/leave-types');
        setTypes(data);
        if (data.length > 0) {
          setSelectedTypeId(data[0].id);
        }
      } catch (err: any) {
        setErrorMessage('Failed to load leave types. Please try again.');
      } finally {
        setIsLoadingTypes(false);
      }
    }
    loadTypes();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanStart = toYMD(startDate);
    const cleanEnd = toYMD(endDate);

    if (!selectedTypeId) {
      setErrorMessage('Please select a leave type.');
      return;
    }
    if (!cleanStart || !cleanEnd) {
      setErrorMessage('Start date and end date are required.');
      return;
    }
    if (!reason.trim()) {
      setErrorMessage('Please provide a reason for the leave request.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await api<{ id: string }>('/leave/requests', {
        method: 'POST',
        body: JSON.stringify({
          leaveTypeId: selectedTypeId,
          startDate: cleanStart,
          endDate: cleanEnd,
          reason: reason.trim(),
        }),
      });

      router.push(`/leave/${res.id}`);
    } catch (err: any) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('An unexpected error occurred while filing the request.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedType = types.find((t) => t.id === selectedTypeId);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/leave"
          className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400 transition-colors"
          aria-label="Back to Leave"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">File Leave Request</h1>
          <p className="text-sm text-neutral-500">
            Submit a leave application for manager and HR approval.
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">
              Unable to submit request
            </div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">
              {errorMessage}
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-5"
      >
        {/* Leave Type Selector */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Leave Type
          </label>
          {isLoadingTypes ? (
            <div className="h-10 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
          ) : (
            <select
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
              required
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name} ({type.code}) - {type.kind === 'YEARLY' ? 'Annual Quota' : 'Per Event'}
                </option>
              ))}
            </select>
          )}

          {selectedType && (
            <p className="text-xs text-neutral-500 mt-1">
              {selectedType.kind === 'YEARLY'
                ? `Standard entitlement: ${selectedType.defaultDays} days/year. Counted as ${selectedType.countingMode.toLowerCase().replace('_', ' ')}.`
                : `Event-based leave (${selectedType.defaultDays} days max). Counted as ${selectedType.countingMode.toLowerCase().replace('_', ' ')}.`}
            </p>
          )}
        </div>

        {/* Date Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (!endDate || e.target.value > endDate) {
                  setEndDate(e.target.value);
                }
              }}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
              required
            />
          </div>
        </div>

        {/* Reason Textarea */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Reason / Justification
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Brief explanation for your leave request..."
            className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white"
            required
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-3">
          <Link
            href="/leave"
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isLoadingTypes}
            className="inline-flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </button>
        </div>
      </form>
    </div>
  );
}
