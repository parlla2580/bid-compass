import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header, Shell } from '@/components/layout';
import MyPage from './mypage';

export const metadata: Metadata = { title: '마이페이지' };

export default function MyPageRoute() {
  return (
    <Shell>
      <Header />
      <Suspense>
        <MyPage />
      </Suspense>
    </Shell>
  );
}
