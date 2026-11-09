'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/layout';
import { fmtShort } from '@/lib/format';
import { fetchMyMarket, type MyMarket } from '@/lib/analysis';

/*
 * 입찰 분석 — 「우리 시장」 (010 my_market)
 * 글보다 그림: 막대·100% 막대로 보여주고, 근거 건수를 항상 함께 표시
 */

const SHADES = ['#1D4ED8', '#3B6FE6', '#6B93EE', '#9DB7F4', '#C9D7F9'];
const MIN_RELIABLE = 10; // 우리 시장 개찰이 이보다 적으면 '데이터가 쌓이는 중' 표시

export function MarketSection() {
  const [m, setM] = useState<MyMarket | null | undefined>(undefined);
  useEffect(() => { fetchMyMarket(3).then(setM).catch(() => setM(null)); }, []);

  if (m === undefined) return <div className="h-48 animate-pulse rounded-box bg-white" />;
  if (!m || !m.verified) return null; // 010 실행 전이거나 회사 확인 전

  const n = m.my_openings ?? 0;
  const comps = m.competitors ?? [];
  const thin = n < MIN_RELIABLE;

  return (
    <section className="space-y-3 lg:space-y-4">
      <div className="px-1 pt-4">
        <h2 className="text-[20px] font-bold">우리 시장</h2>
        <p className="mt-0.5 text-[14px] text-mute">귀사가 투찰한 개찰 {n.toLocaleString()}건에 함께 들어온 회사들로 그린 시장 지도예요</p>
        {thin && <p className="mt-1 text-[13px] font-medium text-warn">아직 근거가 적어요({n}건). 데이터가 쌓이면 더 정확해져요.</p>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card title="자주 만나는 회사" aside={<span className="text-[13px] text-mute">함께 들어간 공고 수</span>}>
          {comps.length ? <Bars rows={comps.map((c) => ({ label: c.name, value: c.shared, sub: c.wins ? `이 시장 낙찰 ${c.wins}건` : undefined }))} /> : <Empty text="함께 3건 이상 들어간 회사가 아직 없어요" />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">참가 업체가 많은 공고와 아무 공고에나 들어가는 회사는 가중치를 낮춰 순위를 매겼어요.</p>
        </Card>

        <Card title="이 시장 낙찰 금액" aside={m.market?.openings_with_winner ? <span className="text-[13px] text-mute">낙찰 {m.market.openings_with_winner}건 기준</span> : null}>
          <Share market={m.market} />
        </Card>

        <Card title="그 회사들이 가는 다른 시장" aside={<span className="text-[13px] text-mute">최근 1년</span>}>
          {m.other_markets?.length
            ? <Bars rows={m.other_markets.map((o) => ({ label: `${o.org}`, tag: o.type, value: o.firms, sub: `공고 ${o.openings}건`, unit: '곳' }))} />
            : <Empty text="아직 찾은 다른 시장이 없어요" />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">자주 만나는 회사 중 몇 곳이 들어갔는지예요. 귀사가 아직 들어가지 않은 기관만 보여드려요.</p>
        </Card>

        <Card title="새로 들어온 회사" aside={<span className="text-[13px] text-mute">최근 90일</span>}>
          {m.newcomers?.length ? (
            <ul className="space-y-2.5">
              {m.newcomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 text-[13px] text-mute">함께 {c.shared}건</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="최근 새로 들어온 회사가 없어요" />}
        </Card>
      </div>
    </section>
  );
}

/** 가로 막대 — 값이 클수록 진한 파랑 */
function Bars({ rows }: { rows: { label: string; value: number; sub?: string; tag?: string; unit?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-medium">{r.label}{r.tag && <span className="ml-1.5 text-[12px] font-normal text-mute">{r.tag}</span>}</span>
            <span className="shrink-0 tabular-nums text-sub"><b className="font-semibold text-ink">{r.value.toLocaleString()}</b>{r.unit ?? '건'}{r.sub && <span className="ml-1.5 text-[12px] text-mute">{r.sub}</span>}</span>
          </div>
          <div className="h-2.5 rounded-full bg-fill">
            <div className="h-2.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SHADES[Math.min(SHADES.length - 1, Math.floor((1 - r.value / max) * SHADES.length))] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 100% 막대 — 상위 회사·우리·그 외 */
function Share({ market }: { market: MyMarket['market'] }) {
  if (!market || !market.total_amount) return <Empty text="낙찰 금액이 있는 개찰이 아직 없어요" />;
  const total = market.total_amount;
  const leaders = market.leaders.filter((l) => !l.me);
  const segs = [
    ...leaders.map((l, i) => ({ name: l.name, amount: l.amount, color: SHADES[i] ?? '#C9D7F9' })),
    ...(market.mine > 0 ? [{ name: '우리 회사', amount: market.mine, color: '#191C21' }] : []),
  ];
  const rest = Math.max(0, total - segs.reduce((s, x) => s + x.amount, 0));
  const all = [...segs, ...(rest > 0 ? [{ name: '그 외', amount: rest, color: '#E8EAED' }] : [])];
  const top3 = leaders.slice(0, 3).reduce((s, x) => s + x.amount, 0);
  return (
    <div>
      <p className="text-[15px] text-sub">상위 3곳이 <b className="text-[20px] font-bold text-ink">{Math.round((top3 / total) * 100)}%</b>를 가져갔어요</p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full">
        {all.map((s) => <div key={s.name} title={`${s.name} ${Math.round((s.amount / total) * 100)}%`} style={{ width: `${(s.amount / total) * 100}%`, background: s.color }} />)}
      </div>
      <ul className="mt-4 space-y-2 text-[14px]">
        {all.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className={`min-w-0 flex-1 truncate ${s.name === '우리 회사' ? 'font-semibold' : ''}`}>{s.name}</span>
            <span className="shrink-0 tabular-nums text-mute">{fmtShort(s.amount)}원</span>
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{Math.round((s.amount / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[14px] text-mute">{text}</p>;
}
