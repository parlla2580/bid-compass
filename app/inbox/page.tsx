import type { Metadata } from 'next';
import { BackHeader, Shell } from '@/components/layout';
import InboxView from './client';

export const metadata: Metadata = { title: '알림' };

export default function InboxPage() {
  return (
    <Shell>
      <BackHeader title="알림" fallback="/" />
      <InboxView />
    </Shell>
  );
}
