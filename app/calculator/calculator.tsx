'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, CircleX, ChevronRight, TriangleAlert } from 'lucide-react';
import { PageTitle } from '@/components/layout';
import { Term } from '@/components/term';
import { Tip } from '@/components/tip';
import type { BidType, Notice } from '@/lib/data';
import { fetchNotice, fetchNoticeCost, type NoticeCost } from '@/lib/notices';
import { useStore } from '@/lib/store';
import { fmtKorean, fmtNum, fmtShort, fmtWon, round1 } from '@/lib/format';
import {
  CONSTRUCTION_FLOOR, DEFAULT_PASS, EXAMPLE_FLOOR_RATE, EXAMPLE_RESERVE_RANGE, SCORE_ITEMS, VAT_RATE,
  calcBid, checkBid, type BidCheck, type ScoreKey,
} from './rules';
import { SajeongPanel } from './sajeong';
import { QualifyPanel } from './qualify-panel';
import { BaseNotice } from './base-notice';

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
  const { notices, profile, loaded } = useStore();
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
  // 공고에서 오지 않았으면 우리 회사 유형으로 시작 (공사 면허만 있으면 공사, 관심 유형이 하나면 그 유형)
  const [guessed, setGuessed] = useState(false);
  useEffect(() => {
    if (guessed || !loaded || initType || fromId) return;
    setGuessed(true);
    const build = profile.industries?.some((i) => /공사업/.test(i.name)) && !profile.products?.length;
    const t: BidType | null = build ? '공사' : profile.types.length === 1 ? profile.types[0] : null;
    if (t) setType(t);
  }, [guessed, loaded, initType, fromId, profile]);

  // 적격심사 역산에서 고른 최저 투찰률로 투찰금액 계산
  const [rateOverride, setRateOverride] = useState<number | null>(null);
  const applyRate = (v: number) => { setRateOverride(v); selectTab('bid'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

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
          ? <BidPanel key={`bid-${type}-${rateOverride ?? ''}-${from?.id ?? ''}`} type={type} estPrice={from?.estPrice}
              // 공고에서 왔는데 기초금액이 없으면 예시값을 채우지 않음 (단일예가·비예가 공고 등)
              initialBase={Number(params.get('base')) || from?.basePrice || (fromId ? null : 132_000_000)}
              notice={from}
              initialRange={params.get('range') ? Number(params.get('range')) : null}
              initialRate={rateOverride ?? (params.get('rate') && type === params.get('type') ? Number(params.get('rate')) : null)}
              rateNote={rateOverride ? `우리 회사 점수로 찾은 최저 투찰률 ${rateOverride.toFixed(3)}%를 넣었어요` : null}
              onQualify={type === '공사' ? () => selectTab('score') : undefined}
              fromNotice={(fromParams && type === params.get('type')) || (!!from && from.type === type)}
              org={from?.org} demandOrg={from?.demandOrg} />
          : type === '공사'
            ? <QualifyPanel notice={from} onUseRate={applyRate} />
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
function BidPanel({ type, initialBase, estPrice, initialRange, initialRate, fromNotice, org, demandOrg, notice, rateNote, onQualify }: {
  type: BidType;
  rateNote?: string | null;
  onQualify?: () => void;
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
  // 공사 A값 (026) — 공고에서 왔으면 기초금액 API 값, 아니면 직접 입력
  const [cost, setCostInfo] = useState<NoticeCost | null>(null);
  const [a, setA] = useState<number | null>(null);
  useEffect(() => {
    if (!notice?.id) { setCostInfo(null); return; }
    fetchNoticeCost(notice.id).then((c) => {
      setCostInfo(c);
      if (type === '공사' && c?.aValue && c.aApply !== false) setA(c.aValue);
    }).catch(() => setCostInfo(null));
  }, [type, notice?.id]);
  const A = type === '공사' ? a ?? 0 : 0;
  const [costIn, setCost] = useState<{ material: number | null; labor: number | null; expense: number | null; vat: number | null }>(
    { material: null, labor: null, expense: null, vat: null },
  );

  const B = base ?? 0;
  const r = calcBid(B, (range ?? 0) / 100, rate ?? 0, A);
  const checks = bid ? checkBid(bid, r) : [];

  const costSum = (costIn.material ?? 0) + (costIn.labor ?? 0) + (costIn.expense ?? 0);
  const vat = costIn.vat ?? Math.round(costSum * VAT_RATE);
  const constructionFloor = (costSum + vat) * CONSTRUCTION_FLOOR;
  const constructionWarn = type === '공사' && costSum > 0 && bid !== null && bid < constructionFloor;

  // 시각화 축: 투찰 하한 하단의 98% ~ 예정가격 상단의 102%
  const lo = r.floor[0] * 0.98, hi = r.plan[1] * 1.02;
  const pos = (v: number) => (hi > lo ? Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100)) : 0);

  // 예정가격 결정방법 — 추첨(복수예가)이 없는 공고는 사정률 분포가 의미 없음
  const method = notice?.prearng ?? null;
  const noDraw = !!method && method !== '복수예가';
  // 추첨이 없고 하한율도 없는 공고(최저가·협상·규격가격동시 등) — '하한선에 붙여 쓰기' 계산이 맞지 않아 입력·결과를 숨김
  const noCalc = !!notice && noDraw && !notice.floorRate && !notice.basePrice;

  return (
    <section className="fade-up space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0" role="tabpanel">
      {notice && <BaseNotice notice={notice} range={range ?? EXAMPLE_RESERVE_RANGE * 100} rate={rate ?? EXAMPLE_FLOOR_RATE[type]}
        budget={cost?.budget ?? null}
        onEstimate={(v) => { setBase(v); setRange(0); if (notice.floorRate) setRate(notice.floorRate); setBid(null); }} />}
      {!noCalc && <>
      <div className="space-y-5 rounded-box bg-white p-5 lg:p-6">
        <NumField id="base" label={<Term k="기초금액" />} value={base} onChange={setBase} unit="원" hint={base ? fmtKorean(base) : undefined} />
        <div className="grid grid-cols-2 gap-3">
          <NumField id="range" label={<><Term k="예비가격" /> 범위 ±</>} value={range} onChange={setRange} unit="%" decimals />
          <NumField id="rate" label={<Term k="낙찰하한율" />} value={rate} onChange={setRate} unit="%" decimals />
        </div>
        {type === '공사' && (
          <div>
            <NumField id="aval" label={<span className="inline-flex items-center gap-1">A값 <span className="font-normal text-mute">(공사)</span>
              <Tip title="A값">국민연금·건강보험·퇴직공제부금·노인장기요양보험료·산업안전보건관리비·안전관리비·품질관리비를 더한 금액이에요. A값 대상 공고는 투찰 하한이 (예정가격 − A) × 낙찰하한율 + A라서, A값을 빼먹으면 하한보다 낮게 써 탈락할 수 있어요. 공고문에 적힌 A값을 그대로 넣으세요.</Tip></span>}
              value={a} onChange={setA} unit="원" hint={a ? fmtKorean(a) : '대상이 아니면 비워 두세요'} />
            {cost?.aValue ? (
              <div className="mt-2 rounded-xl bg-fill px-3.5 py-3 text-[13px] leading-relaxed text-sub">
                {cost.aApply === false
                  ? <>나라장터 정보로는 <b className="font-semibold text-ink">A값 산식 대상이 아니에요.</b> 공고문에서 한 번 더 확인하세요. (항목 합계 {fmtWon(cost.aValue)})</>
                  : <><b className="font-semibold text-ink">공고의 A값 {fmtWon(cost.aValue)}을 넣었어요.</b>{cost.aApply === null ? ' 적용 여부는 공고문에서 확인하세요.' : ''}</>}
                {cost.aParts && <span className="mt-1 block text-mute">{Object.entries(cost.aParts).map(([k, v]) => `${k} ${fmtShort(v)}`).join(' · ')}</span>}
              </div>
            ) : notice && type === '공사' && cost !== null ? (
              <p className="mt-1.5 text-[13px] text-mute">{notice.basePrice ? '나라장터에 이 공고의 A값 정보가 없어요. 공고문에 있으면 직접 넣어 주세요.' : 'A값은 보통 기초금액과 함께 공개돼요. 공개되면 자동으로 채워 드려요.'}</p>
            ) : null}
          </div>
        )}
        {rateNote && <p className="-mt-2 text-[13px] font-medium text-brand">{rateNote}</p>}
        {onQualify && !rateNote && (
          <button type="button" onClick={onQualify} className="-mt-2 flex w-full items-center justify-between gap-2 rounded-xl bg-brand-soft px-3.5 py-3 text-left text-[14px] text-brand">
            <span><b className="font-semibold">우리 회사 점수로는 몇 %부터 통과할까요?</b><span className="block text-[13px] text-sub">경영상태·실적이 만점이 아니면 하한율로 써도 탈락할 수 있어요</span></span>
            <ChevronRight className="h-5 w-5 shrink-0" />
          </button>
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-btn bg-fill px-4 py-3.5 text-[15px]">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 h-5 w-5 accent-blue-600" />
          <span>
            <span className="font-medium">공고 세부기준표 값과 대조했어요</span>
            <span className="mt-0.5 block text-[13px] text-mute">
              {fromNotice ? '공고에서 불러온 값이에요. 세부기준표와 대조해 주세요.' : '지금 값은 예시값이에요. 공고마다 달라요.'}
            </span>
          </span>
        </label>
        {estPrice && (
          <p className="text-[13px] text-mute">
            이 공고의 <Term k="추정가격" />은 {fmtWon(estPrice)}이에요 (부가가치세 제외)
          </p>
        )}
      </div>

      {/* 감싸는 칸이 두 줄만 차지 → 결과 카드가 아래 사정률 패널 위로 겹쳐 따라오지 않게 */}
      <div className="lg:row-span-2">
      <div className="rounded-box bg-white p-5 lg:sticky lg:top-6 lg:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[17px] font-bold">계산 결과</h2>
          {verified
            ? <span className="text-[13px] font-semibold text-ok">공고값 기준</span>
            : <span className="text-[13px] font-semibold text-warn">예시 계산</span>}
        </div>
        {B <= 0 ? <p className="py-6 text-center text-[15px] text-mute">기초금액을 넣으면 계산해 드려요</p> : <>
        <dl className="divide-y divide-line">
          <div className="flex flex-col gap-1 py-3">
            <dt className="text-[13px] text-mute"><Term k="예정가격" /> 범위 (<Term k="사정률" /> {round1(100 - (range ?? 0))}~{round1(100 + (range ?? 0))}%)</dt>
            <dd className="text-[17px] font-semibold tabular-nums">{fmtWon(r.plan[0])} ~ {fmtWon(r.plan[1])}</dd>
          </div>
          <div className="flex flex-col gap-1 py-3">
            <dt className="text-[13px] text-mute">투찰 하한 구간 ({A ? `(예정가격 − A) × 낙찰하한율 ${rate ?? 0}% + A` : `예정가격 × 낙찰하한율 ${rate ?? 0}%`})</dt>
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
        </>}
      </div>
      </div>

      {B > 0 && rate && !noDraw ? (
        <SajeongPanel type={type} base={B} floor={rate} range={range ?? 2} org={org} demandOrg={demandOrg} a={A}
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
          {cost?.netCost ? (
            <div className="rounded-xl bg-fill px-3.5 py-3 text-[13px] leading-relaxed text-sub">
              나라장터에 올라온 이 공고의 <b className="font-semibold text-ink">기초금액 순공사비는 {fmtWon(cost.netCost)}</b>이에요. 98%는 {fmtWon(Math.ceil(cost.netCost * CONSTRUCTION_FLOOR))}이에요.
              <span className="mt-1 block text-mute">순공사원가는 예정가격이 정해지면 그에 맞춰 달라질 수 있고, 부가가치세 포함 여부도 공고마다 달라요. 공고문·내역서로 확인하세요.</span>
              {bid !== null && bid > 0 && bid < cost.netCost * CONSTRUCTION_FLOOR && <b className="mt-1 block font-semibold text-bad">내 투찰금액이 이 98%보다 낮아요.</b>}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <NumField id="material" label="재료비" value={costIn.material} onChange={(v) => setCost({ ...costIn, material: v })} unit="원" />
            <NumField id="labor" label="노무비" value={costIn.labor} onChange={(v) => setCost({ ...costIn, labor: v })} unit="원" />
            <NumField id="expense" label="경비" value={costIn.expense} onChange={(v) => setCost({ ...costIn, expense: v })} unit="원" />
            <NumField id="vat" label="부가가치세" value={costIn.vat} onChange={(v) => setCost({ ...costIn, vat: v })} unit="원"
              hint={costIn.vat === null ? `비우면 10% 자동: ${fmtNum(vat)}원` : undefined} />
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
      </>}

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
