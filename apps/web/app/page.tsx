'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Loader2 } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(user ? '/dashboard' : '/login');
  }, [user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
      <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
    </div>
  );
}
