'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('tab', 'awaiting');
    router.replace(`/documents?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mb-2" />
      <p className="text-sm font-medium text-neutral-500">Redirecting to Document Approvals...</p>
    </div>
  );
}

export default function DocumentManageRedirect() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-400 mb-2" />
          <p className="text-sm font-medium text-neutral-500">Loading Document Approvals...</p>
        </div>
      }
    >
      <RedirectContent />
    </Suspense>
  );
}
