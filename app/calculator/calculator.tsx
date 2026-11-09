'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, ChevronRight, TriangleAlert } from 'lucide-react';
import { PageTitle } from '@/components/layout';
import { Term } from '@/components/term';
import { looksUnitPrice, type BidType, type Notice } from '@/lib/data';
import { fetchNotice } from '@/lib/notices';
import { useStore } from '@/lib/store';
import { fmtKorean, fmtNum, fmtShort, fmtWon, round1 } from '@/lib/format';
import {
  CONSTRUCTION_FLOOR, DEFAULT_PASS, EXAMPLE_FLOOR_RATE, EXAMPLE_RESERVE_RANGE, SCORE_ITEMS, VAT_RATE,
  calcBid, checkBid, type BidCheck, type ScoreKey,
} from './rules';
import { SajeongPanel } from './sajeong';

type Tab = 'bid' | 'score';
const TYPES: BidType[] = ['물품', '용역', '공사'];
const NUM_CLS = 'w-full rounded-btn border border-transparent bg-fill py-3.5 pl-4 pr-10 text-right text-[17px] font-semibold tabular-nums focus:border-brand focus:bg-white focus:outline-none';

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
      <label htmlFor={id} className="mb-2 block text-[14px] text-sub">{label}</label>
      <div className="relative">
        <input id={id} inputMode={decimals ? 'decimal' : 'numeric'} value={shown}
          onChange={(e) => {
            const raw = decimals ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, '').slice(0, 13);
            setDraft(decimals ? raw : null);
            onChange(raw === '' ? null : Number(raw));
          }}
          onBlur={() => setDraft(null)} className={NUM_CLS} />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-mute">{unit}</span>
      </div>
      {hint && <p className="mt-1 text-right text-xs text-mute">{hint}</p>}
    </div>
  );
}

