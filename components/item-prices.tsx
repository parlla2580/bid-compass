'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { Card } from './layout';
import { Tip } from './tip';
import { isCatalog, type Notice } from '@/lib/data';
import { fmtKorean, fmtShort, fmtWon } from '@/lib/format';
import { fetchItemPrices, fetchNoticeQty, type ItemPrice } from '@/lib/notices';

/*
 * 공공 계약 단가 — 이 품목을 기관들이 실제로 얼마에 샀나 (031 item_prices, 2026-11-21)
 *  화면은 단순하게: 품목 · 중앙값 하나 · 보통 범위 막대(+ 이 공고 개당 위치) · 최근 계약은 접어서
 *  정확도: 수량 2개 이상·최근 12개월만, 10건 미만이거나 흩어짐 3배 초과면 숫자 대신 '실례'만
 *  이 공고 개당 금액은 품목 1개·개수 단위·수량 2 이상일 때만 (추정가격 × 1.1 ÷ 수량, 부가세 포함으로 맞춤)
 */

const COUNT_UNIT = /^(대|개|EA|ea|set|SET|세트|조|매|권|점|벌|켤레|본|롤|장|식기|족|구|문|기)$/;
const won = (v: number) => (v >= 1e5 ? `${fmtShort(v)}원` : fmtWon(v));
const md = (d: string | null) => (d ? d.slice(2, 10).replace(/-/g, '.') : '–');

