'use client';

import { useEffect, useMemo, useState } from 'react';
import { Term } from '@/components/term';
import type { BidType } from '@/lib/data';
import { fmtWon } from '@/lib/format';
import { cdf, fetchBacktest, fetchSajeongDist, quantile, type Backtest, type SajeongDist } from '@/lib/reserve';

/*
 * 사정률 분포로 투찰금액 정하기
 * - 과거 사정률 분포(같은 유형 전체) + 같은 기관 건은 점으로 겹쳐 표시
 * - 슬라이더로 사정률을 고르면 투찰금액 = 기초금액 × 사정률 × 낙찰하한율
 * - 이 사정률로 썼을 때 실제 사정률이 더 높게 나오면 하한 미달 → 과거 분포로 그 비율을 보여줌
 */

const STRATEGIES = [
  { key: 'safe', label: '안정형', q: 0.85, desc: '하한 미달 위험이 낮은 대신 금액이 높아요' },
  { key: 'mid', label: '중심형', q: 0.5, desc: '가장 흔한 사정률에 맞춰요' },
  { key: 'bold', label: '공격형', q: 0.3, desc: '금액을 낮춰 1순위를 노리지만 미달 위험이 커요' },
] as const;

const BIN = 0.25;

export function SajeongPanel({ type, base, floor, range, org, demandOrg, onUse }: {
  type: BidType;
  base: number;
  floor: number;
  /** 예비가격 범위 ± (%) */
  range: number;
  org?: string | null;
  demandOrg?: string | null;
  onUse: (amount: number) => void;
}) {
  const [dist, setDist] = useState<SajeongDist | null>(null);
  const [failed, setFailed] = useState(false);
  const [s, setS] = useState<number | null>(null);
  const [bt, setBt] = useState<Backtest | null>(null);

  useEffect(() => {
    setDist(null);
    fetchSajeongDist(type, org, demandOrg).then((d) => { setDist(d); setS(Math.round(quantile(d.sorted, 0.5) * 100) / 100); }).catch(() => setFailed(true));
  }, [type, org, demandOrg]);

  // 되돌려보기 — 슬라이더를 멈추면 조회
  useEffect(() => {
    if (s === null || !floor) return;
    const t = setTimeout(() => fetchBacktest(type, s, floor).then(setBt), 400);
    return () => clearTimeout(t);
  }, [type, s, floor]);

  const R = Math.max(range || 2, 2);
  const lo = 100 - R - 0.5, hi = 100 + R + 0.5;
  const bins = useMemo(() => {
    const n = Math.round((hi - lo) / BIN);
    const all = new Array(n).fill(0), mine = new Array(n).fill(0);
    for (const p of dist?.points ?? []) {
      const i = Math.floor((p.rate - lo) / BIN);
      if (i < 0 || i >= n) continue;
      all[i]++;
      if (p.sameOrg) mine[i]++;
    }
    return { all, mine, max: Math.max(1, ...all) };
  }, [dist, lo, hi]);

  if (failed) return null;
  const sorted = dist?.sorted ?? [];
  const sameOrgCount = dist?.points.filter((p) => p.sameOrg).length ?? 0;
  const cur = s ?? 100;
  const amount = Math.round(base * (cur / 100) * (floor / 100));
  const ok = cdf(sorted, cur);
  const W = 600, H = 150, x = (v: number) => ((v - lo) / (hi - lo)) * W;

  return (
    <div className="rounded-box bg-white p-5 lg:col-span-2 lg:p-6">
      <h2 className="text-[17px] font-bold">사정률로 투찰금액 정하기</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-mute">
        <Term k="예정가격" />은 예비가격 여러 개 중 추첨된 몇 개의 평균이라 <b className="font-semibold text-sub">100% 근처에 몰려요.</b> 지난 {type} 개찰 {sorted.length.toLocaleString()}건의 <Term k="사정률" /> 분포예요.
      </p>

      {!dist ? <div className="mt-4 h-40 animate-pulse rounded-2xl bg-fill" /> : sorted.length < 30 ? (
        <p className="mt-4 text-[15px] text-mute">비교할 과거 개찰이 아직 적어요. 데이터가 쌓이면 보여드릴게요.</p>
      ) : (
        <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-8">
          <div>
            {/* 분포 그래프 */}
            <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label={`사정률 분포, 선택 ${cur.toFixed(2)}%`}>
              <rect x={0} y={0} width={x(cur)} height={H} fill="#EEF3FE" />
              {bins.all.map((c, i) => {
                const h = (c / bins.max) * (H - 10);
                const bx = (i / bins.all.length) * W;
                const left = lo + (i + 1) * BIN <= cur;
                return <rect key={i} x={bx + 1} y={H - h} width={W / bins.all.length - 2} height={h} rx={2} fill={left ? '#2563EB' : '#C9CED6'} />;
              })}
              {bins.mine.map((c, i) => c > 0 && (
                <circle key={`m${i}`} cx={(i + 0.5) * (W / bins.all.length)} cy={H - (bins.all[i] / bins.max) * (H - 10) - 8} r={4} fill="#191C21" />
              ))}
              <line x1={x(cur)} x2={x(cur)} y1={0} y2={H} stroke="#191C21" strokeWidth={2} />
              {[lo + 0.5, 100, hi - 0.5].map((v) => (
                <text key={v} x={x(v)} y={H + 18} textAnchor="middle" fontSize={13} fill="#8A929E">{v.toFixed(0)}%</text>
              ))}
            </svg>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
              <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand align-middle" />이 사정률 이하로 정해진 개찰</span>
              {sameOrgCount > 0 && <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-ink align-middle" />같은 기관 {sameOrgCount}건</span>}
            </div>

            <input type="range" className="range mt-4" min={lo + 0.5} max={hi - 0.5} step={0.01} value={cur}
              aria-label="내가 걸 사정률" style={{ '--p': `${((cur - (lo + 0.5)) / (hi - lo - 1)) * 100}%` } as React.CSSProperties}
              onChange={(e) => setS(Number(e.target.value))} />
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-btn bg-line/60 p-1">
              {STRATEGIES.map((st) => {
                const v = Math.round(quantile(sorted, st.q) * 100) / 100;
                const on = Math.abs(v - cur) < 0.005;
                return (
                  <button key={st.key} type="button" onClick={() => setS(v)} title={st.desc}
                    className={`rounded-[10px] py-2 text-[14px] font-semibold transition ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>
                    {st.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[13px] text-mute">{STRATEGIES.find((st) => Math.abs(Math.round(quantile(sorted, st.q) * 100) / 100 - cur) < 0.005)?.desc ?? '슬라이더로 직접 골랐어요'}</p>
          </div>

          {/* 결과 */}
          <div className="mt-5 lg:mt-0">
            <p className="text-[14px] text-mute">사정률 {cur.toFixed(2)}%로 쓰면</p>
            <p className="mt-1 text-[28px] font-bold tabular-nums tracking-tight">{fmtWon(amount)}</p>
            <p className="text-[13px] text-mute">기초금액 × {cur.toFixed(2)}% × 낙찰하한율 {floor}%</p>

            <dl className="mt-4 space-y-2.5 border-t border-line pt-4 text-[15px]">
              <div className="flex justify-between gap-3"><dt className="text-mute">과거 기준 하한 이상</dt><dd className="font-semibold">{Math.round(ok * 100)}%</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-mute">하한 미달</dt><dd className={`font-semibold ${ok < 0.5 ? 'text-bad' : ''}`}>{Math.round((1 - ok) * 100)}%</dd></div>
              {bt && bt.n >= 30 && (
                <div className="rounded-2xl bg-fill p-3.5 text-[14px] leading-relaxed text-sub">
                  이 금액 방식으로 <b className="text-ink">지난 {bt.n}건</b>에 썼다면<br />
                  1순위 <b className="text-brand">{bt.first}번</b> · 3위 안 {bt.top3}번 · 하한 미달 {bt.below}번
                </div>
              )}
            </dl>
            <button type="button" onClick={() => onUse(amount)} className="mt-4 h-12 w-full rounded-cta bg-ink text-[15px] font-semibold text-white active:scale-[.98]">
              이 금액으로 확인하기
            </button>
          </div>
        </div>
      )}
      <p className="mt-4 text-[12px] leading-relaxed text-mute">
        과거 분포로 본 참고 정보예요. 이번 공고의 사정률은 추첨으로 정해져 누구도 미리 알 수 없어요. 1순위는 가격 기준 순위이며, 적격심사는 다른 점수에 따라 낙찰이 달라질 수 있어요.
      </p>
    </div>
  );
}
