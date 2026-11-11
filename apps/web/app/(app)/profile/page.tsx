'use client';

import React, { useEffect, useState, useRef } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { UserAvatar } from '@/components/user-avatar';
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
  Lock,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
  Camera,
  Upload,
  Trash2,
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
  avatarUrl?: string | null;
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setAvatarUrl(data.avatarUrl || null);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file (JPEG, PNG, WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be under 5MB.');
      return;
    }

    setPhotoError(null);
    setIsUploadingPhoto(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        // Resize to 400x400 square crop via canvas
        const canvas = document.createElement('canvas');
        const size = 400;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsUploadingPhoto(false);
          return;
        }

        // Center crop
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

        try {
          const updated = await api<MyProfile>('/me/profile', {
            method: 'PATCH',
            body: JSON.stringify({ avatarUrl: dataUrl }),
          });
          setProfile(updated);
          setAvatarUrl(updated.avatarUrl || null);
          setSuccess(true);
          setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
          setPhotoError(err instanceof ApiError ? err.message : 'Failed to save profile picture');
        } finally {
          setIsUploadingPhoto(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleRemovePhoto = async () => {
    setPhotoError(null);
    try {
      setIsUploadingPhoto(true);
      const updated = await api<MyProfile>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: null }),
      });
      setProfile(updated);
      setAvatarUrl(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setPhotoError(err instanceof ApiError ? err.message : 'Failed to remove profile picture');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

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

  // Password change state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError(null);
    setPassSuccess(null);

    if (!oldPassword.trim()) {
      setPassError('Please enter your current password to verify your identity.');
      return;
    }
    if (!newPassword) {
      setPassError('Please enter a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters long.');
      return;
    }
    if (newPassword === oldPassword) {
      setPassError('New password cannot be the same as your current password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassError('New password and confirmation do not match.');
      return;
    }

    try {
      setIsChangingPass(true);
      await api<{ ok: boolean; message: string }>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          oldPassword,
          newPassword,
        }),
      });
      setPassSuccess(
        'Password updated successfully. Please use your new password next time you sign in.',
      );
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPassSuccess(null), 6000);
    } catch (err: any) {
      setPassError(
        err instanceof ApiError
          ? err.message
          : 'Failed to change password. Please verify your current password.',
      );
    } finally {
      setIsChangingPass(false);
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="relative group shrink-0">
                <UserAvatar
                  src={avatarUrl}
                  gender={profile.gender}
                  alt={`${profile.firstName} ${profile.lastName}`}
                  size="xl"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="absolute bottom-0 right-0 p-1.5 rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-md hover:scale-105 transition-all disabled:opacity-50"
                  title="Upload profile picture"
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Camera className="w-3.5 h-3.5" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
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

                {/* Upload & Remove controls */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-800 dark:text-neutral-200 transition-colors"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{avatarUrl ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>

                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      disabled={isUploadingPhoto}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>

                {photoError && (
                  <div className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                    {photoError}
                  </div>
                )}
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

          {/* Security & Password Change */}
          <form
            onSubmit={handleChangePassword}
            className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-neutral-900 dark:text-neutral-100" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Security & Password
                </h3>
              </div>
              <span className="text-[11px] text-neutral-400">
                Requires current password confirmation
              </span>
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
              To update your portal credentials, enter your existing password for verification, then enter and confirm your new password (minimum 8 characters).
            </p>

            {passError && (
              <div className="p-3 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-neutral-800 dark:text-neutral-200 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{passError}</div>
              </div>
            )}

            {passSuccess && (
              <div className="p-3 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 flex items-start gap-2.5 font-medium">
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{passSuccess}</span>
              </div>
            )}

            <div className="space-y-4 pt-1">
              {/* Old / Current Password */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                  Current Password <span className="text-neutral-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showOldPass ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className="w-full pl-3 pr-10 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1"
                    title={showOldPass ? 'Hide password' : 'Show password'}
                  >
                    {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Grid for New Password and Confirm */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    New Password <span className="text-neutral-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      autoComplete="new-password"
                      className="w-full pl-3 pr-10 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1"
                      title={showNewPass ? 'Hide password' : 'Show password'}
                    >
                      {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-neutral-400">Minimum 8 characters</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Confirm New Password <span className="text-neutral-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPass ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      className="w-full pl-3 pr-10 py-2 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:focus:ring-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(!showConfirmPass)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1"
                      title={showConfirmPass ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex justify-end">
              <button
                type="submit"
                disabled={isChangingPass}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors"
              >
                {isChangingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {isChangingPass ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
