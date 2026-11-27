import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { BackHeader, Card, Shell } from '@/components/layout';
import { Tip } from '@/components/tip';
import { CTA_PRIMARY } from '@/components/ui';
import { fetchMarketPage, mMoney } from '@/lib/market';

/*
 * 업종 시장 리포트 한 곳 (052) — 공개 정보만 · 로그인 불필요 · 1시간마다 새로
 *  공고 수 · 지금 열린 공고 · 보통 경쟁 · 낙찰률 보통 범위 · 추정가격 보통 범위 · 월별 공고 · 많이 낸 기관
 */
export const revalidate = 3600;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const m = await fetchMarketPage(slug);
  if (!m) return { title: '업종별 시장' };
  const d = m.data;
  const desc = [`${m.type} · 최근 12개월 공고 ${d.notices.toLocaleString()}건`, d.participants ? `평균 경쟁 ${Math.round(d.participants)}곳` : null,
    d.win_rate?.p25 ? `낙찰률 주요 구간 ${d.win_rate.p25.toFixed(1)}~${d.win_rate.p75!.toFixed(1)}%` : null].filter(Boolean).join(' · ');
  return { title: `${m.name} 공공조달 시장`, description: desc, openGraph: { title: `${m.name} 공공조달 시장`, description: desc, siteName: '입찰나침반' } };
}

export default async function MarketPage({ params }: Props) {
  const { slug } = await params;
  const m = await fetchMarketPage(slug);
  if (!m) notFound();
  const d = m.data;
  const max = Math.max(1, ...d.months.map((x) => x.n));
  const ym = (s: string) => `${Number(s.slice(5))}월`;
  const box = 'rounded-2xl bg-fill px-4 py-3';
  return (
    <Shell>
      <BackHeader title="업종별 시장" fallback="/market" />
      <main className="space-y-3 px-5 pb-28 pt-1 lg:space-y-4 lg:px-0 lg:pb-0">
        <section>
          <p className="flex items-center gap-1.5"><span className="rounded bg-brand-soft px-1.5 py-0.5 text-[12px] font-semibold text-brand">{m.type}</span></p>
          <h1 className="mt-1.5 text-[24px] font-bold leading-snug tracking-tight lg:text-[28px]">{m.name} 시장</h1>
          <p className="mt-1 flex items-center gap-1 text-[13px] tabular-nums text-mute">
            {d.from && d.to ? `${d.from.slice(2).replace(/-/g, '.')}~${d.to.slice(2).replace(/-/g, '.')}` : '최근 12개월'} · 나라장터 공고 기준
            <Tip title="업종별 시장">나라장터 공고를 {m.type === '물품' ? '세부품명' : m.type === '용역' ? '용역 분류' : '대표 면허'}별로 모은 숫자예요. 쇼핑몰·단가계약은 빼고 하루 한 번 새로 계산해요. 평균은 가운데 값(중앙값), 주요 구간은 가운데 50%예요. 지난 결과라 다음 입찰을 예측하진 않아요.</Tip>
          </p>
        </section>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className={box}><p className="text-[12px] text-mute">공고</p><p className="mt-0.5 text-[22px] font-bold tabular-nums">{d.notices.toLocaleString()}건</p></div>
          <Link href={`/bids?tab=all&q=${encodeURIComponent(m.name)}`} className={`${box} hover:bg-line/60`}>
            <p className="text-[12px] text-mute">지금 열린 공고</p><p className="mt-0.5 text-[22px] font-bold tabular-nums text-brand">{d.open_now.toLocaleString()}건</p>
          </Link>
          <div className={box}><p className="text-[12px] text-mute">평균 경쟁</p><p className="mt-0.5 text-[22px] font-bold tabular-nums">{d.participants ? `${Math.round(d.participants)}곳` : '–'}</p></div>
          <div className={box}>
            <p className="text-[12px] text-mute">낙찰률</p>
            {d.win_rate?.p50 ? (<><p className="mt-0.5 text-[22px] font-bold tabular-nums">{d.win_rate.p50.toFixed(2)}%</p><p className="text-[12px] tabular-nums text-mute">주요 구간 {d.win_rate.p25!.toFixed(2)}~{d.win_rate.p75!.toFixed(2)}%</p></>) : <p className="mt-1 text-[14px] font-semibold text-mute">표본 부족</p>}
          </div>
        </div>

        {d.price?.p50 && (
          <Card title="추정가격" aside={<span className="text-[13px] text-mute">공고 {d.price.n.toLocaleString()}건</span>}>
            <p className="text-[22px] font-bold tabular-nums">{mMoney(d.price.p50)}</p>
            <p className="text-[13px] tabular-nums text-mute">주요 구간 {mMoney(d.price.p25)}~{mMoney(d.price.p75)}</p>
          </Card>
        )}

        {d.months.length > 1 && (
          <Card title="월별 공고">
            <div className="flex h-28 items-end gap-1.5">
              {d.months.map((x) => (
                <div key={x.ym} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-[11px] tabular-nums text-mute">{x.n}</span>
                  <div className="w-full rounded-t bg-[#C9D7F9]" style={{ height: `${(x.n / max) * 72}px` }} />
                  <span className="text-[11px] tabular-nums text-mute">{ym(x.ym)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {d.orgs.length > 0 && (
          <Card title="공고 많이 낸 기관">
            <ul className="-my-1 divide-y divide-line">
              {d.orgs.map((o) => (
                <li key={o.org}>
                  <Link href={`/orgs?name=${encodeURIComponent(o.org)}`} className="flex items-center gap-3 py-3 text-[15px] hover:opacity-80">
                    <span className="min-w-0 flex-1 truncate">{o.org}</span>
                    <span className="shrink-0 text-[13px] tabular-nums text-mute">공고 {o.n}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* 가입 유도 — 이 업종에서 우리 회사가 참여할 수 있는 공고 */}
        <section className="rounded-box bg-white p-5 lg:p-6">
          <p className="text-[17px] font-bold">우리 회사가 참여할 수 있는 공고만</p>
          <p className="mt-1 text-[14px] text-sub">업종·지역만 넣으면 참여 가능 여부와 적합도를 함께 보여 드려요</p>
          <p className="mt-2"><span className="rounded bg-fill px-1.5 py-0.5 text-[12px] text-mute">가입 불필요 · 무료</span></p>
          <Link href="/start" className={`${CTA_PRIMARY} mt-4`}>맞춤 공고 보기</Link>
        </section>
        <p className="px-1 text-center text-[12px] text-mute"><Link href="/market" className="underline">다른 업종 시장 보기</Link></p>
      </main>
    </Shell>
  );
}
