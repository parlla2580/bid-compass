'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { Card } from './layout';
import { Tip } from './tip';
import { isCatalog, type Notice } from '@/lib/data';
import { fmtShort, fmtWon } from '@/lib/format';
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
  const [perUnit, setPerUnit] = useState<number | null>(null);

  useEffect(() => {
    if (!goods) return;
    let on = true;
    fetchItemPrices(codes).then((r) => on && setItems(r)).catch(() => on && setItems(null));
    // 이 공고 개당 금액 — 품목이 하나이고 개수 단위일 때만
    if (codes.length === 1 && n.estPrice > 0) {
      fetchNoticeQty(n.id).then((q) => {
        if (on && q?.qty && q.qty >= 2 && q.unit && COUNT_UNIT.test(q.unit)) setPerUnit(Math.round((n.estPrice * 1.1) / q.qty));
      }).catch(() => {});
    }
    return () => { on = false; };
  }, [n.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!goods || !items?.length) return null;
  const total = items.reduce((s, i) => s + i.n, 0);
  // 실제 계약 기간 (수집된 기간이 12개월보다 짧을 수 있어 '최근 12개월' 대신 실제 날짜로)
  const froms = items.map((i) => i.from).filter(Boolean).sort() as string[];
  const tos = items.map((i) => i.to).filter(Boolean).sort() as string[];
  const ym = (d: string) => d.slice(2, 7).replace('-', '.');
  const period = froms.length && tos.length ? `${ym(froms[0])}~${ym(tos[tos.length - 1])}` : '최근 12개월';

  return (
    <Card title={
      <span className="flex items-center gap-1">공공 계약 단가
        <Tip title="어떻게 계산했나요">같은 물품분류로 최근 12개월(수집된 기간 안)에 체결된 공공 계약 중 수량 2개 이상만 모았어요. 큰 글씨는 중앙값, 막대는 가운데 50%(보통 범위)예요. 규격·단위가 섞여 값이 크게 흩어지는 품목은 숫자 대신 실제 계약만 보여 드려요. 이 공고 개당 금액은 추정가격에 부가세 10%를 더해 수량으로 나눈 추정값이에요.</Tip>
      </span>}
      aside={<span className="text-[13px] tabular-nums text-mute">{period} · {total.toLocaleString()}건</span>}>
      <div className="divide-y divide-line">
        {items.map((it) => <Row key={it.code} it={it} single={items.length === 1} mark={items.length === 1 ? perUnit : null} locked={locked} onSignup={onSignup} />)}
      </div>
    </Card>
  );
}

function Row({ it, single, mark, locked, onSignup }: { it: ItemPrice; single: boolean; mark: number | null; locked: boolean; onSignup: () => void }) {
  const ok = it.spread_ok && it.n >= 10;
  const [open, setOpen] = useState(!ok);
  // 막대 눈금 — 보통 범위와 이 공고 위치가 다 들어오게
  const sane = mark != null && mark > it.p25 / 5 && mark < it.p75 * 5 ? mark : null; // 단위가 다른 공고(묶음 등)면 위치 표시 안 함
  const lo = Math.min(it.p25, sane ?? it.p25) * 0.75, hi = Math.max(it.p75, sane ?? it.p75) * 1.25;
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;

  return (
    <div className="py-4 first:pt-1 last:pb-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-semibold text-sub">{it.name ?? it.code}</p>
        {!single && <p className="shrink-0 text-[12px] text-mute">{it.n.toLocaleString()}건</p>}
      </div>

      {ok ? (
        <>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[26px] font-bold tabular-nums tracking-tight">{won(it.p50)}</span>
            <span className="text-[13px] tabular-nums text-mute">보통 {won(it.p25)} ~ {won(it.p75)}</span>
          </p>
          <div className={`relative ${sane ? 'mb-8' : 'mb-1'} mt-3 h-2 rounded-full bg-fill`}>
            <div className="absolute h-2 rounded-full bg-[#C9D7F9]" style={{ left: x(it.p25), width: `calc(${x(it.p75)} - ${x(it.p25)})` }} />
            <div className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: x(it.p50) }} />
            {sane && (
              <span className="absolute top-3 -translate-x-1/2 whitespace-nowrap text-center" style={{ left: x(sane) }}>
                <span className="mx-auto block h-0 w-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-brand" />
                <span className="block text-[11px] font-semibold text-brand">이 공고 {won(sane)}</span>
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="mt-1 text-[13px] text-mute">규격·단위 차이가 커서 단가를 하나로 보기 어려움{it.n < 10 ? ` · ${it.n}건` : ''}</p>
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
