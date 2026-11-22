import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Shell } from '@/components/layout';
import OrgPage from './client';

export const metadata: Metadata = { title: '발주기관' };

export default function Page() {
  return (
    <Shell>
      <Suspense fallback={null}><OrgPage /></Suspense>
    </Shell>
  );
}
