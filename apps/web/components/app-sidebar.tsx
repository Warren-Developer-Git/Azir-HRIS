'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { ThemeToggle } from './theme-toggle';
import {
  LayoutDashboard,
  CalendarDays,
  CheckSquare,
  Users,
  Building2,
  Sliders,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

export function AppSidebar() {
  const pathname = usePathname();
  const { user, can, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      visible: true,
    },
    {
      label: 'My Leave',
      href: '/leave',
      icon: CalendarDays,
      visible: can('leave.file'),
    },
    {
      label: 'Approvals',
      href: '/approvals',
      icon: CheckSquare,
      visible: can('leave.approve.manager') || can('leave.approve.hr'),
    },
    {
      label: 'Team',
      href: '/team',
      icon: Users,
      visible: can('team.read'),
    },
    {
      label: 'Employees',
      href: '/employees',
      icon: Building2,
      visible: can('employee.read.all'),
    },
    {
      label: 'Settings',
      href: '/settings',
      icon: Sliders,
      visible: can('department.write'),
    },
    {
      label: 'Audit Log',
      href: '/audit-logs',
      icon: ShieldCheck,
      visible: can('audit.read'),
    },
    {
      label: 'My Profile',
      href: '/profile',
      icon: User,
      visible: true,
    },
  ];

  const filteredItems = navItems.filter((i) => i.visible);

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-neutral-200 bg-white dark:bg-black dark:border-neutral-800">
        <div className="font-bold text-lg tracking-tight">HRMS</div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded border border-neutral-300 dark:border-neutral-700"
            aria-label="Toggle Navigation"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar sidebar container */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 flex flex-col justify-between border-r border-neutral-200 bg-white dark:bg-black dark:border-neutral-800 transition-transform duration-200 md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Header */}
          <div className="p-6 border-b border-neutral-100 dark:border-neutral-900 flex items-center justify-between">
            <div className="min-w-0">
              <div className="text-xl font-bold tracking-tight">HRMS</div>
              <div className="text-xs text-neutral-500 font-medium truncate mt-0.5">
                {user?.tenantName || 'Human Resources'}
              </div>
            </div>
            <ThemeToggle />
          </div>

          {/* Navigation links */}
          <nav className="p-4 space-y-1">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md font-medium transition-colors ${
                    isActive
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                      : 'text-neutral-600 hover:text-black hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-900'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User footer */}
        <div className="p-4 border-t border-neutral-100 dark:border-neutral-900">
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
              <div className="flex gap-1 mt-1">
                {user?.roles?.map((role) => (
                  <span
                    key={role}
                    className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-md font-medium transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
