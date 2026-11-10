'use client';

import React, { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  User,
  Building,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Save,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface MyProfile {
  id: string;
  employeeNo: string;
  firstName: string;
  lastName: string;
  position: string;
  hireDate: string;
  gender: string;
  maritalStatus: string;
  phone: string | null;
  address: string | null;
  status: string;
  user: {
    email: string;
    roles: string[];
  };
  department?: {
    name: string;
  };
  manager?: {
    firstName: string;
    lastName: string;
    employeeNo: string;
  };
}

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api<MyProfile>('/me/profile');
      setProfile(data);
      setPhone(data.phone || '');
      setAddress(data.address || '');
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    try {
      setIsSaving(true);
      const updated = await api<MyProfile>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          phone: phone.trim() || null,
          address: address.trim() || null,
        }),
      });
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center text-neutral-500">
        <Loader2 className="w-6 h-6 animate-spin mb-3" />
        <p className="text-sm">Loading your profile...</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto text-neutral-400" />
        <h2 className="text-lg font-bold">Failed to Load Profile</h2>
        <p className="text-sm text-neutral-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Review your employment profile and update personal contact information.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-neutral-900 dark:text-neutral-100 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-neutral-900 dark:text-neutral-100">Update Error</div>
            <div className="text-neutral-600 dark:text-neutral-400 text-xs mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Profile changes saved successfully.</span>
        </div>
      )}

      {profile && (
        <div className="space-y-6">
          {/* Identity Card */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-lg font-bold">
                {profile.firstName[0]}
                {profile.lastName[0]}
              </div>
              <div>
                <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                  {profile.firstName} {profile.lastName}
                </h2>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  {profile.position} • {profile.department?.name || 'Operations'}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.user.roles.map((role) => (
                    <span
                      key={role}
                      className="text-[10px] px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono font-medium"
                    >
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-right text-xs text-neutral-500 self-stretch sm:self-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-neutral-100 dark:border-neutral-800 flex sm:flex-col justify-between sm:justify-start">
              <span>Employee #</span>
              <span className="font-mono font-semibold text-neutral-900 dark:text-white">
                {profile.employeeNo}
              </span>
            </div>
          </div>

          {/* Readonly Employment Info */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              Employment Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-neutral-500">Corporate Email</div>
                <div className="font-medium text-neutral-900 dark:text-white mt-1">
                  {profile.user.email}
                </div>
              </div>

              <div>
                <div className="text-neutral-500">Date of Hire</div>
                <div className="font-medium text-neutral-900 dark:text-white mt-1">
                  {new Date(profile.hireDate).toLocaleDateString()}
                </div>
              </div>

              <div>
                <div className="text-neutral-500">Direct Manager</div>
                <div className="font-medium text-neutral-900 dark:text-white mt-1">
                  {profile.manager
                    ? `${profile.manager.firstName} ${profile.manager.lastName}`
                    : 'None (Reports to Dept Head / Exec)'}
                </div>
              </div>

              <div>
                <div className="text-neutral-500">Employment Status</div>
                <div className="font-medium text-neutral-900 dark:text-white mt-1">
                  {profile.status}
                </div>
              </div>
            </div>
          </div>

          {/* Editable Personal Contact Info */}
          <form
            onSubmit={handleSave}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 dark:border-neutral-800 pb-2">
              Editable Contact Information
            </h3>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Mobile / Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+63 9XX XXX XXXX"
                  className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Residential Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Metro Manila"
                  className="w-full px-3 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
              >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
