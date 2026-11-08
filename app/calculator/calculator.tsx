'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, ChevronRight, Info, Link2, TriangleAlert } from 'lucide-react';
import { Term } from '@/components/term';
import { getNotice, type BidType } from '@/lib/data';
import { fmtKorean, fmtNum, fmtShort, fmtWon, round1 } from '@/lib/format';
import {
  CONSTRUCTION_FLOOR, DEFAULT_PASS, EXAMPLE_FLOOR_RATE, EXAMPLE_RESERVE_RANGE, SCORE_ITEMS, VAT_RATE,
  calcBid, checkBid, type BidCheck, type ScoreKey,
} from './rules';

type Tab = 'bid' | 'score';
const TYPES: BidType[] = ['물품', '용역', '공사'];
const NUM_CLS = 'w-full rounded-btn border border-slate-200 bg-white py-2.5 pl-3 pr-9 text-right text-[15px] font-bold tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-blue-100';

/** 숫자 입력 (원·% 단위) */
function NumField({ id, label, value, onChange, unit, decimals = false, hint }: {
  id: string;
  label: React.ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  unit: string;
  decimals?: boolean;
  hint?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? '' : decimals ? String(value) : fmtNum(value));
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <div className="relative">
        <input id={id} inputMode={decimals ? 'decimal' : 'numeric'} value={shown}
          onChange={(e) => {
            const raw = decimals ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, '').slice(0, 13);
            setDraft(decimals ? raw : null);
            onChange(raw === '' ? null : Number(raw));
          }}
          onBlur={() => setDraft(null)} className={NUM_CLS} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">{unit}</span>
      </div>
      {hint && <p className="mt-1 text-right text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function Segment<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-2">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={`h-10 rounded-btn border text-sm font-semibold transition ${value === o ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** S6. 적격심사 도구 */
export default function CalculatorTabs() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'score' ? 'score' : 'bid');
  const from = params.get('from') ? getNotice(params.get('from')!) : undefined;
  const initType = params.get('type') as BidType | null;
  const [type, setType] = useState<BidType>(initType && TYPES.includes(initType) ? initType : (from?.type ?? '물품'));

  const selectTab = (t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set('tab', t);
    window.history.replaceState(null, '', u);
  };

  return (
    <>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="relative grid grid-cols-2" role="tablist">
          {([['bid', '투찰금액 계산기'], ['score', '적격심사 점수 계산기']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => selectTab(t)}
              className={`py-3.5 text-sm font-bold transition-colors ${tab === t ? 'text-primary' : 'text-slate-400'}`}>{label}</button>
          ))}
          <span className="absolute bottom-0 left-0 h-0.5 w-1/2 bg-primary transition-transform duration-300"
            style={{ transform: tab === 'score' ? 'translateX(100%)' : 'none' }} />
        </div>
      </div>

      <main className="space-y-4 px-4 pb-24 pt-4">
        {from && (
          <Link href={`/bids/${from.id}`} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
            <Link2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate"><b>{from.title}</b> 공고 값을 불러왔어요</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
        <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-slate-700">사업유형</p>
          <Segment label="사업유형" options={TYPES} value={type} onChange={setType} />
        </div>
        {tab === 'bid'
          ? <BidPanel key={`bid-${type}`} type={type} initialBase={Number(params.get('base')) || from?.basePrice || 132_000_000} estPrice={from?.estPrice} />
          : <ScorePanel key={`score-${type}`} type={type} />}
      </main>
    </>
  );
}

const CHECK_STYLE: Record<BidCheck['level'], { Icon: typeof CircleCheck; cls: string }> = {
  ok: { Icon: CircleCheck, cls: 'text-green-700 bg-green-50' },
  warn: { Icon: CircleAlert, cls: 'text-amber-800 bg-amber-50' },
  danger: { Icon: CircleX, cls: 'text-red-600 bg-red-50' },
};

/* ---------- 탭 1: 투찰금액 계산기 (F4-1) ---------- */
function BidPanel({ type, initialBase, estPrice }: { type: BidType; initialBase: number; estPrice?: number }) {
  const [base, setBase] = useState<number | null>(initialBase);
  const [range, setRange] = useState<number | null>(EXAMPLE_RESERVE_RANGE * 100);
  const [rate, setRate] = useState<number | null>(EXAMPLE_FLOOR_RATE[type]);
  const [verified, setVerified] = useState(false);
  const [bid, setBid] = useState<number | null>(null);
  const [cost, setCost] = useState<{ material: number | null; labor: number | null; expense: number | null; vat: number | null }>(
    { material: null, labor: null, expense: null, vat: null },
  );

  const B = base ?? 0;
  const r = calcBid(B, (range ?? 0) / 100, rate ?? 0);
  const checks = bid ? checkBid(bid, r) : [];

  const costSum = (cost.material ?? 0) + (cost.labor ?? 0) + (cost.expense ?? 0);
  const vat = cost.vat ?? Math.round(costSum * VAT_RATE);
  const constructionFloor = (costSum + vat) * CONSTRUCTION_FLOOR;
  const constructionWarn = type === '공사' && costSum > 0 && bid !== null && bid < constructionFloor;

  // 시각화 축: 투찰 하한 하단의 98% ~ 예정가격 상단의 102%
  const lo = r.floor[0] * 0.98, hi = r.plan[1] * 1.02;
  const pos = (v: number) => (hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0);

  return (
    <section className="fade-up space-y-4" role="tabpanel">
      <div className="space-y-4 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <NumField id="base" label={<Term k="기초금액" />} value={base} onChange={setBase} unit="원" hint={base ? fmtKorean(base) : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <NumField id="range" label={<><Term k="예비가격" /> 범위 ±</>} value={range} onChange={setRange} unit="%" decimals />
          <NumField id="rate" label={<Term k="낙찰하한율" />} value={rate} onChange={setRate} unit="%" decimals />
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm has-[:checked]:border-green-300 has-[:checked]:bg-green-50">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 h-4 w-4 accent-green-600" />
          <span>
            <b>공고 세부기준표 값과 대조했습니다</b>
            <span className="mt-0.5 block text-xs text-slate-500">예비가격 범위와 낙찰하한율은 공고마다 다릅니다. 지금 값은 예시값입니다.</span>
          </span>
        </label>
        {estPrice && (
          <p className="flex gap-1.5 text-xs text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>이 공고의 <Term k="추정가격" />은 {fmtWon(estPrice)}입니다. 추정가격은 부가가치세 제외 금액입니다.</span>
          </p>
        )}
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">계산 결과</h2>
          {verified
            ? <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 ring-1 ring-green-200">공고값 기준</span>
            : <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">예시 계산</span>}
        </div>
        <dl className="divide-y divide-slate-100 text-sm">
          <div className="flex flex-col gap-0.5 py-2.5">
            <dt className="text-xs text-slate-500"><Term k="예정가격" /> 범위 (<Term k="사정률" /> {round1(100 - (range ?? 0))}~{round1(100 + (range ?? 0))}%)</dt>
            <dd className="text-[15px] font-semibold tabular-nums">{fmtWon(r.plan[0])} ~ {fmtWon(r.plan[1])}</dd>
          </div>
          <div className="flex flex-col gap-0.5 py-2.5">
            <dt className="text-xs text-slate-500">투찰 하한 구간 (예정가격 × 낙찰하한율 {rate ?? 0}%)</dt>
            <dd className="text-[15px] font-bold tabular-nums text-primary">{fmtWon(r.floor[0])} ~ {fmtWon(r.floor[1])}</dd>
          </div>
        </dl>

        {/* 범위 시각화 */}
        <div className="mt-3 space-y-3">
          {([['예정가격', r.plan, 'bg-slate-400'], ['투찰 하한', r.floor, 'bg-primary']] as const).map(([label, [a, b], cls]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-slate-600">{label}</span><span className="text-slate-400">{fmtShort(a)} ~ {fmtShort(b)}</span></div>
              <div className="relative h-3 rounded-full bg-slate-100">
                <div className={`bar absolute h-3 rounded-full ${cls}`} style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` }} />
                {bid !== null && bid > 0 && <div className="absolute -bottom-1 -top-1 w-0.5 bg-red-500" style={{ left: `${pos(bid)}%` }} />}
              </div>
            </div>
          ))}
          {bid !== null && bid > 0 && <p className="text-right text-[11px] text-red-500">빨간 선: 내 투찰금액</p>}
        </div>
      </div>

      <div className="space-y-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <NumField id="bid" label={<>내 <Term k="투찰금액" /> <span className="font-normal text-slate-400">(선택)</span></>} value={bid} onChange={setBid} unit="원" />
        {checks.map((c) => {
          const { Icon, cls } = CHECK_STYLE[c.level];
          return <p key={c.text} className={`flex gap-1.5 rounded-lg px-3 py-2 text-sm ${cls}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" />{c.text}</p>;
        })}
      </div>

      {type === '공사' && (
        <div className="space-y-3 rounded-card border border-orange-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold">공사 98% 하한 체크</h2>
          <p className="text-xs text-slate-500">공고 내역서의 재료비·노무비·경비를 넣으면, 투찰금액이 그 합계(부가가치세 포함)의 98% 미만인지 확인합니다.</p>
          <div className="grid grid-cols-2 gap-3">
            <NumField id="material" label="재료비" value={cost.material} onChange={(v) => setCost({ ...cost, material: v })} unit="원" />
            <NumField id="labor" label="노무비" value={cost.labor} onChange={(v) => setCost({ ...cost, labor: v })} unit="원" />
            <NumField id="expense" label="경비" value={cost.expense} onChange={(v) => setCost({ ...cost, expense: v })} unit="원" />
            <NumField id="vat" label="부가가치세" value={cost.vat} onChange={(v) => setCost({ ...cost, vat: v })} unit="원"
              hint={cost.vat === null ? `비우면 10% 자동: ${fmtNum(vat)}원` : undefined} />
          </div>
          {costSum > 0 && (
            <p className="text-sm">98% 기준금액 <b className="tabular-nums">{fmtWon(constructionFloor)}</b></p>
          )}
          {constructionWarn && (
            <p className="flex gap-1.5 rounded-lg bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              투찰금액이 (재료비+노무비+경비+부가가치세)의 98% 미만입니다. 공고에서 이 기준이 적용되는지 확인하세요.
            </p>
          )}
          {type === '공사' && costSum > 0 && bid === null && <p className="text-xs text-slate-400">위에서 내 투찰금액을 넣으면 경고 여부를 알려드립니다.</p>}
        </div>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        ※ 계산 결과는 참고용입니다. 예비가격 범위·낙찰하한율·공사 하한 기준은 공고의 적격심사 세부기준표 값으로 확인하세요.
      </p>
    </section>
  );
}

/* ---------- 탭 2: 적격심사 점수 계산기 (F4-2) ---------- */
function ScorePanel({ type }: { type: BidType }) {
  const [vals, setVals] = useState<Record<ScoreKey, number>>(
    () => Object.fromEntries(SCORE_ITEMS.map((s) => [s.key, s.value])) as Record<ScoreKey, number>,
  );
  const [bonus, setBonus] = useState<number | null>(2);
  const [penalty, setPenalty] = useState<number | null>(0);
  const [pass, setPass] = useState<number | null>(DEFAULT_PASS[type]);
  const passEdited = pass !== DEFAULT_PASS[type];
  const P = pass ?? DEFAULT_PASS[type];

  const ability = vals.mgmt + vals.record;
  const B = bonus ?? 0;
  const total = round1(vals.price + ability + B - (penalty ?? 0));
  const diff = round1(total - P);
  const ok = total >= P;
  const scale = 100 + Math.max(B, 0);
  const w = (v: number) => `${(Math.max(v, 0) / scale) * 100}%`;

  return (
    <section className="fade-up space-y-4" role="tabpanel">
      <div className="rounded-card border border-slate-200 bg-white p-5 text-center shadow-md">
        <p className="text-sm font-semibold text-slate-500">예상 총점</p>
        <p className={`mt-1 text-5xl font-extrabold tracking-tight tabular-nums transition-colors ${ok ? 'text-green-500' : 'text-red-500'}`}>
          {total}<span className="text-xl">점</span>
        </p>
        <p className="mt-1 text-sm text-slate-500">
          <Term k="낙찰기준점" /> <b className="text-slate-700">{P}점</b>{' '}
          {passEdited
            ? <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-bold text-green-700">공고값</span>
            : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">일반 기준 적용</span>}
        </p>
        <p className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {ok ? `기준점 이상 (+${diff}점)` : `기준점 미달 (${diff}점)`}
        </p>

        <div className="mt-6 text-left">
          <div className="relative h-7 rounded-md bg-slate-100">
            <div className="flex h-full overflow-hidden rounded-md">
              <div className="bar h-full bg-primary" style={{ width: w(vals.price) }} />
              <div className="bar h-full bg-sky-400" style={{ width: w(ability) }} />
              <div className="bar h-full bg-amber-500" style={{ width: w(B) }} />
            </div>
            <div className="absolute -bottom-1.5 -top-1.5 w-0.5 bg-slate-800" style={{ left: w(P) }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-700">기준 {P}</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-primary" />가격 <b>{round1(vals.price)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-sky-400" />수행능력 <b>{round1(ability)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />가점 <b>{round1(B)}</b></span>
            {!!penalty && <span className="text-red-500">감점 −{round1(penalty)}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        {SCORE_ITEMS.map((s) => (
          <div key={s.key}>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor={`r-${s.key}`} className="text-sm font-semibold text-slate-700">{s.label}</label>
              <span className="text-sm tabular-nums"><b>{vals[s.key]}</b> <span className="text-slate-400">/ {s.max}</span></span>
            </div>
            <input id={`r-${s.key}`} type="range" className="range" min={0} max={s.max} step={0.5} value={vals[s.key]}
              style={{ '--p': `${(vals[s.key] / s.max) * 100}%` } as React.CSSProperties}
              onChange={(e) => setVals({ ...vals, [s.key]: Number(e.target.value) })} />
            {/* 항목별 바 — 배점 대비 획득 */}
            <p className="mt-1 text-right text-[11px] text-slate-400">배점 대비 {Math.round((vals[s.key] / s.max) * 100)}%</p>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <NumField id="bonus" label="가점" value={bonus} onChange={setBonus} unit="점" decimals />
          <NumField id="penalty" label="감점" value={penalty} onChange={setPenalty} unit="점" decimals />
        </div>
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <NumField id="pass" label={<><Term k="낙찰기준점" /> (공고값으로 수정)</>} value={pass} onChange={setPass} unit="점" decimals
          hint={`${type} 일반 기준 ${DEFAULT_PASS[type]}점`} />
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        ※ 항목별 배점(가격 60·경영상태 14·수행실적 20)과 기준점은 일반적인 예시입니다. 사업유형·발주기관·금액 구간별로 다르므로 공고의 적격심사 세부기준표를 확인하세요.
      </p>
    </section>
  );
}