export function ItemPrices({ n, locked, onSignup }: { n: Notice; locked: boolean; onSignup: () => void }) {
  const codes = [...new Map(n.products.filter((p) => /^\d{8}/.test(p.code)).map((p) => [p.code.slice(0, 8), p.code])).values()].slice(0, 3);
  const goods = n.type === '물품' && !isCatalog(n) && codes.length > 0;
  const [items, setItems] = useState<ItemPrice[] | null | undefined>(undefined);
  // 이 공고가 사려는 수량 (품목이 하나일 때만 — 여러 품목이면 공고 수량이 어느 품목 것인지 알 수 없음)
  const [want, setWant] = useState<{ qty: number; unit: string } | null>(null);

  useEffect(() => {
    if (!goods) return;
    let on = true;
    fetchItemPrices(codes).then((r) => on && setItems(r)).catch(() => on && setItems(null));
    // 이 공고 개당 금액 — 품목이 하나이고 개수 단위일 때만
    if (codes.length === 1) {
      fetchNoticeQty(n.id).then((q) => {
        if (!on || !q?.qty) return;
        setWant({ qty: q.qty, unit: q.unit ?? '' });
      }).catch(() => {});
    }
    return () => { on = false; };
  }, [n.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!goods || !items?.length) return null;
  const total = items.reduce((s, i) => s + i.n, 0);
  // 이 공고 1개당 예산 — 계산할 수 없으면 이유를 함께 (2026-11-21: 조건이 안 맞으면 칸이 말없이 사라졌음)
  const budget: Budget | null = items.length !== 1 || !want ? null
    : !(n.estPrice > 0) ? { v: null, why: '추정가격 미공개' }
      : n.estPrice < 1e4 ? { v: null, why: `추정가격 값 이상 (${fmtWon(n.estPrice)})` }
      : !want.unit || !COUNT_UNIT.test(want.unit) ? { v: null, why: `단위 '${want.unit || '없음'}' · 1개당 계산 불가` }
        : { v: Math.round((n.estPrice * 1.1) / want.qty), why: null };
  // 실제 계약 기간 (수집된 기간이 12개월보다 짧을 수 있어 '최근 12개월' 대신 실제 날짜로)
  const froms = items.map((i) => i.from).filter(Boolean).sort() as string[];
  const tos = items.map((i) => i.to).filter(Boolean).sort() as string[];
  const ym = (d: string) => d.slice(2, 7).replace('-', '.');
  const period = froms.length && tos.length ? `${ym(froms[0])}~${ym(tos[tos.length - 1])}` : '최근 12개월';

  return (
    <Card title={
      <span className="flex items-center gap-1">공공 구매 단가
        <Tip title="계산 방법">다른 공공기관이 같은 물품분류를 실제로 산 1개당 가격 · 최근 12개월(수집 기간 안) · 수량 2개 이상 계약만 · 큰 숫자는 중앙값, ‘대부분’은 가운데 50%. 이 공고 예산 = 추정가격 × 1.1(부가세) ÷ 수량 — 품목이 하나이고 개수 단위일 때만. 다른 기관 범위와 5배 넘게 차이 나면 비교(%) 생략. 규격·단위가 섞여 값이 크게 흩어지는 품목은 숫자 없이 실제 계약만.</Tip>
      </span>}
      aside={<span className="text-[13px] tabular-nums text-mute">{period} · {total.toLocaleString()}건</span>}>
      <div className="divide-y divide-line">
        {items.map((it) => <Row key={it.code} it={it} single={items.length === 1} budget={budget}
          want={items.length === 1 ? want : null} total={n.estPrice > 0 ? Math.round(n.estPrice * 1.1) : null} locked={locked} onSignup={onSignup} />)}
      </div>
    </Card>
  );
}

interface Budget { v: number | null; why: string | null }

function Row({ it, single, budget, want, total, locked, onSignup }: {
  it: ItemPrice; single: boolean; budget: Budget | null;
  /** 이 공고 구매 수량 */ want: { qty: number; unit: string } | null;
  /** 이 공고 추정가격 × 1.1 */ total: number | null;
  locked: boolean; onSignup: () => void;
}) {
  const qtyText = want ? `${want.qty.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}${want.unit}` : null;
  const unit = want?.unit ?? null;
  const ok = it.spread_ok && it.n >= 10;
  const [open, setOpen] = useState(!ok);
  const mark = budget?.v ?? null;
  // 막대·% 비교는 범위와 5배 안쪽일 때만 — 벗어나면 값은 보여 주되 '차이 큼'으로 (구성품 묶음 등)
  const sane = mark != null && mark > it.p25 / 5 && mark < it.p75 * 5 ? mark : null;
  const formula = total && qtyText ? `${total >= 1e4 ? fmtKorean(total) : fmtWon(total)} ÷ ${qtyText}` : '추정가격 ÷ 수량';
  const lo = Math.min(it.p25, sane ?? it.p25) * 0.8, hi = Math.max(it.p75, sane ?? it.p75) * 1.2;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-semibold text-sub">{it.name ?? it.code}{ok && <span className="ml-1.5 text-[12px] font-normal text-mute">1{unit && COUNT_UNIT.test(unit) && !/^(EA|ea|set|SET)$/.test(unit) ? unit : '개'} 기준</span>}</p>
        {!single && <p className="shrink-0 text-[12px] text-mute">{it.n.toLocaleString()}건</p>}
        {single && qtyText && <p className="shrink-0 text-[13px] text-sub">이 공고 <b className="font-semibold tabular-nums text-ink">{qtyText}</b></p>}
      </div>

      {ok ? (
        <>
          {/* 두 숫자를 나란히 — 다른 기관이 산 가격 vs 이 공고 예산 */}
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[12px] text-mute"><i className="inline-block h-2 w-2 rounded-full bg-ink" />다른 기관 구매가</p>
              <p className="mt-0.5 text-[24px] font-bold tabular-nums tracking-tight">{won(it.p50)}</p>
              <p className="text-[12px] tabular-nums text-mute">대부분 {won(it.p25)}~{won(it.p75)}</p>
            </div>
            {budget && (
              <div>
                <p className="flex items-center gap-1.5 text-[12px] text-mute"><i className="inline-block h-0 w-0 border-x-[5px] border-b-[7px] border-x-transparent border-b-brand" />이 공고 예산</p>
                {mark != null ? (
                  <>
                    <p className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="text-[24px] font-bold tabular-nums tracking-tight text-brand">{won(mark)}</span>
                      {sane != null ? <Diff v={sane} base={it.p50} /> : <span className="rounded bg-fill px-1.5 py-0.5 text-[12px] font-semibold text-sub">차이 큼</span>}
                    </p>
                    <p className="text-[12px] tabular-nums text-mute">{sane != null ? formula : `${formula} · 구성품 포함 가능`}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-0.5 text-[24px] font-bold text-mute">–</p>
                    <p className="text-[12px] text-mute">{budget.why}</p>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="relative mb-1 mt-4 h-2 rounded-full bg-fill">
            <div className="absolute h-2 rounded-full bg-[#C9D7F9]" style={{ left: x(it.p25), width: `calc(${x(it.p75)} - ${x(it.p25)})` }} />
            <div className="absolute -top-1 h-4 w-1 -translate-x-1/2 rounded bg-ink" style={{ left: x(it.p50) }} />
            {sane != null && <span className="absolute top-2.5 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-brand" style={{ left: x(sane) }} />}
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-mute">다른 기관 구매가: 규격·단위 차이가 커서 생략{it.n < 10 ? ` · ${it.n}건` : ''}</p>
          {budget && (
            <p className="mt-1.5 text-[13px] text-sub">이 공고 예산{' '}
              {mark != null ? <><b className="font-semibold tabular-nums text-ink">{won(mark)}</b> <span className="text-mute">/ 1{unit} · {formula}</span></> : <span className="text-mute">– · {budget.why}</span>}
            </p>
          )}
        </>
      )}

      {/* 최근 계약 — 단가가 모이면 접어 두고, 흩어지면 펼쳐서 실례로 */}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="mt-3 flex items-center gap-0.5 text-[13px] font-medium text-sub">
        최근 계약<ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (locked ? (
        <button type="button" onClick={onSignup} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-fill py-3 text-[13px] font-semibold text-brand">
          <Lock className="h-3.5 w-3.5" />가입하면 최근 계약 보기
        </button>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {it.recent.slice(0, 3).map((r, i) => (
            <li key={i} className="text-[13px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-ink"><span className="tabular-nums text-mute">{md(r.date)}</span> {r.org?.trim() || '기관 미상'}</span>
                <span className="shrink-0 tabular-nums"><span className="text-mute">{Number(r.qty).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} × </span><b className="font-semibold">{won(r.unit_price)}</b></span>
              </div>
              {(r.spec || r.corp) && <p className="truncate text-[12px] text-mute">{[r.spec, r.corp].filter(Boolean).join(' · ')}</p>}
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

/** 중앙값 대비 차이 — ±5% 안은 '비슷' */
function Diff({ v, base }: { v: number; base: number }) {
  const d = Math.round(((v - base) / base) * 100);
  const cls = Math.abs(d) < 5 ? 'bg-fill text-sub' : d > 0 ? 'bg-[#FFF4E5] text-[#B45309]' : 'bg-brand-soft text-brand';
  return <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${cls}`}>{Math.abs(d) < 5 ? '비슷' : `${d > 0 ? '+' : ''}${d}%`}</span>;
}
