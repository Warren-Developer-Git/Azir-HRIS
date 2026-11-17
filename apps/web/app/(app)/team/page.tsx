'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  SendEmailModal,
  type EmailRecipientTarget,
} from '@/components/send-email-modal';
import {
  Users,
  Loader2,
  AlertCircle,
  CalendarDays,
  ArrowRight,
  Mail,
  CheckCircle,
} from 'lucide-react';

interface DirectReport {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string;
  status: 'ACTIVE' | 'INACTIVE';
  hireDate: string;
  phone: string | null;
  user?: {
    email: string;
  };
  department?: {
    name: string;
  };
}

export default function TeamPage() {
  const { can } = useAuth();
  const [team, setTeam] = useState<DirectReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState<EmailRecipientTarget | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  useEffect(() => {
    async function loadTeam() {
      try {
        setIsLoading(true);
        setError(null);
        const res = await api<{ data: DirectReport[] }>('/employees?scope=team&pageSize=50');
        setTeam(res.data);
      } catch (err: any) {
        setError(err instanceof ApiError ? err.message : 'Failed to load team members');
      } finally {
        setIsLoading(false);
      }
    }
    loadTeam();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">My Team</h1>
          {!isLoading && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {team.length} direct {team.length === 1 ? 'report' : 'reports'}
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Direct reports reporting to you. View contact details, roles, and status.
        </p>
      </div>

      {emailNotice && (
        <div className="p-4 rounded-md border border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-black text-xs flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2 min-w-0">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0" />
            <span className="min-w-0 break-words">{emailNotice}</span>
          </div>
          <button
            onClick={() => setEmailNotice(null)}
            className="underline hover:opacity-80 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Error loading team</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Grid or Table of Team */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Loading your team roster...</p>
          </div>
        ) : team.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <Users className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              No Direct Reports
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              There are currently no employees configured to report directly to your profile.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Member</th>
                  <th className="px-5 py-3">Position</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {team.map((member) => (
                  <tr
                    key={member.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="px-5 py-4 whitespace-nowrap">
                      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                        {member.firstName} {member.lastName}
                      </div>
                      <div className="text-xs text-neutral-500 flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono">{member.employeeNo}</span>
                        <span>•</span>
                        <span>{member.user?.email}</span>
                      </div>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-700 dark:text-neutral-300 font-medium">
                      {member.position}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400">
                      {member.department?.name || '—'}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-neutral-600 dark:text-neutral-400 text-xs">
                      {member.phone || '—'}
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          member.status === 'ACTIVE'
                            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                            : 'border border-neutral-300 text-neutral-500 dark:border-neutral-700'
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>

                    <td className="px-5 py-4 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-3">
                        {(can('email.send_team') || can('email.send')) && (
                          <button
                            type="button"
                            onClick={() =>
                              setEmailTarget({
                                employeeId: member.id,
                                name: `${member.firstName} ${member.lastName}`,
                                email: member.user?.email,
                              })
                            }
                            className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
                            title="Send Email or Meeting Invite"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            Email
                          </button>
                        )}
                        <Link
                          href={`/employees/${member.id}`}
                          className="font-medium text-xs text-neutral-900 dark:text-neutral-100 hover:underline"
                        >
                          Profile →
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SendEmailModal
        recipient={emailTarget}
        onClose={() => setEmailTarget(null)}
        onSent={(msg) => setEmailNotice(msg)}
      />
    </div>
  );
}
