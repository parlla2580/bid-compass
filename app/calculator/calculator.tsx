'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ChevronRight, Link2 } from 'lucide-react';
import { getBid, type BidType } from '@/lib/data';
import { fmtKorean, fmtNum, fmtShort, fmtWon, round1 } from '@/lib/format';
import { BONUS, BONUS_MAX, PASS, SLIDERS, calcPrice, type BonusKey, type LawKey, type SliderKey } from './rules';

type Tab = 'price' | 'score';
const TYPES: BidType[] = ['물품', '용역', '공사'];
const LAWS: [LawKey, string][] = [['national', '국가계약법'], ['local', '지방계약법']];

function Segment<T extends string>({ name, options, value, onChange }: {
  name: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <label key={v}
          className={`flex h-11 cursor-pointer items-center justify-center rounded-btn border text-sm font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-300 ${value === v ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500'}`}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
          {label}
        </label>
      ))}
    </div>
  );
}

export default function CalculatorTabs() {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get('tab') === 'score' ? 'score' : 'price');
  const from = params.get('from') ? getBid(params.get('from')!) : undefined;

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
          {([['price', '입찰금액 계산기'], ['score', '적격심사 점수 계산기']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => selectTab(t)}
              className={`py-3.5 text-sm font-bold transition-colors ${tab === t ? 'text-primary' : 'text-slate-400'}`}>
              {label}
            </button>
          ))}
          <span className="absolute bottom-0 left-0 h-0.5 w-1/2 bg-primary transition-transform duration-300"
            style={{ transform: tab === 'score' ? 'translateX(100%)' : 'none' }} />
        </div>
      </div>

      <main className="px-4 pb-24 pt-4">
        {from && (
          <Link href={`/bids/${from.id}`} className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-800">
            <Link2 className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate"><b>{from.title}</b> 공고 정보를 불러왔어요</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
        {tab === 'price' ? <PricePanel key="price" /> : <ScorePanel key="score" />}
      </main>
    </>
  );
}

