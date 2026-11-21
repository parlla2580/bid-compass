import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BackHeader, Shell } from '@/components/layout';
import OrgView from './client';

export const metadata: Metadata = { title: '발주기관' };

export default function OrgPage() {
  return (
    <Shell>
      <BackHeader title="발주기관" fallback="/bids" />
      <Suspense fallback={null}><OrgView /></Suspense>
    </Shell>
  );
}
