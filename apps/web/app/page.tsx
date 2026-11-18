'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { AppShellSkeleton } from '@/components/skeletons';

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(user ? '/dashboard' : '/login');
  }, [user, router]);

  return <AppShellSkeleton label="Opening workspace..." />;
}
