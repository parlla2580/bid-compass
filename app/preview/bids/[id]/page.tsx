import type { Metadata } from 'next';
import PreviewDetail from './client';

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: '공고 상세 (새 디자인 견본)', robots: { index: false } };

/** v3 디자인 견본 — 기존 /bids/[id] 와 비교용 */
export default async function Page({ params }: Props) {
  const { id } = await params;
  return <PreviewDetail id={Number(id)} />;
}
