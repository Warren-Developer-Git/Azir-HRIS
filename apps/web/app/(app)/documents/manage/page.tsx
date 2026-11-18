'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TableSkeleton } from '@/components/skeletons';

function RedirectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('tab', 'awaiting');
    router.replace(`/documents?${params.toString()}`);
  }, [router, searchParams]);

  return <TableSkeleton rows={5} columns={5} showToolbar />;
}

export default function DocumentManageRedirect() {
  return (
    <Suspense fallback={<TableSkeleton rows={5} columns={5} showToolbar />}>
      <RedirectContent />
    </Suspense>
  );
}
