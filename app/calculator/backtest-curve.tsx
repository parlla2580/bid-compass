'use client';

import { useEffect, useRef, useState } from 'react';
import { Tip } from '@/components/tip';
import type { BidType } from '@/lib/data';
import { fetchBacktestCurve, type BacktestCurve } from '@/lib/reserve';

/*
 * 사정률별 '지난 개찰에 썼다면 1순위였던 비율' 곡선 (027 bid_backtest_curve)
 *  · 실측: 꼭대기가 무작위 오차보다 뾰족하지 않음 → '최고 확률 사정률' 추천은 하지 않음
 *  · 2026-11-18 디자인 정리: 범례 상자 없이 기준선에 바로 이름, 지금 지점에 값 말풍선, 올리면(탭) 값,
 *    아래 설명은 두 줄 — 선·점·글자는 SVG 비율과 상관없이 같은 굵기·크기(HTML 겹침)
 */

const cache = new Map<string, Promise<BacktestCurve | null>>();
const load = (type: BidType, floor: number, from: number, to: number) => {
  const k = `${type}|${floor}|${from}|${to}`;
  if (!cache.has(k)) cache.set(k, fetchBacktestCurve(type, floor, from, to, 0.25).catch(() => null));
  return cache.get(k)!;
};

const fmt = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)}%`;

export function BacktestCurveChart({ type, floor, R, lo, hi, cur }: {
  type: BidType; floor: number; R: number;
  /** 위 분포 그래프와 같은 가로축 */
  lo: number; hi: number; cur: number;
}) {
  const [c, setC] = useState<BacktestCurve | null | undefined>(undefined);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let on = true;
    setC(undefined);
    load(type, floor, 100 - R, 100 + R).then((d) => on && setC(d));
    return () => { on = false; };
  }, [type, floor, R]);

  if (c === undefined) return <div className="mt-6 h-36 animate-pulse rounded-2xl bg-fill" />;
  if (!c || c.n < 100 || !c.points.length) return null;

  const pts = c.points.map((p) => ({ s: Number(p.s), first: (p.first / c.n) * 100, below: (p.below / c.n) * 100 }));
  const luck = (c.luck / c.n) * 100;
  const peak = pts.reduce((m, p) => (p.first > m.first ? p : m), pts[0]);
  const near = (v: number) => pts.reduce((m, p) => (Math.abs(p.s - v) < Math.abs(m.s - v) ? p : m), pts[0]);
  const at = near(cur);
  const se = (p: number) => Math.sqrt((p / 100) * (1 - p / 100) / c.n) * 100;
  const same = (p: typeof at) => peak.first - p.first <= 2 * Math.hypot(se(peak.first), se(p.first));
  const flat = pts.filter(same);

  // 좌표 (%) — 가로는 위 분포 그래프와 같은 축
  const yMax = Math.max(peak.first, luck) * 1.3 || 1;
  const X = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const Y = (v: number) => 100 - (v / yMax) * 100;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.s).toFixed(2)},${Y(p.first).toFixed(2)}`).join(' ');
  const area = `${line} L${X(pts[pts.length - 1].s).toFixed(2)},100 L${X(pts[0].s).toFixed(2)},100 Z`;
  const show = hover !== null ? near(hover) : null;

  const pct2 = (v: number) => `${v.toFixed(2)}%`;
  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setHover(lo + ((e.clientX - r.left) / r.width) * (hi - lo));
  };

  // 한 줄 판단
  let msg: string;
  if (same(at)) msg = `${pct2(flat[0].s)}~${pct2(flat[flat.length - 1].s)}는 어디에 써도 1순위 비율이 비슷해요.`;
  else if (cur < peak.s) msg = `낮게 쓴다고 1순위가 늘지 않았어요. ${pct2(peak.s)} 쪽이 더 많았어요.`;
  else msg = `높일수록 1순위가 줄었어요. ${pct2(peak.s)} 쪽이 더 많았어요.`;

  return (
    <div className="mt-7">
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex items-center gap-1 text-[14px] font-semibold text-ink">
          이 사정률로 썼다면 1순위였던 비율
          <Tip title="지난 개찰에 대 본 값이에요">
            지난 {type} {c.n.toLocaleString()}건에 기초금액 × 사정률을 예정가격으로 보고 하한선에 맞춰 썼다면 1순위였던 비율이에요.
            점선은 순위가 무작위일 때의 기대값이에요.
          </Tip>
        </p>
        <span className={`shrink-0 text-[12px] text-mute transition-opacity ${show ? 'opacity-0' : ''}`}>지난 {c.n.toLocaleString()}건</span>
      </div>

      <div ref={box} className="relative mt-3 h-32 touch-none select-none"
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="bt-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#2563EB" stopOpacity="0.16" />
              <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1="100" y2="100" stroke="#E4E7EC" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2="100" y1={Y(luck)} y2={Y(luck)} stroke="#B4BAC4" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={area} fill="url(#bt-fill)" />
          <path d={line} fill="none" stroke="#2563EB" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line x1={X(cur)} x2={X(cur)} y1="0" y2="100" stroke="#191C21" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {show && <line x1={X(show.s)} x2={X(show.s)} y1="0" y2="100" stroke="#8A929E" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>

        {/* 기준선 이름 — 선 오른쪽 위에 바로 */}
        <span className="pointer-events-none absolute right-0 -translate-y-full pb-0.5 text-[11px] text-mute" style={{ top: `${Y(luck)}%` }}>평균 몫 {fmt(luck)}</span>

        {/* 지금 고른 지점 — 점 + 값 말풍선 */}
        <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-white" style={{ left: `${X(at.s)}%`, top: `${Y(at.first)}%` }} />
        {!show && (
          <span className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md bg-ink px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-white"
            style={{ left: `${Math.min(92, Math.max(8, X(at.s)))}%`, top: `${Y(at.first)}%` }}>{fmt(at.first)}</span>
        )}

        {/* 올리면(탭) 그 사정률 값 */}
        {show && (
          <>
            <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-brand" style={{ left: `${X(show.s)}%`, top: `${Y(show.first)}%` }} />
            <span className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+4px)] whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-[12px] leading-tight shadow-[0_2px_10px_rgba(0,0,0,0.12)]"
              style={{ left: `${Math.min(80, Math.max(20, X(show.s)))}%` }}>
              <b className="tabular-nums text-ink">{show.s.toFixed(2)}%</b>
              <span className="ml-1.5 text-sub">1순위 <b className="tabular-nums text-ink">{fmt(show.first)}</b> · 미달 <b className="tabular-nums text-ink">{fmt(show.below)}</b></span>
            </span>
          </>
        )}
      </div>

      <div className="mt-3 rounded-2xl bg-fill px-4 py-3 text-[14px] leading-relaxed">
        <p className="text-sub">
          {at.s.toFixed(2)}% → 1순위 <b className="tabular-nums text-ink">{fmt(at.first)}</b>
          <span className="mx-1.5 text-line">|</span>하한 미달 <b className={`tabular-nums ${at.below >= 50 ? 'text-bad' : 'text-ink'}`}>{fmt(at.below)}</b>
        </p>
        <p className="mt-0.5 text-[13px] text-mute">{msg}</p>
      </div>
    </div>
  );
}
