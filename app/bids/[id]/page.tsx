import type { Metadata } from 'next';
import { BackHeader, Shell } from '@/components/layout';
import NoticeDetail from './client';
import { fetchOgNotice, ogDeadline, ogMoney } from '@/lib/og-notice';

type Props = { params: Promise<{ id: string }> };

/** 공유 미리보기(카톡 등) 제목·설명 — 공개 정보만 (이미지는 opengraph-image.tsx) */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const n = await fetchOgNotice(Number(id));
  if (!n) return { title: '공고 상세' };
  const dl = ogDeadline(n.closesAt);
  const desc = [n.type, n.org, `추정 ${ogMoney(n.estPrice)}`, dl.d != null && dl.d >= 0 ? `마감 ${dl.text} (D-${dl.d})` : null, n.participants ? `보통 ${n.participants}곳 경쟁` : null]
    .filter(Boolean).join(' · ');
  return {
    title: n.title,
    description: desc,
    openGraph: { title: n.title, description: `${desc} — 참여 가능 여부·투찰 금액은 입찰나침반에서`, type: 'article', siteName: '입찰나침반' },
    twitter: { card: 'summary_large_image', title: n.title, description: desc },
  };
}

/** S4. 공고 상세 — 공고는 화면에서 Supabase로 불러옴 */
export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <Shell wide tabs={false}>
      <BackHeader title="공고 상세" />
      <NoticeDetail id={Number(id)} />
    </Shell>
  );
}
