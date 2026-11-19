'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import {
  Mail,
  Video,
  X,
  Send,
  Loader2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

export type EmailPreset =
  | 'GENERAL_NOTICE'
  | 'MEETING_INVITE'
  | 'DOCUMENT_NOTICE'
  | 'ATTENDANCE_NOTICE';

export interface EmailRecipientTarget {
  employeeId: string;
  name: string;
  email?: string;
}

interface SendEmailModalProps {
  recipient: EmailRecipientTarget | null;
  onClose: () => void;
  onSent?: (message: string) => void;
}

const PRESET_OPTIONS: Array<{
  value: EmailPreset;
  label: string;
  defaultSubject: string;
  defaultBodyHint: string;
}> = [
  {
    value: 'GENERAL_NOTICE',
    label: 'General HR / Team Notice',
    defaultSubject: 'HRIS Notice from Sender',
    defaultBodyHint:
      'You have received a new notice. Please log in to the HRIS portal for full details.',
  },
  {
    value: 'MEETING_INVITE',
    label: 'Meeting Invitation (Zoom / GMeet)',
    defaultSubject: 'Meeting Invitation: HR / Team Sync',
    defaultBodyHint:
      'You are invited to an online meeting at the scheduled time. Please join using the meeting link below.',
  },
  {
    value: 'DOCUMENT_NOTICE',
    label: 'Document Update / Pickup Notice',
    defaultSubject: 'HR Document Update: Action / Pickup Notice',
    defaultBodyHint:
      'This is an update regarding your requested HR document. Please check your Documents portal for status or pickup instructions.',
  },
  {
    value: 'ATTENDANCE_NOTICE',
    label: 'Attendance / DTR Reminder',
    defaultSubject: 'Attendance & Daily Time Record (DTR) Notice',
    defaultBodyHint:
      'Please review your Daily Time Record (DTR) in the HRIS portal and file any pending Official Business or Missed Punch requests.',
  },
];

export function SendEmailModal({
  recipient,
  onClose,
  onSent,
}: SendEmailModalProps) {
  const [preset, setPreset] = useState<EmailPreset>('GENERAL_NOTICE');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (recipient) {
      setPreset('GENERAL_NOTICE');
      setSubject('');
      setMessage('');
      setMeetingUrl('');
      setMeetingAt('');
      setError(null);
    }
  }, [recipient]);

  if (!recipient) return null;

  const activePreset =
    PRESET_OPTIONS.find((p) => p.value === preset) ?? PRESET_OPTIONS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await api<{
        delivered: boolean;
        mode: 'GMAIL_API' | 'GMAIL_SMTP' | 'RESEND_API' | 'LOG_ONLY';
        routedTo: string;
        subject: string;
        meetingPlatform: string | null;
        note?: string;
      }>('/notifications/send-email', {
        method: 'POST',
        body: JSON.stringify({
          recipientEmployeeId: recipient.employeeId,
          preset,
          subject: subject.trim() || undefined,
          message: message.trim() || undefined,
          meetingUrl: meetingUrl.trim() || undefined,
          meetingAt: meetingAt.trim() || undefined,
        }),
      });

      const providerLabel =
        res.mode === 'GMAIL_API'
          ? 'Gmail HTTPS API'
          : res.mode === 'GMAIL_SMTP'
            ? 'Gmail SMTP'
            : 'Resend API';

      const statusText = res.delivered
        ? `Email "${res.subject}" sent via ${providerLabel} to ${res.routedTo} (and in-app notification saved).`
        : res.mode === 'GMAIL_API'
          ? `Email "${res.subject}" saved as in-app notification, but Gmail HTTPS API delivery failed (${res.note || 'verify GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN'}).`
          : res.mode === 'GMAIL_SMTP'
            ? `Email "${res.subject}" saved as in-app notification, but Gmail SMTP delivery failed (${res.note || 'verify SMTP_USER and Google App Password SMTP_PASS in api/.env'}).`
            : res.mode === 'RESEND_API'
              ? `Email "${res.subject}" saved as in-app notification, but inbox delivery failed (${res.note || 'Resend rejected request'}). Note: Resend's free onboarding@resend.dev sender only delivers to your own registered Gmail unless a custom domain is verified.`
              : `Email "${res.subject}" logged & pushed as in-app notification (${res.mode} mode — configure Gmail HTTPS API, SMTP_USER/SMTP_PASS, or RESEND_API_KEY in api/.env for live inbox delivery).`;

      onSent?.(statusText);
      onClose();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to send email');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-lg rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <div className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-neutral-700 dark:text-neutral-300" />
            <div>
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Send Email &amp; Meeting Invite
              </h2>
              <p className="text-xs text-neutral-500">
                To: <span className="font-medium">{recipient.name}</span>
                {recipient.email ? ` (${recipient.email})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-sm">
          {error && (
            <div className="p-3 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-xs flex items-start gap-2 text-neutral-800 dark:text-neutral-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Message Category (Default Template)
            </label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as EmailPreset)}
              className="w-full px-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Subject <span className="text-neutral-400 font-normal">(optional — auto-filled if blank)</span>
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={activePreset.defaultSubject}
              maxLength={160}
              className="w-full px-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
              Message Content <span className="text-neutral-400 font-normal">(optional — uses preset default if empty)</span>
            </label>
            <textarea
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write a specific message, or leave blank to automatically send the dedicated default message..."
              maxLength={2000}
              className="w-full px-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
            />
            {!message.trim() && (
              <p className="mt-1.5 text-[11px] text-neutral-500 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded px-2.5 py-1.5">
                <span className="font-semibold">Default Preview:</span>{' '}
                {meetingUrl.trim() && preset === 'GENERAL_NOTICE'
                  ? PRESET_OPTIONS[1].defaultBodyHint
                  : activePreset.defaultBodyHint}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                <Video className="w-3.5 h-3.5" />
                Meeting Link <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/xxx-xxxx-xxx"
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                Meeting Schedule <span className="text-neutral-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={meetingAt}
                onChange={(e) => setMeetingAt(e.target.value)}
                placeholder="Nov 16, 2026 at 2:00 PM"
                maxLength={100}
                className="w-full px-3 py-2 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 p-2.5 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neutral-600 dark:text-neutral-400" />
            <span>
              Security guideline: Never send passwords, net salary breakdowns, government IDs, or medical files in email bodies — direct employees to log into the portal instead.
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-2 text-xs font-medium rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded bg-black text-white hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {submitting ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
