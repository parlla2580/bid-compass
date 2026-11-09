'use client';

import Link from 'next/link';
import { COPY } from '@/lib/copy';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SignupSheet } from '@/components/signup-sheet';
import { Card, Header, PageTitle, Shell } from '@/components/layout';
import { BTN_PRIMARY } from '@/components/ui';
import { fetchMyBidList, fetchMyReport, type BidReport, type MyBidItem, type NearMiss } from '@/lib/analysis';
import { MarketSection } from './market';
import { fmtDate } from '@/lib/format';
import { useJudged, useStore } from '@/lib/store';


/** F7 입찰 분석 — 성적표(F7-1), 아깝게 놓친 공고(F7-2), 하한선 미달(F7-3), 기관·유형별 */
export default function AnalysisPage() {
  const { loaded, account, profile } = useStore();
  const judged = useJudged();
  const [report, setReport] = useState<BidReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    if (!account) return;
    fetchMyReport(3).then(setReport).catch((e: Error) => setError(e.message));
  }, [account, profile.corpName]);

  // 맞춤 공고 중 '이력' 근거가 있는 공고 — 맞춤 공고 수의 부분집합이 되도록 같은 기준 사용
  const matched = useMemo(() => (judged ?? []).filter((j) => j.matched), [judged]);
  const fromHistory = useMemo(() => matched.filter((j) => j.fit?.factors.some((f) => f.key === 'history' && f.value >= 0.5)), [matched]);
  const [tab, setTab] = useState<'me' | 'market'>('me');
  // 기관별 지금 열린 공고 수 (어디서 잘하나 → 공고로 바로 이어짐)
  const openOf = useMemo(() => {
    const m = new Map<string, { all: number; matched: number }>();
    for (const j of judged ?? []) {
      if (j.notice.d < 0) continue;
      for (const k of new Set([j.notice.demandOrg ?? j.notice.org, j.notice.org])) {
        const v = m.get(k) ?? { all: 0, matched: 0 };
        v.all++; if (j.matched) v.matched++;
        m.set(k, v);
      }
    }
    return m;
  }, [judged]);

  let body: React.ReactNode;
  if (!loaded) body = <div className="h-40 animate-pulse rounded-box bg-white" />;
  else if (!account) {
    body = (
      <Empty title="가입하면 우리 회사 입찰 성적표를 볼 수 있어요"
        text="회사를 확인하면 투찰 이력을 찾아 분석해요. 따로 입력할 건 없어요.">
        <button type="button" onClick={() => setSignup(true)} className={BTN_PRIMARY}>가입하고 성적표 보기</button>
      </Empty>
    );
  } else if (error) body = <p className="rounded-box bg-white p-5 text-[15px] text-bad">분석을 불러오지 못했어요: {error}</p>;
  else if (!report) body = <div className="h-40 animate-pulse rounded-box bg-white" />;
  else if (!report.verified) {
    body = (
      <Empty title="회사 확인이 필요해요"
        text="사업자등록번호와 대표자명으로 회사를 확인한 회원에게만 보여드려요.">
        <Link href="/mypage?edit=company" className={BTN_PRIMARY}>기업 정보 확인하기</Link>
      </Empty>
    );
  } else if (!report.total) {
    body = (
      <Empty title="아직 분석할 입찰 이력이 없어요"
        text="개찰 결과를 매일 모으고 있어요. 서비스 공개 때 최근 3년치를 받아오면 성적표가 채워져요.">
        <Link href="/bids" className={BTN_PRIMARY}>지금 참여 가능한 공고 보기</Link>
      </Empty>
    );
  } else {
    const r = report;
    const total = r.total ?? 0, won = r.won ?? 0;
    body = (
      <div className="space-y-3 lg:space-y-4">
        {/* 탭: 우리 회사 성적 / 우리 시장 */}
        <div className="flex rounded-btn bg-line/60 p-1 lg:inline-flex" role="tablist">
          {([['me', '입찰 성과'], ['market', '시장 분석']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`flex-1 rounded-[10px] px-5 py-2 text-[15px] font-semibold transition ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>{label}</button>
          ))}
        </div>

        {tab === 'market' ? <MarketSection /> : (
          <>
            {/* 한눈에: 낙찰률 도넛 + 핵심 숫자 */}
            <section className="grid gap-3 rounded-box bg-white p-5 lg:grid-cols-[220px_1fr] lg:items-center lg:gap-8 lg:p-7">
              {/* 낙찰률은 투찰 순위를 받은 개찰 기준 (012). 012 실행 전이면 전체 기준 */}
              {r.won_detailed !== undefined && r.detailed ? (
                <div>
                  <Donut value={r.won_detailed / r.detailed} label="낙찰률" />
                  <p className="mt-1 text-center text-[12px] text-mute">투찰 순위를 받은 {r.detailed}건 기준</p>
                </div>
              ) : <Donut value={total ? won / total : 0} label="낙찰률" />}
              <div>
                <div className="grid grid-cols-3 gap-2">
                  <Mini label="투찰" value={total.toLocaleString()} unit="건" />
                  <Mini label="낙찰" value={won.toLocaleString()} unit="건" tone="text-brand" />
                  <Mini label="하한 미달" value={(r.below_floor ?? 0).toLocaleString()} unit="건" tone={r.below_floor ? 'text-bad' : 'text-ink'} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[14px]">
                  <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">평균 투찰률</dt><dd className="mt-0.5 font-semibold">{r.avg_rate ? `${r.avg_rate}%` : '–'}</dd></div>
                  <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">참여 공고 평균 경쟁</dt><dd className="mt-0.5 font-semibold">{r.avg_participants ? `${r.avg_participants.toLocaleString()}개사` : '–'}</dd></div>
                </dl>
                <Coverage total={total} detailed={r.detailed} />
              </div>
            </section>

            {fromHistory.length > 0 && (
              <Link href="/bids?hist=1" className="flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
                <span className="flex-1 text-sub">맞춤 공고 {matched.length.toLocaleString()}건 중 <b className="font-semibold text-brand">{fromHistory.length.toLocaleString()}건</b>은 우리가 참여·낙찰했던 공고와 비슷해요</span>
                <ChevronRight className="h-5 w-5 text-mute" />
              </Link>
            )}

            <MonthlyCard />

            <HistoryCard />

            <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
              <BreakdownCard byType={r.by_type ?? {}} orgs={r.top_orgs ?? []} open={openOf} />

              {/* F7-2 아깝게 놓친 공고 — 1순위와 차이를 막대로 */}
              <Card title="아깝게 놓친 공고" aside={<span className="text-[13px] text-mute">1순위와 차이</span>}>
                {r.near_misses?.length ? <GapBars items={r.near_misses} /> : <p className="py-6 text-center text-[14px] text-mute">해당하는 공고가 없어요</p>}
              </Card>

              {/* F7-3 하한선 미달 */}
              <Card title="낙찰하한선 미달" aside={<span className="text-[13px] text-mute">하한율보다 낮게 투찰</span>}>
                {r.below_floor_list?.length ? (
                  <>
                    <p className="text-[15px] text-sub">투찰 {total}건 중 <b className="text-[20px] font-bold text-bad">{r.below_floor ?? 0}건</b>이 하한 미달로 빠졌어요</p>
                    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fill">
                      <div className="bg-bad" style={{ width: `${total ? ((r.below_floor ?? 0) / total) * 100 : 0}%` }} />
                    </div>
                    <More items={r.below_floor_list} render={(m) => (
                      <li key={m.id}>
                        <Link href={`/analysis/${m.id}`} className="flex items-center gap-2 py-3 hover:bg-fill/60">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 block text-[15px] font-medium">{m.title}</span>
                            <span className="mt-0.5 block text-[13px] text-mute">{m.org ?? ''} · {fmtDate(new Date(m.opened_at))} · 투찰률 {m.rate}%</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                        </Link>
                      </li>
                    )} />
                    <Link href="/calculator" className="mt-2 inline-flex items-center text-[15px] font-semibold text-brand">투찰 전에 하한 구간 계산하기<ChevronRight className="h-4 w-4" /></Link>
                  </>
                ) : <p className="py-6 text-center text-[14px] text-mute">하한선 미달로 빠진 공고가 없어요</p>}
              </Card>
            </div>
          </>
        )}

        <p className="px-1 text-[13px] leading-relaxed text-mute">
          {COPY.reference} {COPY.referenceMore}
        </p>
      </div>
    );
  }

  return (
    <Shell wide>
      <Header />
      <main className="space-y-4 px-5 pb-28 lg:px-0 lg:pb-0">
        <PageTitle title="우리 회사 입찰 분석" sub={`${profile.corpName ? `${profile.corpName} · ` : ''}나라장터 개찰 결과 기준`} />
        {body}
      </main>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="회사를 확인하면 입찰 성적표를 바로 보여드려요." onDone={() => setSignup(false)} />
    </Shell>
  );
}

function Empty({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box bg-white px-6 py-12 text-center">
      <h2 className="text-[20px] font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed text-sub">{text}</p>
      <div className="mx-auto mt-6 max-w-[360px]">{children}</div>
    </section>
  );
}

/** 어디서 잘하나 — [유형 | 기관] 전환. 유형은 3칸 숫자, 기관은 낙찰률 순 막대 + 우리 평균선 */
function BreakdownCard({ byType, orgs, open }: { byType: Record<string, { total: number; won: number }>; orgs: { org: string; total: number; won: number }[]; open: Map<string, { all: number; matched: number }> }) {
  const [view, setView] = useState<'type' | 'org'>('type');
  const [sort, setSort] = useState<'total' | 'rate'>('total');
  const types = (['물품', '용역', '공사'] as const).map((t) => ({ label: t, ...(byType[t] ?? { total: 0, won: 0 }) }));
  const sumT = types.reduce((a, t) => a + t.total, 0), sumW = types.reduce((a, t) => a + t.won, 0);
  const avg = sumT ? sumW / sumT : 0;
  const rate = (o: { won: number; total: number }) => (o.total ? o.won / o.total : 0);
  const rows = [...orgs].sort((a, b) => (sort === 'rate' ? rate(b) - rate(a) || b.total - a.total : b.total - a.total));
  const maxRate = Math.max(avg, ...rows.map(rate), 0.01);
  const seg = (on: boolean) => `rounded-[10px] px-3 py-1.5 text-[14px] font-semibold transition ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`;
  return (
    <Card title="어디서 잘하나" aside={
      <div className="flex gap-1 rounded-btn bg-line/60 p-1" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'type'} onClick={() => setView('type')} className={seg(view === 'type')}>유형</button>
        <button type="button" role="tab" aria-selected={view === 'org'} onClick={() => setView('org')} className={seg(view === 'org')}>기관</button>
      </div>
    }>
      {view === 'type' ? (
        <div className="grid grid-cols-3 gap-2">
          {types.map((t) => {
            const r = rate(t), best = t.total > 0 && types.every((x) => x.total === 0 || rate(x) <= r);
            return (
              <div key={t.label} className={`rounded-2xl p-3 text-center ${t.total ? 'bg-fill' : 'bg-fill/50'}`}>
                <p className="text-[14px] font-semibold text-sub">{t.label}</p>
                <p className={`mt-1 text-[22px] font-bold tabular-nums ${!t.total ? 'text-mute' : best ? 'text-brand' : 'text-ink'}`}>{t.total ? `${Math.round(r * 100)}%` : '–'}</p>
                <p className="mt-0.5 text-[12px] tabular-nums text-mute">{t.total ? `${t.won}/${t.total}건` : '투찰 없음'}</p>
                <div className="mx-auto mt-2 h-1.5 w-full rounded-full bg-white"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${r * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
      ) : rows.length ? (
        <>
          <div className="mb-3 flex items-center justify-between text-[13px] text-mute">
            <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-ink" />우리 평균 {Math.round(avg * 100)}%</span>
            <span className="flex gap-2">
              {(['total', 'rate'] as const).map((k) => (
                <button key={k} type="button" onClick={() => setSort(k)} className={sort === k ? 'font-semibold text-ink' : ''}>{k === 'total' ? '투찰 많은 순' : '낙찰률 순'}</button>
              ))}
            </span>
          </div>
          <ul className="space-y-4">
            {rows.map((o) => {
              const r = rate(o);
              return (
                <li key={o.org}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate">{o.org}</span>
                    <span className="shrink-0 tabular-nums text-mute">{o.won}/{o.total}건 · <b className={`font-semibold ${r > avg ? 'text-brand' : 'text-ink'}`}>{Math.round(r * 100)}%</b></span>
                  </div>
                  <div className="relative h-2.5 rounded-full bg-fill">
                    <div className={`absolute inset-y-0 left-0 rounded-full ${r > avg ? 'bg-brand' : 'bg-[#C9CED6]'}`} style={{ width: `${(r / maxRate) * 100}%` }} />
                    <i className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${(avg / maxRate) * 100}%` }} />
                  </div>
                  {(() => {
                    const op = open.get(o.org);
                    if (!op?.all) return <p className="mt-1.5 text-[13px] text-mute">지금 열린 공고 없음</p>;
                    const href = `/bids?${op.matched ? '' : 'tab=all&'}org=${encodeURIComponent(o.org)}`;
                    return (
                      <Link href={href} className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand">
                        이 기관 공고, 지금 {op.all}건 열려 있어요{op.matched ? ` (맞춤 ${op.matched}건)` : ''}<ChevronRight className="h-4 w-4" />
                      </Link>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] text-mute">파란 막대는 우리 평균보다 낙찰률이 높은 기관이에요. 투찰이 적은 기관은 우연일 수 있어요.</p>
        </>
      ) : <p className="py-6 text-center text-[14px] text-mute">아직 기관별로 볼 만큼 투찰이 없어요</p>}
    </Card>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3 text-[12px] text-mute">
      <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-line" />투찰</span>
      <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm bg-brand" />낙찰</span>
    </span>
  );
}

/** 낙찰률 도넛 */
function Donut({ value, label }: { value: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto h-[150px] w-[150px] lg:h-[180px] lg:w-[180px]">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#F1F3F5" strokeWidth="12" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="#2563EB" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${Math.max(0.001, value) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] text-mute">{label}</span>
        <span className="text-[28px] font-bold tabular-nums text-brand">{(value * 100).toFixed(1)}<span className="text-[16px]">%</span></span>
      </div>
    </div>
  );
}

function Mini({ label, value, unit, tone = 'text-ink' }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div className="text-center lg:text-left">
      <p className="text-[13px] text-mute">{label}</p>
      <p className={`mt-0.5 text-[24px] font-bold tabular-nums lg:text-[28px] ${tone}`}>{value}<span className="ml-0.5 text-[14px] font-medium text-mute">{unit}</span></p>
    </div>
  );
}

/** 투찰 순위까지 받은 비율 — 데이터 신뢰도 표시 */
function Coverage({ total, detailed }: { total: number; detailed?: number }) {
  if (detailed === undefined || !total) return null;
  const p = Math.min(1, detailed / total);
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[12px] text-mute">
        <span>투찰 순위까지 받은 건</span><span className="tabular-nums">{detailed}/{total}건</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-fill"><div className="h-1.5 rounded-full bg-mute/60" style={{ width: `${p * 100}%` }} /></div>
      {p < 1 && <p className="mt-1 text-[12px] text-mute">나머지는 낙찰 결과만 있어 아깝게 놓친 공고·하한 미달이 일부만 보여요</p>}
    </div>
  );
}

