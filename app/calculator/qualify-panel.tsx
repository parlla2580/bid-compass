'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Term } from '@/components/term';
import { Tip } from '@/components/tip';
import type { Notice } from '@/lib/data';
import { fmtKorean, fmtWon } from '@/lib/format';
import { fetchNoticeCost } from '@/lib/notices';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/feedback';
import { CREDIT, LOCAL_ORG, TIERS, amountAt, impliedFloor, passRange, priceScore, tierOf, type Tier } from './qualify';

/*
 * 공사 적격심사 — 우리 회사 점수로 '통과하려면 몇 %로 써야 하나' (기획 3단계, 2026-11-17)
 * 낙찰하한율은 가격 외 점수 만점 회사 기준 → 점수가 모자라면 하한율로 써도 탈락할 수 있음
 */

const SEL = 'h-12 w-full rounded-btn bg-fill px-4 text-[16px] font-semibold focus:outline-none focus:ring-2 focus:ring-brand';
const pctS = (v: number) => `${v.toFixed(3)}%`;
const LOCAL = LOCAL_ORG;

export function QualifyPanel({ notice, onUseRate }: { notice: Notice | null; onUseRate: (rate: number) => void }) {
  const auto = tierOf(notice?.estPrice);
  const [tierKey, setTierKey] = useState<string>(auto?.key ?? 't5');
  useEffect(() => { if (auto) setTierKey(auto.key); }, [auto]);
  const tier: Tier = TIERS.find((t) => t.key === tierKey) ?? TIERS[3];
  const creditMax = tier.credit[0];
  const otherMax = Math.round((tier.nonPrice - creditMax) * 1000) / 1000;

  // 저장한 점수 프로필(032)이 있으면 그 값으로 시작
  const { profile, updateProfile } = useStore();
  const toast = useToast();
  const saved = profile.qualify ?? null;
  const [credit, setCredit] = useState(saved?.credit ?? 0);
  const [other, setOther] = useState<number | null>(null);
  const [adj, setAdj] = useState<number | null>(saved?.adj ?? 0);
  useEffect(() => { setOther(null); }, [tierKey]);
  useEffect(() => { if (saved) { setCredit(saved.credit); setAdj(saved.adj); setOther(null); } }, [saved?.savedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const otherDefault = saved ? Math.round(otherMax * saved.otherRatio * 1000) / 1000 : otherMax;
  const otherV = Math.min(other ?? otherDefault, otherMax);
  const ratio = otherMax > 0 ? Math.round((otherV / otherMax) * 1000) / 1000 : 1;
  const same = !!saved && saved.credit === credit && Math.abs(saved.otherRatio - ratio) < 0.001 && saved.adj === (adj ?? 0);
  const save = () => {
    updateProfile({ qualify: { credit, otherRatio: ratio, adj: adj ?? 0, savedAt: new Date().toISOString() } });
    toast('저장됨 · 공사 적격심사 공고마다 통과선 자동 계산');
  };
  const nonPrice = Math.round((tier.credit[credit] + otherV + (adj ?? 0)) * 1000) / 1000;
  const range = passRange(tier, nonPrice);
  const floor = notice?.floorRate ?? impliedFloor(tier);

  // A값 — 공고에서 왔으면 (026)
  const [a, setA] = useState(0);
  useEffect(() => {
    if (!notice?.id) return;
    fetchNoticeCost(notice.id).then((c) => setA(c?.aValue && c.aApply !== false ? c.aValue : 0)).catch(() => setA(0));
  }, [notice?.id]);
  const base = notice?.basePrice ?? null;

  const local = !notice || LOCAL.test(notice.demandOrg ?? notice.org ?? '');
  const gap = range.low !== null ? Math.round((range.low - floor) * 1000) / 1000 : null;

  return (
    <section className="fade-up space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0" role="tabpanel">
      <div className="space-y-5 rounded-box bg-white p-5 lg:p-6">
        <div>
          <h2 className="flex items-center gap-1 text-[17px] font-bold">우리 회사 통과선
            <Tip title="왜 필요한가요"><Term k="낙찰하한율" />은 가격 외 점수 만점 회사 기준. 점수가 모자라면 하한율로 써도 95점 미달로 탈락할 수 있음.</Tip>
          </h2>
        </div>

        <div>
          <label htmlFor="q-tier" className="mb-2 block text-[14px] text-sub">추정가격 구간 {auto && <span className="text-mute">(공고 {fmtKorean(notice!.estPrice)})</span>}</label>
          <select id="q-tier" value={tierKey} onChange={(e) => setTierKey(e.target.value)} className={SEL}>
            {TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <p className="mt-1.5 text-[13px] text-mute">가격 외 만점 {tier.nonPrice}점 · {tier.items.map((i) => `${i.label}`).join(' · ')}</p>
        </div>

        <div>
          <label htmlFor="q-credit" className="mb-2 flex items-center gap-1 text-[14px] text-sub">경영상태 — 신용평가등급
            <Tip title="신용평가등급으로 평가할 때">입찰공고일 이전에 평가받아 유효기간 안에 있는 회사채·기업어음·기업신용평가등급 중 가장 최근 등급으로 평가해요. 재무비율로 평가받는 회사는 점수를 아래 &lsquo;그 밖의 점수&rsquo;에 함께 넣어 계산하세요.</Tip>
          </label>
          <select id="q-credit" value={credit} onChange={(e) => setCredit(Number(e.target.value))} className={SEL}>
            {CREDIT.map((c, i) => <option key={c.key} value={i}>{c.label} — {tier.credit[i]}점</option>)}
          </select>
          <p className="mt-1.5 text-[13px] text-mute">{CREDIT[credit].hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Num id="q-other" label={`그 밖의 점수 (최대 ${otherMax})`} value={other ?? otherDefault} onChange={setOther} />
          <Num id="q-adj" label="가점·감점" value={adj} onChange={setAdj} signed />
        </div>
        <p className="-mt-2 text-[13px] text-mute">시공경험 등 가격 외 나머지 · 세부기준표·협회 실적 확인</p>
        {/* 우리 회사 점수로 저장 → 공고 상세마다 통과선 자동 (로드맵 2) */}
        {same ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-fill px-3.5 py-3 text-[14px] font-semibold text-ok"><Check className="h-4 w-4" />저장됨 · 공사 공고마다 자동 계산</p>
        ) : (
          <button type="button" onClick={save} className="flex h-12 w-full items-center justify-center gap-1.5 rounded-btn bg-brand-soft text-[15px] font-semibold text-brand active:scale-[.98]">
            {saved ? '바꾼 점수로 다시 저장' : '우리 회사 점수로 저장'}
          </button>
        )}
        {!same && <p className="-mt-3 text-[12px] text-mute">저장하면 공사 적격심사 공고 상세에 통과선 자동 표시 · 그 밖의 점수는 만점 대비 비율({Math.round(ratio * 100)}%)로 저장</p>}
      </div>

      <div className="rounded-box bg-white p-5 lg:sticky lg:top-6 lg:row-span-2 lg:p-6">
        <p className="text-[14px] text-mute">가격 외 {nonPrice}점 → 가격점수 {range.need}점 필요</p>
        {range.low === null ? (
          <>
            <p className="mt-1 text-[22px] font-bold text-bad">통과 불가</p>
            <p className="mt-1 text-[14px] text-sub">가격점수 최고 {tier.price.max}점 · 가격 외 점수 {Math.round((tier.pass - tier.price.max - nonPrice) * 1000) / 1000}점 부족</p>
          </>
        ) : (
          <>
            <p className="mt-1 text-[14px] text-sub">통과 <Tip label="투찰 비율" title="(입찰가격 − A) ÷ (예정가격 − A)">A값이 없는 공고는 입찰가격 ÷ 예정가격. 소수점 다섯째 자리에서 반올림해 평가.</Tip></p>
            <p className="mt-0.5 text-[28px] font-bold tabular-nums tracking-tight text-brand">{range.wide ? `${pctS(range.low)} 이상` : `${pctS(range.low)} 이상 ${pctS(range.high!)} 미만`}</p>
            <p className={`mt-2 inline-flex rounded-full px-3 py-1.5 text-[14px] font-semibold ${gap && gap > 0 ? 'bg-bad/10 text-bad' : 'bg-fill text-ok'}`}>
              {gap && gap > 0 ? `하한율 ${pctS(floor)} + ${gap.toFixed(3)}%p 이상` : `하한율 ${pctS(floor)}로 통과`}
            </p>
            {!range.wide && <p className="mt-2 text-[13px] text-mute">{pctS(range.high!)} 이상은 가격점수 {tier.price.fixed}점 이하 → 다시 미달</p>}
            {base && range.low !== null && (
              <p className="mt-3 text-[14px] text-sub">사정률 100% 가정 <b className="tabular-nums text-ink">{fmtWon(amountAt(base, range.low, a))}</b>{range.wide ? ' 이상' : ` 이상 ${fmtWon(amountAt(base, range.high!, a))} 미만`}{a ? ' (A값 반영)' : ''}</p>
            )}
            <button type="button" onClick={() => onUseRate(range.low!)}
              className="mt-4 flex h-12 w-full items-center justify-center gap-1 rounded-cta bg-ink text-[15px] font-semibold text-white active:scale-[.98]">
              {pctS(range.low)}로 투찰금액 계산하기 <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        <ScoreCurve tier={tier} need={range.need} low={range.low} high={range.high} floor={floor} />
      </div>

      <div className="rounded-box bg-white px-5 py-4 text-[13px] leading-relaxed text-mute lg:col-span-2">
        <p><b className="font-semibold text-sub">근거</b> 행정안전부 「지방자치단체 입찰시 낙찰자 결정기준」 시설공사 적격심사 세부기준 [별표 {tier.table}] (2025.7.1 시행) — 가격점수 = {tier.price.max} − {tier.price.k} × |90 − 투찰 비율| , {pctS(tier.price.t * 100)}~100%는 {tier.price.fixed}점, 적격통과 {tier.pass}점.</p>
        {!local && <p className="mt-1 font-medium text-warn">국가기관 공고로 보임 · 조달청 기준표 원문 미확인 (하한율 같으면 산식 같을 가능성 큼) · 공고 세부기준 확인</p>}
        <p className="mt-1">공동수급·신인도·결격 감점 등은 가점·감점 칸에 · 참고용 계산</p>
      </div>
    </section>
  );
}

function Num({ id, label, value, onChange, signed }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; signed?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] text-sub">{label}</label>
      <div className="relative">
        <input id={id} inputMode="decimal" value={draft ?? (value === null ? '' : String(value))}
          onChange={(e) => { const raw = e.target.value.replace(signed ? /[^\d.-]/g : /[^\d.]/g, ''); setDraft(raw); onChange(raw === '' || raw === '-' ? null : Number(raw)); }}
          onBlur={() => setDraft(null)}
          className="w-full rounded-btn border border-transparent bg-fill py-3.5 pl-4 pr-10 text-right text-[17px] font-semibold tabular-nums focus:border-brand focus:bg-white focus:outline-none" />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-mute">점</span>
      </div>
    </div>
  );
}

/** 투찰 비율에 따른 가격점수 — 필요한 점수선과 통과 구간 */
function ScoreCurve({ tier, need, low, high, floor }: { tier: Tier; need: number; low: number | null; high: number | null; floor: number }) {
  const lo = 87, hi = 101, W = 600, H = 150;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;
  const yMin = Math.max(0, tier.price.fixed - 15), yMax = tier.price.max + 1;
  const y = (v: number) => H - ((Math.max(yMin, v) - yMin) / (yMax - yMin)) * H;
  const pts = useMemo(() => {
    const out: string[] = [];
    for (let v = lo; v <= hi + 1e-9; v += 0.01) out.push(`${x(v).toFixed(1)},${y(priceScore(tier, v / 100)).toFixed(1)}`);
    return out.join(' ');
  }, [tier]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <figure className="mt-5">
      <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label={`투찰 비율별 가격점수, 필요 ${need}점`}>
        {low !== null && <rect x={x(Math.max(lo, low))} y={0} width={x(Math.min(hi, high ?? 100)) - x(Math.max(lo, low))} height={H} fill="#EEF3FE" />}
        <line x1={0} x2={W} y1={y(need)} y2={y(need)} stroke="#D4483B" strokeDasharray="5 4" strokeWidth={1.5} />
        <line x1={x(floor)} x2={x(floor)} y1={0} y2={H} stroke="#8A929E" strokeDasharray="2 3" />
        <polyline points={pts} fill="none" stroke="#1D4ED8" strokeWidth={2.5} />
        {[88, 90, 92, 94, 96, 98, 100].map((v) => <text key={v} x={x(v)} y={H + 18} textAnchor="middle" fontSize={13} fill="#8A929E">{v}%</text>)}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        <span><i className="mr-1 inline-block h-0.5 w-4 bg-brand align-middle" />가격점수</span>
        <span><i className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-bad align-middle" />필요 {need}점</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-soft align-middle" />통과 구간</span>
        <span>회색 점선: 하한율</span>
      </figcaption>
    </figure>
  );
}
