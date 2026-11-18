'use client';

import { useEffect, useState } from 'react';
import { Tip } from '@/components/tip';
import type { BidType } from '@/lib/data';
import { fetchBacktestCurve, type BacktestCurve } from '@/lib/reserve';

/*
 * 사정률별 '지난 개찰에 썼다면 1순위였을 비율' 곡선 (027 bid_backtest_curve, 2026-11-18)
 *  · 실측: 1순위 비율의 꼭대기가 무작위 오차보다 뾰족하지 않음 → '최고 확률 사정률' 추천은 하지 않음
 *  · 대신 지금 고른 사정률이 꼭대기와 오차 안인지, 더 낮게 써서 미달만 늘리는지 알려 줌
 *  · 평균 몫 = 개찰마다 1 ÷ (하한을 넘긴 업체 수 + 1)의 평균 — 순위가 무작위일 때의 기대값
 */

const cache = new Map<string, Promise<BacktestCurve | null>>();
const load = (type: BidType, floor: number, from: number, to: number) => {
  const k = `${type}|${floor}|${from}|${to}`;
  if (!cache.has(k)) cache.set(k, fetchBacktestCurve(type, floor, from, to, 0.25).catch(() => null));
  return cache.get(k)!;
};

export function BacktestCurveChart({ type, floor, R, lo, hi, cur }: {
  type: BidType; floor: number; R: number;
  /** 위 분포 그래프와 같은 가로축 */
  lo: number; hi: number; cur: number;
}) {
  const [c, setC] = useState<BacktestCurve | null | undefined>(undefined);
  useEffect(() => {
    let on = true;
    setC(undefined);
    load(type, floor, 100 - R, 100 + R).then((d) => on && setC(d));
    return () => { on = false; };
  }, [type, floor, R]);

  if (c === undefined) return <div className="mt-6 h-32 animate-pulse rounded-2xl bg-fill" />;
  if (!c || c.n < 100 || !c.points.length) return null;

  const pct = (v: number) => (v / c.n) * 100;
  const pts = c.points.map((p) => ({ s: Number(p.s), first: pct(p.first), below: pct(p.below) }));
  const luck = pct(c.luck);
  const peak = pts.reduce((m, p) => (p.first > m.first ? p : m), pts[0]);
  const at = pts.reduce((m, p) => (Math.abs(p.s - cur) < Math.abs(m.s - cur) ? p : m), pts[0]);
  // 꼭대기와의 차이가 두 비율의 표준오차 합(약 95%)보다 작으면 '비슷'
  const se = (p: number) => Math.sqrt((p / 100) * (1 - p / 100) / c.n) * 100;
  const close = peak.first - at.first <= 2 * Math.hypot(se(peak.first), se(at.first));
  const flatLo = pts.filter((p) => peak.first - p.first <= 2 * Math.hypot(se(peak.first), se(p.first)));

  const W = 600, H = 110;
  const yMax = Math.max(peak.first, luck) * 1.25 || 1;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  const y = (v: number) => H - (v / yMax) * (H - 8);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.s).toFixed(1)},${y(p.first).toFixed(1)}`).join(' ');
  const fmt = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;

  let msg: string;
  if (close) {
    msg = `${flatLo[0].s.toFixed(2)}~${flatLo[flatLo.length - 1].s.toFixed(2)}% 사이는 1순위 비율이 비슷해요(오차 안). 이 안에서는 하한 미달 위험을 보고 고르세요.`;
    if (at.below >= 50) msg += ` 지금 사정률은 하한 미달이 ${fmt(at.below)}로 높아요.`;
  } else if (cur < peak.s) {
    msg = `낮게 쓴다고 1순위가 늘지 않았어요. ${peak.s.toFixed(2)}% 근처가 1순위가 더 많았고(${fmt(peak.first)}), 지금 사정률은 하한 미달이 ${fmt(at.below)}예요.`;
  } else {
    msg = `높게 쓸수록 금액이 올라 1순위가 줄었어요. 지난 개찰에선 ${peak.s.toFixed(2)}% 근처가 더 많았어요(${fmt(peak.first)}). 다음 개찰도 그렇다는 보장은 없어요.`;
  }

  return (
    <div className="mt-6">
      <p className="flex items-center gap-1 text-[14px] font-semibold text-ink">
        지난 {type} {c.n.toLocaleString()}건에 이 사정률로 썼다면 1순위였던 비율
        <Tip title="낙찰 확률 예측이 아니에요">
          지난 개찰마다 기초금액 × 사정률로 예정가격을 가정하고 그 하한선에 맞춰 썼다면 몇 번 1순위였을지 센 값이에요. 실제 하한선은 투찰 기록과 A값으로 추정했어요.
          점선은 순위가 무작위일 때의 기대값(평균 몫)이에요.
        </Tip>
      </p>
      <svg viewBox={`0 0 ${W} ${H + 6}`} className="mt-2 w-full" role="img"
        aria-label={`사정률 ${at.s.toFixed(2)}%에서 1순위 ${fmt(at.first)}, 평균 몫 ${fmt(luck)}`}>
        <line x1={0} x2={W} y1={y(luck)} y2={y(luck)} stroke="#8A929E" strokeWidth={1.5} strokeDasharray="5 5" />
        <path d={path} fill="none" stroke="#2563EB" strokeWidth={2.5} strokeLinejoin="round" />
        <line x1={x(cur)} x2={x(cur)} y1={0} y2={H} stroke="#191C21" strokeWidth={2} />
        <circle cx={x(at.s)} cy={y(at.first)} r={5} fill="#2563EB" stroke="#fff" strokeWidth={2} />
        <line x1={0} x2={W} y1={H} y2={H} stroke="#E4E7EC" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        <span><i className="mr-1 inline-block h-0.5 w-3.5 bg-brand align-middle" />1순위였던 비율</span>
        <span><i className="mr-1 inline-block w-3.5 border-t-2 border-dashed border-mute align-middle" />평균 몫 {fmt(luck)} (순위가 무작위일 때)</span>
      </div>
      <div className="mt-3 rounded-2xl bg-fill p-3.5 text-[14px] leading-relaxed text-sub">
        <p>사정률 <b className="text-ink">{at.s.toFixed(2)}%</b> 근처 → 1순위 <b className="text-brand">{fmt(at.first)}</b> · 하한 미달 {fmt(at.below)}</p>
        <p className="mt-1">{msg}</p>
        {peak.first < luck && <p className="mt-1 text-[12px] text-mute">어느 사정률도 평균 몫({fmt(luck)})보다 높지 않았어요. 사정률 하나로 이기는 방법은 지난 데이터에 없었어요.</p>}
      </div>
    </div>
  );
}
