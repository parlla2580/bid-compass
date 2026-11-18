'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';
import { Card } from '@/components/layout';
import { fmtDate, fmtShort } from '@/lib/format';
import { fetchH2H, fetchMissed, fetchMyBidList, fetchMyMarket, fetchRivalWins, type H2H, type MarketCompetitor, type Missed, type MyMarket, type RivalWin } from '@/lib/analysis';
import { bucketPhrase, winPattern, type WinPattern } from '@/lib/win-pattern';
import { useStore } from '@/lib/store';

/*
 * 입찰 분석 — 「시장 분석」 (010 my_market · 030 my_h2h · my_missed)
 * 2026-11-18 개편: 묘사(누가 있나) 대신 질문 셋에 답하고, 답마다 다음 행동(공고)으로 잇기
 *  Q1 우리는 어떤 판에서 이기나 — 내 투찰 기록을 조건별로 나눈 낙찰률 (lib/win-pattern)
 *  Q2 누구와 싸우고, 앞서고 있나 — 자주 만나는 회사와의 순위 비교 (030 my_h2h)
 *  Q3 우리 시장인데 놓친 공고 — 들어간 비율, 놓친 기관, 지금 열린 공고 (030 my_missed)
 *  그 밖(낙찰 금액 비중·다른 시장·새 회사)은 아래 '시장 지도'로
 * 근거 건수를 항상 함께 보여 주고, 표본이 적으면 숨기거나 '참고'로
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
  // Q1 — 전체 투찰 기준 (시장을 골라도 그대로)
  const [wp, setWp] = useState<WinPattern | null | undefined>(undefined);
  useEffect(() => { fetchMyBidList().then((l) => setWp(l ? winPattern(l) : null)).catch(() => setWp(null)); }, []);
  // Q2 — 자주 만나는 회사 순위가 나온 뒤
  const [h2h, setH2h] = useState<H2H[] | null | undefined>(undefined);
  const compKey = (m?.competitors ?? []).map((c) => c.bizno).join(',');
  useEffect(() => {
    if (!m?.competitors) return;
    setH2h(undefined);
    fetchH2H(m.competitors.map((c) => c.bizno), seg).then(setH2h).catch(() => setH2h(null));
  }, [compKey, seg]); // eslint-disable-line react-hooks/exhaustive-deps
  // Q3
  const [missed, setMissed] = useState<Missed | null | undefined>(undefined);
  useEffect(() => { setMissed(undefined); fetchMissed(seg).then(setMissed).catch(() => setMissed(null)); }, [seg]);

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
        <p className="mt-0.5 text-[14px] text-mute">우리 투찰 기록으로 본, 우리가 이기는 판과 놓친 기회예요</p>
      </div>

      <WinPatternCard wp={wp} />

      <div className="px-1 pt-2">
        <h3 className="text-[17px] font-bold">{segName ? `'${segName}' 시장` : '우리 시장'}</h3>
        {chips}
        <p className="mt-1 text-[13px] text-mute">우리가 투찰한 개찰 {n.toLocaleString()}건 기준{thin ? ' · 아직 근거가 적어요' : ''}</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card title="자주 만나는 회사와의 전적" aside={<span className="text-[13px] text-mute">순위 비교</span>}>
          {comps.length ? <Rivals comps={comps} market={seg} h2h={h2h} /> : <Empty text={`함께 ${n >= 10 ? 3 : 2}건 이상 들어간 회사가 아직 없어요`} />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">둘 다 순위가 나온 공고에서 누가 앞섰는지예요. 낙찰은 추첨 영향이 커서 참고만 하세요. 누르면 그 회사가 이 시장에서 낙찰한 공고를 볼 수 있어요.</p>
        </Card>
        <MissedCard d={missed} />
      </div>

      <div className="px-1 pt-2"><h3 className="text-[17px] font-bold">시장 지도</h3></div>
      <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
        <Card title="이 시장 낙찰 금액" aside={m.market?.openings_with_winner ? <span className="text-[13px] text-mute">낙찰 {m.market.openings_with_winner}건 기준</span> : null}>
          <Share market={m.market} />
        </Card>

        <Card title="경쟁사가 가는 다른 시장" aside={<span className="text-[13px] text-mute">최근 1년</span>}>
          {m.other_markets?.length
            ? <Bars rows={m.other_markets.map((o) => { const open = openByOrg.get(o.org) ?? 0; return { label: `${o.org}`, tag: o.type, value: o.firms, sub: `공고 ${o.openings}건`, unit: '곳',
                link: open ? { href: `/bids?tab=all&org=${encodeURIComponent(o.org)}`, label: `지금 낸 공고 ${open}건 보기` } : undefined }; })} />
            : <Empty text="아직 찾은 다른 시장이 없어요" />}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">자주 만나는 회사 중 몇 곳이 갔는지예요. 우리가 안 가 본 기관만 보여 드려요.</p>
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

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Q1 우리가 이기는 판 — 조건별 낙찰률 막대 + 평균선, 뚜렷한 차이 하나를 맨 위 한 줄로 */
function WinPatternCard({ wp }: { wp: WinPattern | null | undefined }) {
  if (wp === undefined) return <div className="h-48 animate-pulse rounded-box bg-white" />;
  if (!wp || !wp.dims.length) return null;
  const h = wp.headline;
  return (
    <div className="rounded-box bg-white p-5 lg:p-6">
      <p className="text-[13px] font-semibold text-brand">우리가 이기는 판</p>
      {h ? (
        <div className="mt-1.5 flex gap-2.5">
          <Lightbulb className="mt-1 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-[18px] font-bold leading-snug tracking-tight">
              <span className="text-brand">{bucketPhrase(h.key, h.hi.label)}</span> 공고에서 낙찰률 {pct(h.hi.rate)},<br className="sm:hidden" /> {bucketPhrase(h.key, h.lo.label)}에선 {pct(h.lo.rate)}
            </p>
            <p className="mt-0.5 text-[13px] text-mute">{h.dim}별로 나눠 본 결과 · 각 {h.hi.n}건 · {h.lo.n}건</p>
            {h.hi.href && <Link href={h.hi.href} className="mt-2 inline-flex items-center text-[14px] font-semibold text-brand">지금 열린 {h.hi.label} 공고 보기<ChevronRight className="h-4 w-4" /></Link>}
          </div>
        </div>
      ) : (
        <p className="mt-1.5 text-[16px] font-bold leading-snug">아직 어느 조건에서도 낙찰률이 뚜렷하게 갈리지 않아요</p>
      )}

      <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
        {wp.dims.map((d) => (
          <div key={d.key}>
            <p className="mb-2 text-[13px] font-semibold text-sub">{d.title}</p>
            <ul className="space-y-2">
              {d.buckets.map((b) => {
                const up = b.rate > wp.rate;
                const row = (
                  <>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="min-w-0 truncate text-ink">{b.label}</span>
                      <span className="shrink-0 tabular-nums"><b className="font-semibold text-ink">{pct(b.rate)}</b><span className="ml-1 text-mute">{b.n}건</span></span>
                    </div>
                    <div className="relative h-2 rounded-full bg-fill">
                      <div className={`h-2 rounded-full ${up ? 'bg-brand' : 'bg-[#C9D7F9]'}`} style={{ width: `${Math.max(2, b.rate * 100)}%` }} />
                      <span className="absolute -top-0.5 h-3 w-px bg-ink/40" style={{ left: `${wp.rate * 100}%` }} aria-hidden />
                    </div>
                  </>
                );
                return <li key={b.label}>{b.href ? <Link href={b.href} className="block rounded-lg hover:opacity-80">{row}</Link> : row}</li>;
              })}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-mute">세로 선은 우리 평균 낙찰률 {pct(wp.rate)}(결과가 나온 {wp.n}건)이에요. 5건 미만인 구간은 뺐어요.</p>
    </div>
  );
}

/** Q3 놓친 공고 — 우리 시장에서 들어간 비율, 놓친 공고가 많은 기관, 지금 열린 공고 */
function MissedCard({ d }: { d: Missed | null | undefined }) {
  if (d === undefined) return <div className="h-48 animate-pulse rounded-box bg-white" />;
  if (!d || !d.total) return null;
  const share = d.joined / d.total;
  return (
    <Card title="우리 시장인데 놓친 공고" aside={<span className="text-[13px] text-mute">최근 {d.days}일</span>}>
      <p className="text-[15px] leading-relaxed text-sub">
        우리 시장 공고 <b className="text-ink">{d.total.toLocaleString()}건</b> 중 들어간 건 <b className="text-ink">{d.joined.toLocaleString()}건({pct(share)})</b>이에요.
      </p>
      <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        <div className="bg-brand" style={{ width: `${share * 100}%` }} />
        <div className="flex-1 bg-fill" />
      </div>
      {d.missed_avg_participants != null && d.joined_avg_participants != null && (
        <p className="mt-2 text-[13px] text-mute">평균 참가 — 놓친 공고 {d.missed_avg_participants}곳 · 들어간 공고 {d.joined_avg_participants}곳</p>
      )}

      {d.missed_orgs.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 text-[13px] font-semibold text-sub">많이 놓친 기관</p>
          <ul className="divide-y divide-line">
            {d.missed_orgs.slice(0, 3).map((o) => (
              <li key={o.org}>
                <Link href={`/bids?tab=all&org=${encodeURIComponent(o.org)}`} className="flex items-center justify-between gap-3 py-2 text-[14px] hover:opacity-80">
                  <span className="min-w-0 truncate font-medium">{o.org}</span>
                  <span className="flex shrink-0 items-center text-[13px] text-mute">{o.n}건{o.avg_participants != null ? ` · 평균 ${o.avg_participants}곳` : ''}<ChevronRight className="h-4 w-4" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {d.open_now > 0 && (
        <div className="mt-4 rounded-xl bg-brand-soft px-4 py-3">
          <p className="text-[14px] font-semibold text-brand">지금 열린 우리 시장 공고 {d.open_now.toLocaleString()}건</p>
          <ul className="mt-1.5 space-y-1">
            {d.open_list.map((o) => (
              <li key={o.id}>
                <Link href={`/bids/${o.id}`} className="flex items-baseline justify-between gap-3 text-[14px] hover:underline">
                  <span className="min-w-0 truncate text-ink">{o.title}</span>
                  <span className="shrink-0 text-[12px] text-mute">{fmtDate(new Date(o.closes_at))} 마감</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
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

/** 자주 만나는 회사와의 전적 — 순위 비교 막대(우리 앞섬 | 그쪽 앞섬), 누르면 이 시장에서 그 회사가 낙찰한 공고 (025·030) */
function Rivals({ comps, market, h2h }: { comps: MarketCompetitor[]; market: string | null; h2h?: H2H[] | null }) {
  const hmap = new Map((h2h ?? []).map((h) => [h.bizno, h]));
  const [open, setOpen] = useState<number | null>(null);
  const [wins, setWins] = useState<Record<string, RivalWin[] | null | undefined>>({});
  const key = (b: number) => `${b}:${market ?? ''}`;
  const toggle = (c: MarketCompetitor) => {
    const next = open === c.bizno ? null : c.bizno;
    setOpen(next);
    const k = key(c.bizno);
    if (next === null || !c.wins || (k in wins && wins[k] !== null)) return; // 실패(null)면 다시 누를 때 다시 받음
    setWins((w) => ({ ...w, [k]: undefined }));
    fetchRivalWins(c.bizno, 3, market).then((r) => setWins((w) => ({ ...w, [k]: r }))).catch(() => setWins((w) => ({ ...w, [k]: null })));
  };
  return (
    <ul className="space-y-1">
      {comps.map((c, i) => {
        const on = open === c.bizno;
        const list = wins[key(c.bizno)];
        const h = hmap.get(c.bizno);
        const cmp = h ? h.i_ahead + h.they_ahead : 0;
        return (
          <li key={`${c.bizno}-${i}`}>
            <button type="button" onClick={() => toggle(c)} aria-expanded={on} className="-mx-2 block w-[calc(100%+1rem)] rounded-xl px-2 py-2 text-left hover:bg-fill">
              <div className="flex items-baseline justify-between gap-3 text-[14px]">
                <span className="flex min-w-0 items-center gap-1 font-medium"><span className="truncate">{c.name}</span><ChevronDown className={`h-3.5 w-3.5 shrink-0 text-mute transition ${on ? 'rotate-180' : ''}`} /></span>
                <span className="shrink-0 text-[12px] tabular-nums text-mute">{c.shared.toLocaleString()}번 만남{c.wins ? ` · 그쪽 낙찰 ${c.wins}` : ''}</span>
              </div>
              {h === undefined && h2h === undefined ? <div className="mt-1.5 h-2 animate-pulse rounded-full bg-fill" />
                : cmp > 0 ? (
                  <>
                    <div className="mt-1.5 flex h-2 gap-0.5 overflow-hidden rounded-full">
                      <div className="bg-brand" style={{ width: `${(h!.i_ahead / cmp) * 100}%` }} />
                      <div className="flex-1 bg-[#E4E7EC]" />
                    </div>
                    <div className="mt-1 flex justify-between text-[12px] tabular-nums">
                      <span className="text-brand">우리가 앞섬 {h!.i_ahead}</span>
                      <span className="text-mute">그쪽이 앞섬 {h!.they_ahead}</span>
                    </div>
                  </>
                ) : <p className="mt-1 text-[12px] text-mute">순위를 비교할 수 있는 공고가 아직 없어요</p>}
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