function Segment<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-btn bg-line/60 p-1">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={`h-10 rounded-[10px] text-[15px] font-semibold transition ${value === o ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>
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
  const fromId = Number(params.get('from')) || null;
  const { notices } = useStore();
  const [from, setFrom] = useState<Notice | null>(null);
  useEffect(() => {
    if (!fromId) return;
    const hit = notices?.find((n) => n.id === fromId);
    if (hit) setFrom(hit);
    else fetchNotice(fromId).then(setFrom).catch(() => setFrom(null));
  }, [fromId, notices]);
  const fromParams = !!params.get('base') || !!params.get('rate');
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
      <PageTitle title="투찰 도구" />
      <div className="sticky top-14 z-20 bg-canvas/95 px-5 py-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
        <div className="flex rounded-btn bg-line/60 p-1 lg:inline-flex" role="tablist">
          {([['bid', '투찰금액 계산'], ['score', '적격심사 점수']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => selectTab(t)}
              className={`flex-1 rounded-[10px] px-5 py-2 text-[15px] font-semibold transition ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>{label}</button>
          ))}
        </div>
      </div>

      <main className="space-y-3 px-5 pb-28 pt-1 lg:px-0 lg:pb-0">
        {from && (
          <Link href={`/bids/${from.id}`} className="flex items-center gap-2 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
            <span className="min-w-0 flex-1 truncate text-sub"><b className="font-semibold text-ink">{from.title}</b> 공고 값을 불러왔어요</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-mute" />
          </Link>
        )}
        <div className="rounded-box bg-white p-5 lg:max-w-[480px]">
          <p className="mb-2.5 text-[14px] text-sub">사업유형</p>
          <Segment label="사업유형" options={TYPES} value={type} onChange={setType} />
        </div>
        {tab === 'bid'
          ? <BidPanel key={`bid-${type}`} type={type} estPrice={from?.estPrice}
              // 공고에서 왔는데 기초금액이 없으면 예시값을 채우지 않음 (단일예가·비예가 공고 등)
              initialBase={Number(params.get('base')) || from?.basePrice || (fromId ? null : 132_000_000)}
              notice={from}
              initialRange={params.get('range') ? Number(params.get('range')) : null}
              initialRate={params.get('rate') && type === params.get('type') ? Number(params.get('rate')) : null}
              fromNotice={fromParams && type === params.get('type')}
              org={from?.org} demandOrg={from?.demandOrg} />
          : <ScorePanel key={`score-${type}`} type={type} />}
      </main>
    </>
  );
}

const CHECK_STYLE: Record<BidCheck['level'], { Icon: typeof CircleCheck; cls: string }> = {
  ok: { Icon: CircleCheck, cls: 'text-ok' },
  warn: { Icon: CircleAlert, cls: 'text-warn' },
  danger: { Icon: CircleX, cls: 'text-bad' },
};

/* ---------- 탭 1: 투찰금액 계산기 (F4-1) ---------- */
function BidPanel({ type, initialBase, estPrice, initialRange, initialRate, fromNotice, org, demandOrg, notice }: {
  type: BidType;
  notice?: Notice | null;
  org?: string | null;
  demandOrg?: string | null;
  initialBase: number | null;
  estPrice?: number;
  /** 공고값 (없으면 예시값) */
  initialRange: number | null;
  initialRate: number | null;
  fromNotice: boolean;
}) {
  const [base, setBase] = useState<number | null>(initialBase);
  const [range, setRange] = useState<number | null>(initialRange ?? EXAMPLE_RESERVE_RANGE * 100);
  const [rate, setRate] = useState<number | null>(initialRate ?? EXAMPLE_FLOOR_RATE[type]);
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

  // 예정가격 결정방법 — 추첨(복수예가)이 없는 공고는 사정률 분포가 의미 없음
  const method = notice?.prearng ?? null;
  const noDraw = !!method && method !== '복수예가';
  const unit = !!notice && looksUnitPrice(notice);

  return (
    <section className="fade-up space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0" role="tabpanel">
      {(noDraw || (notice && !notice.basePrice) || unit) && (
        <div className="rounded-box bg-white px-5 py-4 text-[14px] leading-relaxed text-sub lg:col-span-2">
          {noDraw && <p><b className="font-semibold text-ink">{method} 공고예요.</b> {method === '비예가' ? '예정가격이 없는 공고라 계산이 맞지 않을 수 있어요. 공고문을 확인하세요.' : '예정가격이 추첨 없이 하나로 정해져 사정률 분포는 보여드리지 않아요.'}</p>}
          {notice && !notice.basePrice && <p className={noDraw ? 'mt-1' : ''}><b className="font-semibold text-ink">공고에 기초금액이 없어요.</b> 공고문에서 확인한 값을 직접 넣어 주세요.</p>}
          {unit && <p><b className="font-semibold text-ink">단가 입찰로 보여요.</b> 기초금액({fmtWon(notice!.basePrice!)})이 추정가격보다 훨씬 작아요. 1개·1회 단가 기준으로 계산돼요. (추정)</p>}
        </div>
      )}
      <div className="space-y-5 rounded-box bg-white p-5 lg:p-6">
        <NumField id="base" label={<Term k="기초금액" />} value={base} onChange={setBase} unit="원" hint={base ? fmtKorean(base) : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <NumField id="range" label={<><Term k="예비가격" /> 범위 ±</>} value={range} onChange={setRange} unit="%" decimals />
          <NumField id="rate" label={<Term k="낙찰하한율" />} value={rate} onChange={setRate} unit="%" decimals />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-btn bg-fill px-4 py-3.5 text-[15px]">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 h-5 w-5 accent-blue-600" />
          <span>
            <span className="font-medium">공고 세부기준표 값과 대조했어요</span>
            <span className="mt-0.5 block text-[13px] text-mute">
              {fromNotice ? '공고 데이터에서 불러온 값이에요. 세부기준표와 한 번 더 대조해 주세요.' : '지금 값은 예시값이에요. 공고마다 달라요.'}
            </span>
          </span>
        </label>
        {estPrice && (
          <p className="text-[13px] text-mute">
            이 공고의 <Term k="추정가격" />은 {fmtWon(estPrice)}이에요 (부가가치세 제외)
          </p>
        )}
      </div>

      <div className="rounded-box bg-white p-5 lg:sticky lg:top-6 lg:row-span-2 lg:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold">계산 결과</h2>
          {verified
            ? <span className="text-[13px] font-semibold text-ok">공고값 기준</span>
            : <span className="text-[13px] font-semibold text-warn">예시 계산</span>}
        </div>
        <dl className="divide-y divide-line">
          <div className="flex flex-col gap-1 py-3">
            <dt className="text-[13px] text-mute"><Term k="예정가격" /> 범위 (<Term k="사정률" /> {round1(100 - (range ?? 0))}~{round1(100 + (range ?? 0))}%)</dt>
            <dd className="text-[17px] font-semibold tabular-nums">{fmtWon(r.plan[0])} ~ {fmtWon(r.plan[1])}</dd>
          </div>
          <div className="flex flex-col gap-1 py-3">
            <dt className="text-[13px] text-mute">투찰 하한 구간 (예정가격 × 낙찰하한율 {rate ?? 0}%)</dt>
            <dd className="text-[20px] font-bold tabular-nums text-brand">{fmtWon(r.floor[0])} ~ {fmtWon(r.floor[1])}</dd>
          </div>
        </dl>

        {/* 범위 시각화 */}
        <div className="mt-3 space-y-3">
          {([['예정가격', r.plan, 'bg-mute/50'], ['투찰 하한', r.floor, 'bg-brand']] as const).map(([label, [a, b], cls]) => (
            <div key={label}>
              <div className="mb-1.5 flex justify-between text-[13px]"><span className="text-sub">{label}</span><span className="text-mute">{fmtShort(a)} ~ {fmtShort(b)}</span></div>
              <div className="relative h-3 rounded-full bg-fill">
                <div className={`bar absolute h-3 rounded-full ${cls}`} style={{ left: `${pos(a)}%`, width: `${pos(b) - pos(a)}%` }} />
                {bid !== null && bid > 0 && <div className="absolute -bottom-1 -top-1 w-0.5 bg-ink" style={{ left: `${pos(bid)}%` }} />}
              </div>
            </div>
          ))}
          {bid !== null && bid > 0 && <p className="text-right text-[12px] text-mute">검은 선: 내 투찰금액</p>}
        </div>
      </div>

      {B > 0 && rate && !noDraw ? (
        <SajeongPanel type={type} base={B} floor={rate} range={range ?? 2} org={org} demandOrg={demandOrg}
          onUse={(v) => { setBid(v); document.getElementById('bid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} />
      ) : null}

      <div className="space-y-3 rounded-box bg-white p-5 lg:p-6">
        <NumField id="bid" label={<>내 <Term k="투찰금액" /> <span className="font-normal text-mute">(선택)</span></>} value={bid} onChange={setBid} unit="원" />
        {checks.map((c) => {
          const { Icon, cls } = CHECK_STYLE[c.level];
          return <p key={c.text} className={`flex gap-2 text-[15px] ${cls}`}><Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" /><span className="text-ink">{c.text}</span></p>;
        })}
      </div>

      {type === '공사' && (
        <div className="space-y-4 rounded-box bg-white p-5 lg:col-start-1 lg:p-6">
          <h2 className="text-[17px] font-bold">공사 98% 하한 체크</h2>
          <p className="-mt-2 text-[14px] text-mute">내역서의 재료비·노무비·경비를 넣으면 98% 미만인지 확인해요</p>
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
            <p className="flex gap-2 text-[15px] font-medium text-bad">
              <TriangleAlert className="mt-0.5 h-[18px] w-[18px] shrink-0" />
              원가 합계의 98%보다 낮아요. 공고에 이 기준이 있는지 확인하세요.
            </p>
          )}
          {type === '공사' && costSum > 0 && bid === null && <p className="text-[13px] text-mute">내 투찰금액을 넣으면 경고 여부를 알려드려요</p>}
        </div>
      )}

      <p className="px-1 text-[13px] leading-relaxed text-mute lg:col-span-2">
        계산 결과는 참고용이에요. 공고 세부기준표로 꼭 확인하세요.
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
    <section className="fade-up space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0" role="tabpanel">
      <div className="rounded-box bg-white p-6 text-center lg:sticky lg:top-6 lg:row-span-3">
        <p className="text-[14px] text-mute">예상 총점</p>
        <p className={`mt-1 text-5xl font-bold tracking-tight tabular-nums transition-colors ${ok ? 'text-ink' : 'text-bad'}`}>
          {total}<span className="text-xl">점</span>
        </p>
        <p className="mt-1 text-[14px] text-mute">
          <Term k="낙찰기준점" /> <b className="text-sub">{P}점</b>{' '}
          {passEdited
            ? <span className="text-[13px] font-semibold text-ok">공고값</span>
            : <span className="text-[13px] font-semibold text-warn">일반 기준</span>}
        </p>
        <p className={`mt-3 inline-flex rounded-full bg-fill px-3.5 py-1.5 text-[14px] font-semibold ${ok ? 'text-ok' : 'text-bad'}`}>
          {ok ? `기준점 이상 (+${diff}점)` : `기준점 미달 (${diff}점)`}
        </p>

        <div className="mt-6 text-left">
          <div className="relative h-7 rounded-md bg-fill">
            <div className="flex h-full overflow-hidden rounded-md">
              <div className="bar h-full bg-brand" style={{ width: w(vals.price) }} />
              <div className="bar h-full bg-brand/50" style={{ width: w(ability) }} />
              <div className="bar h-full bg-brand/20" style={{ width: w(B) }} />
            </div>
            <div className="absolute -bottom-1.5 -top-1.5 w-0.5 bg-slate-800" style={{ left: w(P) }}>
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-sub">기준 {P}</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-sub">
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />가격 <b>{round1(vals.price)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand/50" />수행능력 <b>{round1(ability)}</b></span>
            <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand/20" />가점 <b>{round1(B)}</b></span>
            {!!penalty && <span className="text-bad">감점 −{round1(penalty)}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-5 rounded-box bg-white p-5 lg:p-6">
        {SCORE_ITEMS.map((s) => (
          <div key={s.key}>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor={`r-${s.key}`} className="text-[15px] text-sub">{s.label}</label>
              <span className="text-sm tabular-nums"><b>{vals[s.key]}</b> <span className="text-mute">/ {s.max}</span></span>
            </div>
            <input id={`r-${s.key}`} type="range" className="range" min={0} max={s.max} step={0.5} value={vals[s.key]}
              style={{ '--p': `${(vals[s.key] / s.max) * 100}%` } as React.CSSProperties}
              onChange={(e) => setVals({ ...vals, [s.key]: Number(e.target.value) })} />
            {/* 항목별 바 — 배점 대비 획득 */}
            <p className="mt-1 text-right text-[11px] text-mute">배점 대비 {Math.round((vals[s.key] / s.max) * 100)}%</p>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-3">
          <NumField id="bonus" label="가점" value={bonus} onChange={setBonus} unit="점" decimals />
          <NumField id="penalty" label="감점" value={penalty} onChange={setPenalty} unit="점" decimals />
        </div>
      </div>

      <div className="rounded-box bg-white p-5 lg:p-6">
        <NumField id="pass" label={<><Term k="낙찰기준점" /> (공고값으로 수정)</>} value={pass} onChange={setPass} unit="점" decimals
          hint={`${type} 일반 기준 ${DEFAULT_PASS[type]}점`} />
      </div>

      <p className="px-1 text-[13px] leading-relaxed text-mute lg:col-span-2">
        배점과 기준점은 일반 예시예요. 공고 세부기준표로 확인하세요.
      </p>
    </section>
  );
}
