import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header, Shell } from '@/components/layout';
import BidList from './bid-list';

export const metadata: Metadata = { title: '공고' };

export default function BidsPage() {
  return (
    <Shell wide>
      <Header />
      <Suspense>
        <BidList />
      </Suspense>
    </Shell>
  );
}