/* ---------- 탭 1: 입찰금액 계산기 ---------- */
function PricePanel() {
  const params = useSearchParams();
  const initType = params.get('type') as BidType | null;
  const [price, setPrice] = useState(() => Number(params.get('price')) || 120_000_000);
  const [type, setType] = useState<BidType>(initType && TYPES.includes(initType) ? initType : '물품');
  const [law, setLaw] = useState<LawKey>(params.get('law') === 'local' ? 'local' : 'national');
  const r = calcPrice(price, type, law);

  // 가로 범위 바 — 축: 추정가격의 85% ~ 115%
  const lo = price * 0.85, hi = price * 1.15;
  const pos = (v: number) => (price ? ((v - lo) / (hi - lo)) * 100 : 0);
  const bars = [
    ['예정가격', r.plan, 'bg-slate-400'],
    ['A값', r.a, 'bg-sky-400'],
    ['투찰금액', r.bid, 'bg-primary'],
  ] as const;

  const out: [string, string, boolean?][] = [
    ['예정가격 범위', `${fmtWon(r.plan[0])} ~ ${fmtWon(r.plan[1])}`],
    [`A값 (기초금액의 ±${(r.band * 100).toFixed(0)}%)`, `${fmtNum(r.a[0])} ~ ${fmtWon(r.a[1])}`],
    ['사정율 범위', `${r.floor.toFixed(3)}% ~ 100%`],
    ['최적 투찰금액 범위', `${fmtNum(r.bid[0])} ~ ${fmtWon(r.bid[1])}`, true],
  ];

  return (
    <section className="fade-up space-y-4" role="tabpanel">
      <div className="space-y-4 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label htmlFor="price" className="mb-1.5 block text-sm font-semibold text-slate-700">추정가격</label>
          <div className="relative">
            <input id="price" inputMode="numeric" value={price ? fmtNum(price) : ''}
              onChange={(e) => setPrice(Number(e.target.value.replace(/\D/g, '').slice(0, 13)) || 0)}
              className="w-full rounded-btn border border-slate-200 bg-white py-3 pl-3.5 pr-10 text-right text-lg font-bold focus:border-primary focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500">원</span>
          </div>
          <p className="mt-1 text-right text-xs text-slate-400">{fmtKorean(price)}</p>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">사업유형</legend>
          <Segment name="type" options={TYPES.map((t) => [t, t])} value={type} onChange={setType} />
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">적용 법률</legend>
          <Segment name="law" options={LAWS} value={law} onChange={setLaw} />
        </fieldset>
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
        <h2 className="mb-3 text-sm font-bold">계산 결과</h2>
        <dl className="divide-y divide-slate-100 text-sm">
          {out.map(([k, v, strong]) => (
            <div key={k} className="flex flex-col gap-0.5 py-2.5">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className={`text-[15px] font-semibold tabular-nums ${strong ? 'font-bold text-primary' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-sm font-bold">범위 시각화</h2>
        <div className="space-y-4">
          {bars.map(([label, [a, b], cls]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-slate-600">{label}</span>
                <span className="text-slate-400">{fmtShort(a)} ~ {fmtShort(b)}</span>
              </div>
              <div className="relative h-3 rounded-full bg-slate-100">
                <div className={`bar absolute h-3 rounded-full ${cls}`} style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` }} />
                <div className="absolute -bottom-1 -top-1 w-px bg-slate-800/60" style={{ left: `${pos(price)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="relative mt-2 h-4 text-[10px] text-slate-400">
          <span className="absolute left-0">85%</span>
          <span className="absolute left-1/2 -translate-x-1/2 font-semibold text-slate-600">추정가격</span>
          <span className="absolute right-0">115%</span>
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        ※ 프로토타입용 단순화 계산식입니다. 예정가격 범위(±10%), 복수예비가격 범위, 낙찰하한율 값은 화면 확인을 위한 가정값이며 실제 공고의 기초금액·적용 기준과 다를 수 있습니다.
      </p>
    </section>
  );
}

/* ---------- 탭 2: 적격심사 점수 계산기 ---------- */
function ScorePanel() {
  const [vals, setVals] = useState<Record<SliderKey, number>>(
    () => Object.fromEntries(SLIDERS.map((s) => [s.key, s.value])) as Record<SliderKey, number>,
  );
  const [bonusOn, setBonusOn] = useState<Record<BonusKey, boolean>>({ local: true, sme: true, social: true });
  // 숫자 입력칸은 입력 중 빈 값을 허용하기 위해 별도 문자열 상태로 관리
  const [drafts, setDrafts] = useState<Partial<Record<SliderKey, string>>>({});

  const cap = vals.mgmt + vals.record;
  const bonus = BONUS.reduce((a, b) => a + (bonusOn[b.key] ? b.pts : 0), 0);
  const total = round1(vals.price + cap + bonus);
  const diff = round1(total - PASS);
  const pass = total >= PASS;

  const setVal = (key: SliderKey, max: number, v: number) => setVals({ ...vals, [key]: Math.min(max, Math.max(0, v)) });

  const items = [
    ...SLIDERS.map((s) => [s.short, vals[s.key], s.max, 'bg-primary'] as const),
    ['가점', bonus, BONUS_MAX, 'bg-amber-500'] as const,
  ];

  return (
    <section className="fade-up space-y-4" role="tabpanel">
      <div className="rounded-card border border-slate-200 bg-white p-5 text-center shadow-md">
        <p className="text-sm font-semibold text-slate-500">총점</p>
        <p className={`mt-1 text-5xl font-extrabold tracking-tight transition-colors ${pass ? 'text-green-500' : 'text-red-500'}`}>
          {total}<span className="text-xl">점</span>
        </p>
        <p className="mt-1 text-sm text-slate-500">낙찰기준점 <b className="text-slate-700">{PASS}점</b> (물품·용역 기준)</p>
        <p className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${pass ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {pass ? `✅ 낙찰 가능 범위 (+${diff}점)` : `❌ 기준점 미달 (${diff}점)`}
        </p>

        {/* 스택 바 + 기준선 */}
        <div className="mt-5 text-left">
          <div className="relative h-7 rounded-md bg-slate-100">
            <div className="flex h-full overflow-hidden rounded-md">
              <div className="bar h-full bg-primary" style={{ width: `${vals.price}%` }} />
              <div className="bar h-full bg-sky-400" style={{ width: `${cap}%` }} />
              <div className="bar h-full bg-amber-500" style={{ width: `${bonus}%` }} />
            </div>
            <div className="absolute -bottom-1.5 -top-1.5 w-0.5 bg-slate-800" style={{ left: `${PASS}%` }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-slate-700">기준 {PASS}</span>
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>0</span><span>100</span></div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-primary" />가격 <b>{round1(vals.price)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-sky-400" />수행능력 <b>{round1(cap)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" />가점 <b>{round1(bonus)}</b></span>
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        {SLIDERS.map((s) => (
          <div key={s.key}>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor={`r-${s.key}`} className="text-sm font-semibold text-slate-700">
                {s.label} <span className="text-xs font-normal text-slate-400">{s.sub}</span>
              </label>
              <div className="flex items-center gap-1 text-sm">
                <input id={`n-${s.key}`} type="number" min={0} max={s.max} step={0.5} aria-label={`${s.label} 숫자 입력`}
                  value={drafts[s.key] ?? String(vals[s.key])}
                  onChange={(e) => { setDrafts({ ...drafts, [s.key]: e.target.value }); setVal(s.key, s.max, Number(e.target.value) || 0); }}
                  onBlur={() => setDrafts({ ...drafts, [s.key]: undefined })}
                  className="w-16 rounded-btn border border-slate-200 px-2 py-1 text-right font-bold focus:border-primary focus:outline-none" />
                <span className="text-slate-400">/ {s.max}</span>
              </div>
            </div>
            <input id={`r-${s.key}`} type="range" className="range" min={0} max={s.max} step={0.5} value={vals[s.key]}
              style={{ '--p': `${(vals[s.key] / s.max) * 100}%` } as React.CSSProperties}
              onChange={(e) => { setDrafts({ ...drafts, [s.key]: undefined }); setVal(s.key, s.max, Number(e.target.value)); }} />
          </div>
        ))}
      </div>

      <div className="space-y-1 rounded-card border border-slate-200 bg-white p-2 shadow-sm">
        <h2 className="px-2 pb-1 pt-2 text-sm font-bold">가점</h2>
        {BONUS.map((b) => (
          <label key={b.key} className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2.5 hover:bg-slate-50">
            <span className="text-sm font-medium">{b.label} <span className="ml-1 text-xs font-semibold text-amber-600">+{b.pts}점</span></span>
            <span className="switch">
              <input type="checkbox" checked={bonusOn[b.key]} onChange={(e) => setBonusOn({ ...bonusOn, [b.key]: e.target.checked })} />
              <span />
            </span>
          </label>
        ))}
      </div>

      <div className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold">항목별 획득 점수</h2>
        <div className="space-y-3">
          {items.map(([label, got, max, cls]) => (
            <div key={label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-semibold text-slate-600">{label}</span>
                <span className="text-slate-500"><b className="text-slate-800">{round1(got)}</b> / {max}점 ({Math.round((got / max) * 100)}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100">
                <div className={`bar h-2.5 rounded-full ${cls}`} style={{ width: `${(got / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-slate-400">
        ※ 프로토타입용 배점·기준점입니다. 실제 적격심사 배점과 통과점수는 발주기관의 적격심사 세부기준 및 추정가격 구간에 따라 다릅니다.
      </p>
    </section>
  );
}
