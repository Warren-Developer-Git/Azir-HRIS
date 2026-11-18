'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { TableSkeleton } from '@/components/skeletons';
import {
  ShieldCheck,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Filter,
  RefreshCw,
} from 'lucide-react';

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
  const [selectedEntity, setSelectedEntity] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadLogs = async (entityFilter?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const query = new URLSearchParams({ limit: '50' });
      if (entityFilter) {
        query.set('entity', entityFilter);
      }
      const data = await api<AuditLogItem[]>(`/audit-logs?${query.toString()}`);
      setLogs(data);
      setHasMore(data.length === 50);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load audit logs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(selectedEntity);
  }, [selectedEntity]);

  const loadMore = async () => {
    if (logs.length === 0 || isLoadingMore) return;
    try {
      setIsLoadingMore(true);
      const lastCreatedAt = logs[logs.length - 1].createdAt;
      const query = new URLSearchParams({ limit: '50', before: lastCreatedAt });
      if (selectedEntity) {
        query.set('entity', selectedEntity);
      }
      const older = await api<AuditLogItem[]>(`/audit-logs?${query.toString()}`);
      if (older.length < 50) {
        setHasMore(false);
      }
      setLogs((prev) => [...prev, ...older]);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load older logs');
    } finally {
      setIsLoadingMore(false);
    }
  };

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

  const entities = [
    'LeaveRequest',
    'LeaveLedgerEntry',
    'LeaveGrantRun',
    'LeaveType',
    'Holiday',
    'Department',
    'Employee',
    'User',
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Audit Trail Logs</h1>
            {!isLoading && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-mono">
                {logs.length} events
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            Immutable compliance record of all actions, approvals, and system mutations.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-neutral-500" />
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="px-2.5 py-1.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-medium"
            >
              <option value="">All Entities</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadLogs(selectedEntity)}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
            title="Refresh logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Operation Notice</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-sm">
        {isLoading ? (
          <TableSkeleton rows={6} columns={5} embedded />
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-neutral-400" />
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              No Audit Records Found
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              {selectedEntity
                ? `No entries recorded for entity "${selectedEntity}".`
                : 'System modifications will automatically appear here once recorded.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 dark:bg-neutral-950/50 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-4 py-3"></th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Entity ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {logs.map((log) => {
                  const isExpanded = expandedRowId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedRowId(isExpanded ? null : log.id)}
                        className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3.5 text-neutral-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-neutral-900 dark:text-neutral-100" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap text-xs text-neutral-500 font-mono">
                          {formatDateTime(log.createdAt)}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                            {log.actor?.employee
                              ? `${log.actor.employee.firstName} ${log.actor.employee.lastName}`
                              : log.actor?.email || log.actorId}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {log.actor?.email}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="text-[10px] px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 font-mono font-semibold uppercase">
                            {log.action}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                          {log.entity}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap text-[11px] font-mono text-neutral-400">
                          {log.entityId}
                        </td>
                      </tr>

                      {/* Expandable JSON Detail Row */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/70 dark:bg-neutral-950/70">
                          <td colSpan={6} className="p-4 px-6 space-y-3">
                            <div className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                              Mutation State Inspection:
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <span className="block text-[11px] font-mono text-neutral-500 mb-1">
                                  Before State:
                                </span>
                                <pre className="p-3 text-[11px] font-mono bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-md overflow-x-auto text-neutral-800 dark:text-neutral-200 max-h-48">
                                  {log.before
                                    ? JSON.stringify(log.before, null, 2)
                                    : 'null (None / Created)'}
                                </pre>
                              </div>
                              <div>
                                <span className="block text-[11px] font-mono text-neutral-500 mb-1">
                                  After State:
                                </span>
                                <pre className="p-3 text-[11px] font-mono bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-md overflow-x-auto text-neutral-800 dark:text-neutral-200 max-h-48">
                                  {log.after
                                    ? JSON.stringify(log.after, null, 2)
                                    : 'null (None / Deleted)'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Button */}
        {!isLoading && logs.length > 0 && hasMore && (
          <div className="p-3 border-t border-neutral-100 dark:border-neutral-800 text-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="px-4 py-1.5 text-xs font-semibold rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50 transition-colors"
            >
              {isLoadingMore ? 'Loading older entries...' : 'Load More Older Entries'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
