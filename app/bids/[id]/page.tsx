import type { Metadata } from 'next';
import { BackHeader, Shell } from '@/components/layout';
import NoticeDetail from './client';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: '공고 상세' };

/** S4. 공고 상세 — 공고는 화면에서 Supabase로 불러옴 */
export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Shell>
      <BackHeader title="공고 상세" />
      <NoticeDetail id={Number(id)} />
    </Shell>
  );
}
