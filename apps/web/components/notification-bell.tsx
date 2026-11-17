'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Bell, Check, Loader2, ExternalLink } from 'lucide-react';

interface NotificationItem {
  id: string;
  message: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}

export function NotificationBell() {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api<NotificationsResponse>('/notifications');
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // Ignore network errors during polling
    }
  }, []);

  // Poll notifications every 30 seconds
  // shortcut: polling, move to SSE when it matters
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = async (item: NotificationItem) => {
    if (!item.readAt) {
      try {
        await api(`/notifications/${item.id}/read`, { method: 'POST' });
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, readAt: new Date().toISOString() } : i)),
        );
        setUnread((prev) => Math.max(0, prev - 1));
      } catch {
        // Continue navigation even if read marking fails
      }
    }

    if (item.link) {
      setIsOpen(false);
      let target = item.link;
      if (target === '/payroll/my-payslips') {
        target = '/payroll?tab=my-payslips';
      }
      router.push(target);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      setIsMarkingAll(true);
      await api('/notifications/read-all', { method: 'POST' });
      setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })));
      setUnread(0);
    } catch {
      // Ignore error
    } finally {
      setIsMarkingAll(false);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative p-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-black text-white dark:bg-white dark:text-black font-mono text-[10px] font-bold flex items-center justify-center shadow-xs">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed left-4 right-4 top-16 md:absolute md:left-0 md:right-auto md:top-auto md:mt-2 md:w-96 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="p-3 px-4 border-b border-neutral-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                Notifications
              </span>
              {unread > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-neutral-100 dark:bg-neutral-800 font-mono text-neutral-600 dark:text-neutral-400 font-semibold">
                  {unread} unread
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                disabled={isMarkingAll}
                className="text-[11px] font-semibold text-neutral-500 hover:text-black dark:hover:text-white inline-flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
            {items.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500">
                No notifications right now.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleMarkAsRead(item)}
                  className={`p-3.5 px-4 text-xs cursor-pointer transition-colors flex items-start gap-3 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${
                    !item.readAt ? 'bg-neutral-50/80 dark:bg-neutral-950/40' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      !item.readAt ? 'bg-black dark:bg-white' : 'bg-transparent'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`leading-snug break-words text-neutral-900 dark:text-neutral-100 ${
                        !item.readAt ? 'font-semibold' : 'font-normal text-neutral-600 dark:text-neutral-400'
                      }`}
                    >
                      {item.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-neutral-400 font-mono">
                        {formatTime(item.createdAt)}
                      </span>
                      {item.link && (
                        <span className="text-[10px] text-neutral-500 inline-flex items-center gap-0.5 hover:underline">
                          View details <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
