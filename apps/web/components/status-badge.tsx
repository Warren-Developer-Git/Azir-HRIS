import React from 'react';
import { Clock, Check, X, Ban } from 'lucide-react';

export type LeaveStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_HR'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

interface StatusBadgeProps {
  status: LeaveStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  switch (status) {
    case 'PENDING_MANAGER':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-neutral-400 text-neutral-800 bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-600 dark:text-neutral-200 ${className}`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending Manager
        </span>
      );

    case 'PENDING_HR':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-neutral-600 text-neutral-900 bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-500 dark:text-neutral-100 ${className}`}
        >
          <Clock className="w-3.5 h-3.5" />
          Pending HR
        </span>
      );

    case 'APPROVED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-black text-white dark:bg-white dark:text-black ${className}`}
        >
          <Check className="w-3.5 h-3.5" />
          Approved
        </span>
      );

    case 'REJECTED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-neutral-900 text-neutral-900 bg-white dark:border-neutral-200 dark:text-neutral-200 dark:bg-black ${className}`}
        >
          <X className="w-3.5 h-3.5" />
          Rejected
        </span>
      );

    case 'CANCELLED':
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 ${className}`}
        >
          <Ban className="w-3.5 h-3.5" />
          Cancelled
        </span>
      );

    default:
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs bg-neutral-100 text-neutral-800 ${className}`}>
          {status}
        </span>
      );
  }
}
