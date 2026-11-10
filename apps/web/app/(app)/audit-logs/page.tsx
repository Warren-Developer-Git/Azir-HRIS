'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ShieldCheck, Loader2, AlertCircle, Clock, Database } from 'lucide-react';

interface AuditLogItem {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  before: any;
  after: any;
  createdAt: string;
  actor?: {
    email: string;
    employee?: {
      firstName: string;
      lastName: string;
    };
  };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogs() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api<AuditLogItem[]>('/audit-logs?limit=50');
        setLogs(data);
      } catch (err: any) {
        setError(err instanceof ApiError ? err.message : 'Failed to load audit logs');
      } finally {
        setIsLoading(false);
      }
    }
    loadLogs();
  }, []);

  const formatDateTime = (isoString: string) => {
    if (!isoString) return '';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Audit Trail Logs</h1>
          {!isLoading && (
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
              {logs.length} recent events
            </span>
          )}
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Immutable compliance record of all write actions, decisions, and administrative modifications.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Access Restricted</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center text-neutral-500">
            <Loader2 className="w-6 h-6 animate-spin mb-3" />
            <p className="text-sm">Fetching audit trail entries...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              No Audit Records Yet
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              System modifications will automatically appear here once recorded.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3">Actor / User</th>
                  <th className="px-5 py-3">Action</th>
                  <th className="px-5 py-3">Entity</th>
                  <th className="px-5 py-3">Entity ID</th>
                  <th className="px-5 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-neutral-500 font-mono">
                      {formatDateTime(log.createdAt)}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                        {log.actor?.employee
                          ? `${log.actor.employee.firstName} ${log.actor.employee.lastName}`
                          : log.actor?.email || log.actorId}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-mono">
                        {log.actor?.email}
                      </div>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-xs px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 font-mono font-semibold uppercase">
                        {log.action}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                      {log.entity}
                    </td>

                    <td className="px-5 py-3.5 whitespace-nowrap text-[11px] font-mono text-neutral-400">
                      {log.entityId.slice(0, 8)}...
                    </td>

                    <td className="px-5 py-3.5 text-xs text-neutral-500 max-w-xs truncate font-mono">
                      {log.after ? JSON.stringify(log.after) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
