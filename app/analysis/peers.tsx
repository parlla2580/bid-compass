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

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PeersCard() {
  const [p, setP] = useState<Peers | null | undefined>(undefined);
  useEffect(() => { fetchPeers(12).then(setP).catch(() => setP(null)); }, []);
  if (!p || !p.enough || !p.rate || p.below == null || p.me?.rate == null) return null;

  const top = Math.max(1, Math.round((1 - p.below) * 100));
  const myRate = p.me.rate;
  const hi = Math.max(p.rate.p75, myRate) * 1.25 || 0.1;
  const x = (v: number) => `${Math.min(100, (v / hi) * 100)}%`;
  const perMonth = (v: number) => (v / p.months).toFixed(1);
  const tone = top <= 25 ? 'text-brand' : top >= 75 ? 'text-bad' : 'text-ink';

  return (
    <Card title={
      <span className="flex items-center gap-1">업계 비교
        <Tip title="비교 대상">최근 {p.months}개월 우리가 들어간 공고에서 2번 이상 만난 경쟁사 중 결과가 난 투찰이 5건 이상인 회사 {p.n.toLocaleString()}곳. 같은 유형 공고만 · 개별 회사는 공개하지 않음 · 30곳 미만이면 표시 안 함. 낙찰은 추첨 영향이 커서 참고용.</Tip>
      </span>}
      aside={<span className="text-[13px] text-mute">경쟁사 {p.n.toLocaleString()}곳 · 최근 {p.months}개월</span>}>
      <p className="text-[12px] text-mute">낙찰률 순위</p>
      <p className={`mt-0.5 text-[28px] font-bold tracking-tight ${tone}`}>상위 {top}%</p>
      <p className="text-[13px] tabular-nums text-mute">우리 {pct(myRate)} · 경쟁사 보통 {pct(p.rate.p50)} (대부분 {pct(p.rate.p25)}~{pct(p.rate.p75)})</p>

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
