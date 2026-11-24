import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, Header, PageTitle, Shell } from '@/components/layout';
import { TYPE_ORDER, fetchMarketList } from '@/lib/market';

/*
 * 공개 업종 시장 리포트 목록 (052, 2026-11-24 오픈 전 아하 포인트 ⑤) — 로그인 불필요
 */
export const revalidate = 600;
export const metadata: Metadata = {
  title: '업종별 공공조달 시장',
  description: '물품·용역·공사 업종별 나라장터 공고 수, 보통 경쟁, 낙찰률 범위, 많이 낸 기관 — 최근 12개월',
};

export default async function MarketIndex() {
  const list = await fetchMarketList();
  return (
    <Shell wide>
      <Header />
      <PageTitle title="업종별 시장" sub="나라장터 최근 12개월 공고 기준" />
      <main className="space-y-3 px-5 pb-28 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0 lg:px-0 lg:pb-0">
        {list.length === 0 && <p className="rounded-box bg-white p-6 text-center text-[15px] text-mute">시장 리포트 준비 중</p>}
        {TYPE_ORDER.map((t) => {
          const rows = list.filter((m) => m.type === t);
          if (!rows.length) return null;
          return (
            <Card key={t} title={t} aside={<span className="text-[13px] text-mute">{rows.length}개 업종</span>}>
              <ul className="-my-1 divide-y divide-line">
                {rows.map((m) => (
                  <li key={m.slug}>
                    <Link href={`/market/${m.slug}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                      <span className="min-w-0 flex-1 truncate text-[15px]">{m.name}</span>
                      <span className="shrink-0 text-[13px] tabular-nums text-mute">공고 {m.data.notices.toLocaleString()}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </main>
    </Shell>
  );
}
