import type { Metadata } from 'next';
import { BackHeader, Shell } from '@/components/layout';
import WeeklyView from './client';

export const metadata: Metadata = { title: '이번 주 리포트' };

export default function WeeklyPage() {
  return (
    <Shell>
      <BackHeader title="이번 주 리포트" fallback="/inbox" />
      <WeeklyView />
    </Shell>
  );
}