/** 월별 투찰·낙찰 (최근 12개월) — 회원 이력으로 계산 */
function MonthlyCard() {
  const { history } = useStore();
  const months = useMemo(() => {
    const now = new Date();
    const list = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}월`, total: 0, won: 0 };
    });
    const idx = new Map(list.map((m, i) => [m.key, i]));
    for (const h of history) {
      const d = new Date(h.opened_at);
      const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i === undefined) continue;
      list[i].total++;
      if (h.won) list[i].won++;
    }
    return list;
  }, [history]);
  const max = Math.max(1, ...months.map((m) => m.total));
  if (!months.some((m) => m.total)) return null;
  return (
    <Card title="월별 투찰·낙찰" aside={<Legend />}>
      <div className="flex h-36 items-end gap-1.5 lg:gap-3">
        {months.map((m) => (
          <div key={m.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] tabular-nums text-mute">{m.total || ''}</span>
            <div className="relative w-full max-w-[36px] rounded-t-md bg-line" style={{ height: `${(m.total / max) * 100}%` }}>
              <div className="absolute inset-x-0 bottom-0 rounded-t-md bg-brand" style={{ height: m.total ? `${(m.won / m.total) * 100}%` : 0 }} />
            </div>
            <span className="text-[11px] text-mute">{m.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** 아깝게 놓친 공고 — 1순위와의 차이(%p)를 막대로, 짧을수록 아까움 */
function GapBars({ items }: { items: NearMiss[] }) {
  const max = Math.max(0.5, ...items.map((m) => Number(m.gap)));
  return (
    <More items={items} render={(m) => (
      <li key={m.id} className="py-3">
        <Link href={`/analysis/${m.id}`} className="flex items-start justify-between gap-3 hover:text-brand">
          <p className="line-clamp-1 text-[15px] font-medium">{m.title}</p>
          <p className="shrink-0 text-[15px] font-semibold tabular-nums text-warn">{m.gap}%p</p>
        </Link>
        <div className="mt-1.5 h-1.5 rounded-full bg-fill"><div className="h-1.5 rounded-full bg-warn/70" style={{ width: `${(Number(m.gap) / max) * 100}%` }} /></div>
        <p className="mt-1 text-[12px] text-mute">{m.rank}위{m.participants ? `/${m.participants}개사` : ''} · 내 {m.rate}% · 1순위 {m.first_rate}% · {fmtDate(new Date(m.opened_at))}</p>
      </li>
    )} />
  );
}

/** 3개만 보여주고 더 보기 */
function More<T>({ items, render }: { items: T[]; render: (x: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      <ul className="divide-y divide-line">{(all ? items : items.slice(0, 3)).map(render)}</ul>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="w-full py-2 text-[14px] font-medium text-sub">{all ? '접기' : `${items.length - 3}건 더 보기`}</button>
      )}
    </>
  );
}

/** 투찰·낙찰한 공고 목록 — 누르면 개찰 결과 요약 */
function HistoryCard() {
  const [items, setItems] = useState<MyBidItem[] | null | undefined>(undefined);
  const [f, setF] = useState<'all' | 'won' | 'lost' | 'below'>('all');
  const [n, setN] = useState(10);
  useEffect(() => { fetchMyBidList().then(setItems).catch(() => setItems(null)); }, []);
  if (items === undefined) return <div className="h-40 animate-pulse rounded-box bg-white" />;
  if (!items) return null; // 011 실행 전
  const pick = { all: items, won: items.filter((i) => i.won), lost: items.filter((i) => !i.won && i.note !== 1), below: items.filter((i) => i.note === 1) };
  const rows = pick[f];
  const tag = (i: MyBidItem) => i.won ? { t: '낙찰', c: 'bg-brand text-white' } : i.note === 1 ? { t: '하한 미달', c: 'bg-bad/10 text-bad' } : { t: i.rank ? `${i.rank}위` : '탈락', c: 'bg-fill text-sub' };
  return (
    <Card title="투찰한 공고" aside={<span className="text-[13px] text-mute">{items.length}건</span>}>
      <div className="no-scrollbar -mt-1 mb-2 flex gap-1.5 overflow-x-auto">
        {([['all', '전체'], ['won', '낙찰'], ['lost', '탈락'], ['below', '하한 미달']] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setF(k); setN(10); }} aria-pressed={f === k}
            className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium ${f === k ? 'border-ink bg-ink text-white' : 'border-line bg-white text-sub'}`}>
            {label} {pick[k].length}
          </button>
        ))}
      </div>
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.slice(0, n).map((i) => {
            const t = tag(i);
            return (
              <li key={i.id}>
                <Link href={`/analysis/${i.id}`} className="flex items-center gap-3 py-3 hover:bg-fill/60">
                  <span className={`w-[68px] shrink-0 rounded-full py-1 text-center text-[12px] font-semibold ${t.c}`}>{t.t}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-[15px] font-medium">{i.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-mute">{i.org ?? ''} · {fmtDate(new Date(i.opened_at))}{i.participants ? ` · ${i.participants}곳 참가` : ''}{!i.won && i.winner ? ` · 낙찰 ${i.winner}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right text-[13px] tabular-nums text-sub">{i.rate ? `${i.rate}%` : ''}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : <p className="py-6 text-center text-[14px] text-mute">해당하는 공고가 없어요</p>}
      {rows.length > n && <button type="button" onClick={() => setN(n + 20)} className="w-full py-2 text-[14px] font-medium text-sub">{Math.min(20, rows.length - n)}건 더 보기</button>}
    </Card>
  );
}
