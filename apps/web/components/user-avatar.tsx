'use client';

import React, { useState } from 'react';
import { resolveMediaUrl } from '@/lib/api';

export interface UserAvatarProps {
  src?: string | null;
  gender?: 'MALE' | 'FEMALE' | string | null;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

const sizeClasses: Record<NonNullable<UserAvatarProps['size']>, { container: string; icon: string }> = {
  xs: { container: 'w-6 h-6', icon: 'w-6 h-6' },
  sm: { container: 'w-8 h-8', icon: 'w-8 h-8' },
  md: { container: 'w-10 h-10', icon: 'w-10 h-10' },
  lg: { container: 'w-14 h-14', icon: 'w-14 h-14' },
  xl: { container: 'w-20 h-20', icon: 'w-20 h-20' },
  '2xl': { container: 'w-24 h-24', icon: 'w-24 h-24' },
};

export function UserAvatar({
  src,
  gender,
  alt = 'Profile avatar',
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sizeConfig = sizeClasses[size] || sizeClasses.md;
  const resolvedSrc = resolveMediaUrl(src);
  const imgError = Boolean(resolvedSrc && failedSrc === resolvedSrc);

  // If valid custom uploaded photo exists and didn't fail
  if (resolvedSrc && !imgError) {
    return (
      <div
        className={`relative inline-block shrink-0 rounded-full overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 ${sizeConfig.container} ${className}`}
      >
        <img
          src={resolvedSrc}
          alt={alt}
          onError={() => setFailedSrc(resolvedSrc)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  // Classic Facebook-style gender-based silhouette placeholder
  const isFemale = typeof gender === 'string' && gender.toUpperCase() === 'FEMALE';

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden border border-neutral-300 dark:border-neutral-700 bg-[#D8DADF] dark:bg-[#2F3338] ${sizeConfig.container} ${className}`}
      title={alt}
      aria-label={alt}
    >
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {isFemale ? (
          /* Classic Facebook Female Profile Silhouette */
          <g className="fill-[#8B8D91] dark:fill-[#9FA2A7]">
            {/* Hair contour flaring to shoulders */}
            <path d="M50 16 C34 16 26 26 26 40 C26 49 28 58 31 65 C33 69 36 71 39 71 C40 68 41 62 41 57 C38 56 36 52 36 46 C36 40 38 38 42 36 C44 35 48 35 50 35 C52 35 56 35 58 36 C62 38 64 40 64 46 C64 52 62 56 59 57 C59 62 60 68 61 71 C64 71 67 69 69 65 C72 58 74 49 74 40 C74 26 66 16 50 16 Z" />
            {/* Face oval */}
            <path d="M50 25 C43 25 39 31 39 39 C39 47 43 54 50 54 C57 54 61 47 61 39 C61 31 57 25 50 25 Z" />
            {/* Neck & Bust / Shoulders */}
            <path d="M44 53 L44 63 C33 66 18 73 14 91 C13 95 16 100 20 100 L80 100 C84 100 87 95 86 91 C82 73 67 66 56 63 L56 53 Z" />
          </g>
        ) : (
          /* Classic Facebook Male Profile Silhouette */
          <g className="fill-[#8B8D91] dark:fill-[#9FA2A7]">
            {/* Head & Cropped Hair */}
            <path d="M50 18 C39 18 32 25 32 35 C32 45 39 52 46 54 L46 61 C32 64 17 72 13 91 C12 95 15 100 20 100 L80 100 C85 100 88 95 87 91 C83 72 68 64 54 61 L54 54 C61 52 68 45 68 35 C68 25 61 18 50 18 Z" />
          </g>
        )}
      </svg>
    </div>
  );
}
