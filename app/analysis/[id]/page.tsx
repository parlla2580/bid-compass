import type { Metadata } from 'next';
import { BackHeader, Shell } from '@/components/layout';
import OpeningView from './client';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: '개찰 결과' };

/** 우리 회사가 참여한 개찰 1건 요약 */
export default async function OpeningPage({ params }: Props) {
  const { id } = await params;
  return (
    <Shell wide>
      <BackHeader title="개찰 결과" fallback="/analysis" />
      <OpeningView id={Number(id)} />
    </Shell>
  );
}
