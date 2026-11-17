'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/layout';
import { fmtDate, fmtShort } from '@/lib/format';
import { fetchMyMarket, fetchRivalWins, type MarketCompetitor, type MyMarket, type RivalWin } from '@/lib/analysis';
import { useStore } from '@/lib/store';

/*
 * 입찰 분석 — 「우리 시장」 (010 my_market)
 * 글보다 그림: 막대·100% 막대로 보여주고, 근거 건수를 항상 함께 표시
 */

const SHADES = ['#1D4ED8', '#3B6FE6', '#6B93EE', '#9DB7F4', '#C9D7F9'];
const MIN_RELIABLE = 10;
const chip = (on: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition ${on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`; // 우리 시장 개찰이 이보다 적으면 '데이터가 쌓이는 중' 표시

export function MarketSection() {
  const [m, setM] = useState<MyMarket | null | undefined>(undefined);
  const [seg, setSeg] = useState<string | null>(null);
  // 시장 목록은 처음(전체) 결과의 것을 계속 씀
  const [segs, setSegs] = useState<MyMarket['markets']>(undefined);
  const [allN, setAllN] = useState(0);
  // 다른 시장(기관)마다 지금 마감 전 공고 수 — 바로 공고로 넘어가게
  const { notices } = useStore();
  const openByOrg = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notices ?? []) { const o = n.demandOrg ?? n.org; if (n.d >= 0 && o) m.set(o, (m.get(o) ?? 0) + 1); }
    return m;
  }, [notices]);
  useEffect(() => {
    setM(undefined);
    fetchMyMarket(3, seg).then((r) => { setM(r); if (!seg && r?.markets) { setSegs(r.markets); setAllN(r.my_openings ?? 0); } }).catch(() => setM(null));
  }, [seg]);

  const segName = seg ? segs?.find((x) => x.key === seg)?.name : null;
  const chips = segs && segs.length > 1 && (
    <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
      <button type="button" onClick={() => setSeg(null)} className={chip(!seg)}>전체 {allN}</button>
      {segs.map((x) => (
        <button key={x.key} type="button" onClick={() => setSeg(x.key)} className={chip(seg === x.key)}>
          <span className="text-[12px] opacity-70">{x.type}</span> {x.name} {x.openings}
        </button>
      ))}
    </div>
  );

  // 시장을 바꾸는 동안에도 시장 고르기는 그대로 보이게
  if (m === undefined) return segs ? <section className="space-y-3"><div className="px-1 pt-4"><h2 className="text-[20px] font-bold">시장 분석</h2>{chips}</div><div className="h-48 animate-pulse rounded-box bg-white" /></section> : <div className="h-48 animate-pulse rounded-box bg-white" />;
  if (!m || !m.verified) return null; // 010 실행 전이거나 회사 확인 전

  const n = m.my_openings ?? 0;
  const comps = m.competitors ?? [];
  const thin = n < MIN_RELIABLE;

  return (
    <section className="space-y-3 lg:space-y-4">
      <div className="px-1 pt-4">
        <h2 className="text-[20px] font-bold">시장 분석</h2>
        {chips}
        <p className="mt-0.5 text-[14px] text-mute">{segName ? `'${segName}' 시장에서 ` : ''}우리가 투찰한 개찰 {n.toLocaleString()}건에 함께 들어온 회사들로 그린 시장 지도예요</p>
        {thin && <p className="mt-1 text-[13px] font-medium text-warn">아직 근거가 적어요({n}건). 데이터가 쌓이면 더 정확해져요.</p>}
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card title="자주 만나는 회사" aside={<span className="text-[13px] text-mute">함께 들어간 공고 수</span>}>
          {comps.length ? <Rivals comps={comps} market={seg} /> : <Empty text={`함께 ${n >= 10 ? 3 : 2}건 이상 들어간 회사가 아직 없어요`} />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">참가 업체가 많은 공고와 아무 공고에나 들어가는 회사는 가중치를 낮춰 순위를 매겼어요. &lsquo;이 시장 비중&rsquo;은 그 회사가 들어간 전체 공고 중 우리와 함께 들어간 비율이에요. 높을수록 우리 시장에 집중하는 직접 경쟁자예요. 회사를 누르면 이 시장에서 낙찰한 공고를 볼 수 있어요. 같은 순위면 이 시장에서 낙찰한 횟수, 최근에 만난 순으로 놓았어요. 낙찰 횟수는 추첨 영향이 커 참고만 하세요.</p>
        </Card>

        <Card title="이 시장 낙찰 금액" aside={m.market?.openings_with_winner ? <span className="text-[13px] text-mute">낙찰 {m.market.openings_with_winner}건 기준</span> : null}>
          <Share market={m.market} />
        </Card>

        <Card title="그 회사들이 가는 다른 시장" aside={<span className="text-[13px] text-mute">최근 1년</span>}>
          {m.other_markets?.length
            ? <Bars rows={m.other_markets.map((o) => { const open = openByOrg.get(o.org) ?? 0; return { label: `${o.org}`, tag: o.type, value: o.firms, sub: `공고 ${o.openings}건`, unit: '곳',
                link: open ? { href: `/bids?tab=all&org=${encodeURIComponent(o.org)}`, label: `지금 낸 공고 ${open}건 보기` } : undefined }; })} />
            : <Empty text="아직 찾은 다른 시장이 없어요" />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">자주 만나는 회사 중 몇 곳이 갔는지예요. 우리가 안 가본 기관만 보여드려요. 지금 마감 전 공고가 있으면 바로 볼 수 있어요.</p>
        </Card>

        <Card title="새로 들어온 회사" aside={<span className="text-[13px] text-mute">최근 90일</span>}>
          {m.newcomers?.length ? (
            <ul className="space-y-2.5">
              {m.newcomers.map((c) => (
                <li key={c.name} className="flex items-center justify-between gap-3 text-[15px]">
                  <span className="truncate font-medium">{c.name}</span>
                  <span className="shrink-0 text-[13px] text-mute">함께 {c.shared}건</span>
                </li>
              ))}
            </ul>
          ) : <Empty text="최근 새로 들어온 회사가 없어요" />}
        </Card>
      </div>
    </section>
  );
}

/** 가로 막대 — 값이 클수록 진한 파랑 */
function Bars({ rows }: { rows: { label: string; value: number; sub?: string; tag?: string; unit?: string; link?: { href: string; label: string } }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
            <span className="min-w-0 truncate font-medium">{r.label}{r.tag && <span className="ml-1.5 text-[12px] font-normal text-mute">{r.tag}</span>}</span>
            <span className="shrink-0 tabular-nums text-sub"><b className="font-semibold text-ink">{r.value.toLocaleString()}</b>{r.unit ?? '건'}{r.sub && <span className="ml-1.5 text-[12px] text-mute">{r.sub}</span>}</span>
          </div>
          <div className="h-2.5 rounded-full bg-fill">
            <div className="h-2.5 rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: SHADES[Math.min(SHADES.length - 1, Math.floor((1 - r.value / max) * SHADES.length))] }} />
          </div>
          {r.link && <Link href={r.link.href} className="mt-1 inline-block text-[13px] font-semibold text-brand">{r.link.label} →</Link>}
        </li>
      ))}
    </ul>
  );
}

/** 자주 만나는 회사 — 누르면 이 시장에서 그 회사가 낙찰한 공고 (025) */
function Rivals({ comps, market }: { comps: MarketCompetitor[]; market: string | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const [wins, setWins] = useState<Record<string, RivalWin[] | null | undefined>>({});
  const max = Math.max(1, ...comps.map((c) => c.shared));
  const key = (b: number) => `${b}:${market ?? ''}`;
  const toggle = (c: MarketCompetitor) => {
    const next = open === c.bizno ? null : c.bizno;
    setOpen(next);
    const k = key(c.bizno);
    if (next === null || !c.wins || k in wins) return;
    setWins((w) => ({ ...w, [k]: undefined }));
    fetchRivalWins(c.bizno, 3, market).then((r) => setWins((w) => ({ ...w, [k]: r }))).catch(() => setWins((w) => ({ ...w, [k]: null })));
  };
  return (
    <ul className="space-y-1">
      {comps.map((c, i) => {
        const on = open === c.bizno;
        const list = wins[key(c.bizno)];
        const share = c.their_total ? `이 시장 비중 ${Math.round((c.shared / Math.max(c.their_total, c.shared)) * 100)}%` : null;
        return (
          <li key={`${c.bizno}-${i}`}>
            <button type="button" onClick={() => toggle(c)} aria-expanded={on} className="-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-1.5 text-left hover:bg-fill">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
                <span className="flex min-w-0 items-center gap-1 font-medium"><span className="truncate">{c.name}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-mute transition ${on ? 'rotate-180' : ''}`} /></span>
                <span className="shrink-0 tabular-nums text-sub"><b className="font-semibold text-ink">{c.shared.toLocaleString()}</b>건
                  <span className="ml-1.5 text-[12px] text-mute">{[share, c.wins ? `낙찰 ${c.wins}번` : null].filter(Boolean).join(' · ')}</span></span>
              </div>
              <div className="h-2.5 rounded-full bg-fill">
                <div className="h-2.5 rounded-full" style={{ width: `${(c.shared / max) * 100}%`, background: SHADES[Math.min(SHADES.length - 1, Math.floor((1 - c.shared / max) * SHADES.length))] }} />
              </div>
            </button>
            {on && (
              <div className="mb-2 mt-1 rounded-xl bg-fill px-3.5 py-3 text-[13px]">
                {!c.wins ? <p className="text-sub">함께 {c.shared}건 들어갔지만 이 시장에서 낙찰한 적은 없어요.</p>
                  : list === undefined ? <p className="text-mute">낙찰한 공고를 찾는 중이에요</p>
                  : list === null ? <p className="text-mute">아직 준비 중이에요. 잠시 뒤 다시 눌러 주세요.</p>
                  : !list.length ? <p className="text-sub">낙찰한 공고를 찾지 못했어요.</p>
                  : (
                    <>
                      <p className="mb-2 font-semibold text-ink">이 시장에서 낙찰한 공고 {list.length}건{c.wins > list.length ? ` (최근 ${list.length}건)` : ''}</p>
                      <ul className="space-y-2">
                        {list.map((w) => (
                          <li key={w.id}>
                            <Link href={`/analysis/${w.id}`} className="block hover:underline">
                              <span className="line-clamp-1 font-medium text-ink">{w.title}</span>
                              <span className="text-[12px] text-mute">{[w.org, w.opened_at ? fmtDate(new Date(w.opened_at)) : null, w.amount ? `${fmtShort(w.amount)}원` : null].filter(Boolean).join(' · ')}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** 100% 막대 — 상위 회사·우리·그 외 */
function Share({ market }: { market: MyMarket['market'] }) {
  if (!market || !market.total_amount) return <Empty text="낙찰 금액이 있는 개찰이 아직 없어요" />;
  const total = market.total_amount;
  const leaders = market.leaders.filter((l) => !l.me);
  const segs = [
    ...leaders.map((l, i) => ({ name: l.name, amount: l.amount, color: SHADES[i] ?? '#C9D7F9' })),
    ...(market.mine > 0 ? [{ name: '우리 회사', amount: market.mine, color: '#191C21' }] : []),
  ];
  const rest = Math.max(0, total - segs.reduce((s, x) => s + x.amount, 0));
  const all = [...segs, ...(rest > 0 ? [{ name: '그 외', amount: rest, color: '#E8EAED' }] : [])];
  const top3 = leaders.slice(0, 3).reduce((s, x) => s + x.amount, 0);
  return (
    <div>
      <p className="text-[15px] text-sub">상위 3곳이 <b className="text-[20px] font-bold text-ink">{Math.round((top3 / total) * 100)}%</b>를 가져갔어요</p>
      <div className="mt-3 flex h-4 overflow-hidden rounded-full">
        {all.map((s) => <div key={s.name} title={`${s.name} ${Math.round((s.amount / total) * 100)}%`} style={{ width: `${(s.amount / total) * 100}%`, background: s.color }} />)}
      </div>
      <ul className="mt-4 space-y-2 text-[14px]">
        {all.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className={`min-w-0 flex-1 truncate ${s.name === '우리 회사' ? 'font-semibold' : ''}`}>{s.name}</span>
            <span className="shrink-0 tabular-nums text-mute">{fmtShort(s.amount)}원</span>
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{Math.round((s.amount / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[14px] text-mute">{text}</p>;
}
