'use client';

import React from 'react';

export interface CompanyLogoProps {
  variant?: 'full' | 'mark';
  className?: string;
  alt?: string;
}

export function CompanyLogo({
  variant = 'full',
  className = 'h-8 w-auto',
  alt = 'Azir Company Global Tech',
}: CompanyLogoProps) {
  const src = variant === 'mark' ? '/company-logo-mark.svg' : '/company-logo.svg';

  return (
    <img
      src={src}
      alt={alt}
      className={`select-none object-contain transition-all dark:invert dark:brightness-150 ${className}`}
      loading="eager"
    />
  );
}
