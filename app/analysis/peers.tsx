'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/layout';
import { Tip } from '@/components/tip';
import { fetchPeers, type Peers } from '@/lib/analysis';

/*
 * 익명 업계 비교 (로드맵 3, 033) — 커뮤니티 대신 '남들은 어떻게 하나'
 *  비교 대상 = 최근 12개월 우리가 들어간 공고에서 2번 이상 만난 경쟁사(결과 난 투찰 5건 이상)
 *  개별 회사는 보여 주지 않고, 30곳 미만이면 카드를 그리지 않음
 *  화면: 낙찰률 순위(상위 ○%) 하나 + 분포 막대(가운데 50%·중앙·우리) + 투찰 건수 비교
 */

// 소수 한 자리 — 위 낙찰률 원(48.5%)과 같은 표기 · 경쟁사 0.2%가 '0%'로 뭉개지지 않게 (2026-11-22 전체 테스트)
const pct = (v: number) => `${(Math.round(v * 1000) / 10).toFixed(1)}%`;
/** 우리 결과가 이보다 적으면 순위를 내지 않음 (5건 중 0건으로 '상위 55%'가 나오던 문제) */
const MIN_MINE = 10;

export function PeersCard() {
  const [p, setP] = useState<Peers | null | undefined>(undefined);
  useEffect(() => { fetchPeers(12).then(setP).catch(() => setP(null)); }, []);
  if (!p || !p.enough || !p.rate || p.below == null || p.me?.rate == null) return null;
  if (p.me.settled < MIN_MINE) {
    return (
      <Card title="업계 비교" aside={<span className="text-[13px] text-mute">경쟁사 {p.n.toLocaleString()}곳</span>}>
        <p className="text-[15px] font-semibold text-ink">표본 부족</p>
        <p className="mt-0.5 text-[13px] tabular-nums text-mute">결과 난 투찰 {p.me.settled}건 · {MIN_MINE}건부터 순위 표시</p>
      </Card>
    );
  }

  const top = Math.max(1, Math.round((1 - p.below) * 100));
  const myRate = p.me.rate;
  const hi = Math.max(p.rate.p75, myRate) * 1.25 || 0.1;
  const x = (v: number) => `${Math.min(100, (v / hi) * 100)}%`;
  const perMonth = (v: number) => (v / p.months).toFixed(1);
  const tone = top <= 25 ? 'text-brand' : top >= 75 ? 'text-bad' : 'text-ink';

  return (
    <Card title={
      <span className="flex items-center gap-1">업계 비교
        <Tip title="업계 비교">최근 {p.months}개월 우리가 들어간 공고에서 자주 만난 경쟁사 {p.n.toLocaleString()}곳과 낙찰률을 비교했어요. 개별 회사는 공개하지 않아요. 낙찰은 운도 커서 참고만 하세요.</Tip>
      </span>}
      aside={<span className="text-[13px] text-mute">경쟁사 {p.n.toLocaleString()}곳</span>}>
      {/* A7: 위 도넛(전체 기간)과 숫자가 다른 이유 — 기간을 배지로 */}
      <p className="flex items-center gap-1.5 text-[12px] text-mute">낙찰률 순위<span className="rounded bg-fill px-1.5 py-0.5 text-[11px]">최근 {p.months}개월</span></p>
      <p className={`mt-0.5 text-[28px] font-bold tracking-tight ${tone}`}>상위 {top}%</p>
      <p className="text-[13px] tabular-nums text-mute">우리 {pct(myRate)} · 경쟁사 보통 {pct(p.rate.p50)} {p.rate.p75 < 0.01 ? '(보통 1% 미만)' : `(보통 ${pct(p.rate.p25)}~${pct(p.rate.p75)})`}</p>

      <div className="relative mb-6 mt-4 h-2 rounded-full bg-fill">
        <div className="absolute h-2 rounded-full bg-[#C9D7F9]" style={{ left: x(p.rate.p25), width: `calc(${x(p.rate.p75)} - ${x(p.rate.p25)})` }} />
        <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-ink" style={{ left: x(p.rate.p50) }} />
        <span className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: x(myRate) }}>
          <span className="mx-auto block h-0 w-0 border-x-[6px] border-b-[8px] border-x-transparent border-b-brand" />
          <span className="block text-[11px] font-semibold text-brand">우리</span>
        </span>
      </div>

      {p.bids && (
        <div className="grid grid-cols-2 gap-2 text-[14px]">
          <div className="rounded-2xl bg-fill px-4 py-3">
            <p className="text-[12px] text-mute">월 투찰 · 우리</p>
            <p className="mt-0.5 font-semibold tabular-nums">{perMonth(p.me.bids)}건</p>
          </div>
          <div className="rounded-2xl bg-fill px-4 py-3">
            <p className="text-[12px] text-mute">월 투찰 · 경쟁사 보통</p>
            <p className="mt-0.5 font-semibold tabular-nums">{perMonth(p.bids.p50)}건</p>
          </div>
        </div>
      )}
    </Card>
  );
}
