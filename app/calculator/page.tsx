import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Header, Shell } from '@/components/layout';
import CalculatorTabs from './calculator';

export const metadata: Metadata = { title: '적격심사 도구' };

export default function CalculatorPage() {
  return (
    <Shell>
      <Header />
      <Suspense>
        <CalculatorTabs />
      </Suspense>
    </Shell>
  );
}
