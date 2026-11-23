'use client';

import Link from 'next/link';
import { COPY } from '@/lib/copy';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download } from 'lucide-react';
import { SignupSheet } from '@/components/signup-sheet';
import { VerifyBox } from '@/components/verify-box';
import { fetchMyVerification } from '@/lib/verify-client';
import { Card, Header, PageTitle, Shell } from '@/components/layout';
import { BTN_PRIMARY } from '@/components/ui';
import { Tip } from '@/components/tip';
import { bidOutcome, outcomeLabel, fetchMyBidList, fetchMyReport, type BidOutcome, type BidReport, type MyBidItem, type NearMiss } from '@/lib/analysis';
import { MarketSection } from './market';
import { PeersCard } from './peers';
import { fmtDate, fmtRate } from '@/lib/format';
import { useJudged, useStore } from '@/lib/store';
import { HIST_STRONG } from '@/lib/fit';
import { InlineCompass, LoadingBox } from '@/components/loading';


/** F7 입찰 분석 — 성적표(F7-1), 아깝게 놓친 공고(F7-2), 하한선 미달(F7-3), 기관·유형별 */
export default function AnalysisPage() {
  const { loaded, account, profile, updateProfile } = useStore();
  const judged = useJudged();
  const [report, setReport] = useState<BidReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    if (!account) return;
    fetchMyReport(3).then(setReport).catch((e: Error) => setError(e.message));
  }, [account, profile.corpName]);
  // 2026-11-23 위플랫 화면: 개찰 60일이 지났는데 낙찰자 정보가 없는 공고(유찰·자료 없음)가 '탈락'으로 분모에 들어가 0%로 보임
  //  → 투찰 목록(같은 조회, 30초 캐시)에서 경쟁 입찰 중 '결과 없음'을 세어 낙찰률 분모에서 뺌
  const [unknownComp, setUnknownComp] = useState(0);
  useEffect(() => {
    if (!report?.verified) return;
    fetchMyBidList().then((l) => setUnknownComp((l ?? []).filter((i) => (i.participants ?? 2) >= 2 && bidOutcome(i) === 'unknown').length)).catch(() => {});
  }, [report?.verified]);

  // 서버는 회사 확인됨(분석 열림)인데 업체명이 비어 있으면 채움 — 마이페이지·상단 업체명이 '확인 전'처럼 보이지 않게 (2026-11-18)
  useEffect(() => {
    if (!report?.verified || profile.corpName) return;
    fetchMyVerification().then((v) => { if (v) updateProfile({ corpName: v.corpName, naraRegistered: true }); }).catch(() => {});
  }, [report?.verified, profile.corpName]); // eslint-disable-line react-hooks/exhaustive-deps

  // 맞춤 공고 중 '이력' 근거가 있는 공고 — 맞춤 공고 수의 부분집합이 되도록 같은 기준 사용
  const matched = useMemo(() => (judged ?? []).filter((j) => j.matched), [judged]);
  const fromHistory = useMemo(() => matched.filter((j) => j.fit?.factors.some((f) => f.key === 'history' && f.value >= HIST_STRONG)), [matched]);
  const [tab, setTab] = useState<'me' | 'market'>('me');
  // 영업은 2026-11-22 '기관' 탭으로 이동 — 예전 주소(?tab=sales&org=기관, 알림 링크)는 그쪽으로 넘김
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('tab') === 'sales') window.location.replace(`/orgs?tab=sales${q.get('org') ? `&org=${encodeURIComponent(q.get('org')!)}` : ''}`);
    else if (q.get('tab') === 'market') setTab('market');
  }, []);
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
  if (!loaded) body = <LoadingBox className="h-40" />;
  else if (!account) {
    body = (
      <Empty title="가입하면 우리 회사 입찰 성적표를 볼 수 있어요"
        text="가입할 때 사업자등록번호와 대표자명으로 회사를 확인하면, 나라장터 투찰 이력을 찾아 바로 분석해 드려요.">
        <button type="button" onClick={() => setSignup(true)} className={BTN_PRIMARY}>가입하고 성적표 보기</button>
        <Link href="/login" className="mt-2 block py-2 text-center text-[15px] font-semibold text-sub">이미 가입했다면 로그인</Link>
      </Empty>
    );
  } else if (error) { console.warn('분석 불러오기 실패:', error); body = <p className="rounded-box bg-white p-5 text-[15px] text-sub">잠시 뒤 다시 시도해 주세요 <span className="text-mute">· 분석 불러오기 실패</span></p>; }
  else if (!report) body = <LoadingBox className="h-40" />;
  else if (!report.verified) {
    body = (
      <Empty title="회사 확인 후 열림" text="우리 회사 입찰 기록 · 확인된 회원 본인만" note="타사 기록 조회 불가">
        {profile.bizno
          ? <VerifyBox bizno={profile.bizno} className="" onVerified={(corpName) => updateProfile({ corpName, naraRegistered: true })} />
          : <Link href="/mypage?edit=company" className={BTN_PRIMARY}>사업자등록번호 넣기</Link>}
      </Empty>
    );
  } else if (!report.total) {
    body = (
      <Empty title="아직 입찰한 기록이 없어요"
        text="나라장터 개찰 결과에서 우리 회사 투찰을 찾지 못했어요. 입찰보다 수의계약으로 납품하는 회사라면, 수의계약 기관부터 찾아보세요.">
        <Link href="/orgs?tab=sales" className={BTN_PRIMARY}>수의계약 기관 보기</Link>
        <Link href="/bids" className="mt-3 block text-center text-[14px] font-semibold text-sub">지금 참여 가능한 공고 보기</Link>
      </Empty>
    );
  } else {
    const r = report;
    const total = r.total ?? 0, won = r.won ?? 0;
    const decided = Math.max(0, total - (r.pending ?? 0) - unknownComp);
    const excluded = [r.pending ? `결정 전 ${r.pending}` : null, unknownComp ? `결과 없음 ${unknownComp}` : null].filter(Boolean).join(' · ');
    body = (
      <div className="space-y-3 lg:space-y-4">
        {tab === 'market' ? <MarketSection /> : (
          <>
            {/* 한눈에: 낙찰률 도넛 + 핵심 숫자 */}
            <section className="grid gap-3 rounded-box bg-white p-5 lg:grid-cols-[220px_1fr] lg:items-center lg:gap-8 lg:p-7">
              {/* 낙찰률 = 낙찰 ÷ 결과가 난 투찰(투찰 − 결정 전) — 화면의 투찰·낙찰 숫자로 바로 검산되게 (2026-11-18 사용자 피드백)
                  예전(012)엔 '투찰 순위를 받은 개찰'만 분모로 써서, 순위 없이 끝난 탈락 18건이 빠져 71%로 부풀려졌음 */}
              <div>
                <Donut value={decided > 0 ? won / decided : 0} label={r.single != null ? '경쟁 입찰 낙찰률' : '낙찰률'} />
                <p className="mt-1 text-center text-[12px] text-mute">결과가 나온 {decided.toLocaleString()}건 중 낙찰 {won.toLocaleString()}건</p>
                {excluded && (
                  <p className="mt-0.5 flex items-center justify-center gap-1 text-[12px] text-mute">{excluded} 제외
                    <Tip title="제외한 투찰">결정 전은 아직 낙찰자가 정해지지 않은 공고예요. 결과 없음은 개찰 뒤 60일이 지나도 낙찰자 정보가 없는 공고(유찰 등)예요.</Tip>
                  </p>
                )}
                {/* 038 U12: 1곳 참가(수의·견적)는 경쟁 입찰 실력과 달라 낙찰률에서 뺌 — 건수만 따로 */}
                {!!r.single && (
                  <p className="mt-0.5 flex items-center justify-center gap-1 text-center text-[12px] text-mute">1곳 참가 {r.single.toLocaleString()}건 · 낙찰 {(r.single_won ?? 0).toLocaleString()} 별도
                    <Tip title="경쟁 입찰만 계산">참가 업체가 1곳인 개찰(수의계약·단가계약 등)은 거의 다 낙찰돼서 낙찰률 계산에서 뺐어요. 투찰한 공고 목록에는 모두 있어요.</Tip>
                  </p>
                )}
              </div>
              <div>
                <div className="grid grid-cols-3 gap-2">
                  <Mini label={r.single != null ? '경쟁 입찰' : '투찰'} value={total.toLocaleString()} unit="건" />
                  <Mini label="낙찰" value={won.toLocaleString()} unit="건" tone="text-brand"
                    sub={r.single_won ? `1곳 참가 +${r.single_won.toLocaleString()}` : undefined} />
                  <Mini label="하한 미달" value={(r.below_floor ?? 0).toLocaleString()} unit="건" tone={r.below_floor ? 'text-bad' : 'text-ink'} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-2 text-[14px]">
                  <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">평균 투찰률</dt><dd className="mt-0.5 font-semibold">{r.avg_rate ? fmtRate(r.avg_rate) : '–'}</dd></div>
                  <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">참여 공고 평균 경쟁</dt><dd className="mt-0.5 font-semibold">{r.avg_participants ? `${r.avg_participants.toLocaleString()}개사` : '–'}</dd></div>
                </dl>
                <Coverage total={total} detailed={r.detailed} />
              </div>
            </section>

            {/* 익명 업계 비교 (로드맵 3, 033) */}
            <PeersCard />

            {fromHistory.length > 0 && (
              <Link href="/bids?hist=1" className="flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
                <span className="flex-1 text-sub">이력과 비슷한 공고 <b className="font-semibold tabular-nums text-brand">{fromHistory.length.toLocaleString()}</b> <span className="text-mute">· 추천 <span className="tabular-nums">{matched.length.toLocaleString()}</span></span></span>
                <ChevronRight className="h-5 w-5 text-mute" />
              </Link>
            )}

            <MonthlyCard />

            <HistoryCard />

            <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
              <BreakdownCard byType={r.by_type ?? {}} orgs={r.top_orgs ?? []} open={openOf} />

              {/* F7-2 아깝게 놓친 공고 — 1순위와 차이를 막대로 */}
              <Card title="아깝게 놓친 공고" aside={<span className="text-[13px] text-mute">1순위와 차이</span>}>
                {r.near_misses?.length ? <GapBars items={r.near_misses} /> : <p className="py-6 text-center text-[14px] text-mute">해당 공고 없음</p>}
              </Card>

              {/* F7-3 하한선 미달 */}
              <Card title="낙찰하한선 미달" aside={<span className="text-[13px] text-mute">하한율보다 낮게 투찰</span>}>
                {r.below_floor_list?.length ? (
                  <>
                    <p className="text-[15px] text-sub">하한 미달 <b className="text-[20px] font-bold text-bad">{r.below_floor ?? 0}건</b> <span className="text-mute">/ 투찰 {total}건</span></p>
                    <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-fill">
                      <div className="bg-bad" style={{ width: `${total ? ((r.below_floor ?? 0) / total) * 100 : 0}%` }} />
                    </div>
                    <More items={r.below_floor_list} render={(m) => (
                      <li key={m.id}>
                        <Link href={`/analysis/${m.id}`} className="flex items-center gap-2 py-3 hover:bg-fill/60">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 block text-[15px] font-medium">{m.title}</span>
                            <span className="mt-0.5 block text-[13px] text-mute">{m.org ?? ''} · {fmtDate(new Date(m.opened_at))} · 투찰률 {fmtRate(m.rate)}</span>
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                        </Link>
                      </li>
                    )} />
                    <Link href="/calculator" className="mt-2 inline-flex items-center text-[15px] font-semibold text-brand">투찰 전에 하한 구간 계산하기<ChevronRight className="h-4 w-4" /></Link>
                  </>
                ) : <p className="py-6 text-center text-[14px] text-mute">하한 미달 없음</p>}
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
        <div className="-mx-5 lg:mx-0"><PageTitle title="우리 회사 입찰 분석" sub={`${profile.corpName ? `${profile.corpName} · ` : ''}나라장터 개찰 결과 기준`} /></div>
        {account && (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 rounded-btn bg-line/60 p-1 lg:flex-none" role="tablist">
              {([['me', '입찰 성과'], ['market', '시장 분석']] as const).map(([t, label]) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`flex-1 whitespace-nowrap rounded-[10px] px-2 py-2 text-[15px] font-semibold transition sm:px-3 lg:px-5 ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>{label}</button>
              ))}
            </div>
            {!!report?.total && <ExportButton corpName={profile.corpName ?? null} />}
          </div>
        )}
        {body}
      </main>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="회사를 확인하면 입찰 성적표를 바로 보여드려요." onDone={() => setSignup(false)} />
    </Shell>
  );
}

function Empty({ title, text, note, children }: { title: string; text: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box bg-white px-6 py-12 text-center">
      <h2 className="text-[20px] font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed text-sub">{text}</p>
      {/* W18(2026-11-22): 덧붙임은 같은 문장에 넣지 않고 따로 한 줄 */}
      {note && <p className="mx-auto mt-1.5 inline-flex items-center gap-1 rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-medium text-mute">{note}</p>}
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
    <Card title="유형·기관별 낙찰률" aside={
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
                    <Link href={`/orgs?name=${encodeURIComponent(o.org)}`} className="flex min-w-0 items-center gap-0.5 hover:opacity-80"><span className="truncate">{o.org}</span><ChevronRight className="h-4 w-4 shrink-0 text-mute" /></Link>
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
                        이 기관 지금 공고 {op.all}건{op.matched ? ` · 맞춤 ${op.matched}` : ''}<ChevronRight className="h-4 w-4" />
                      </Link>
                    );
                  })()}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12px] text-mute">파란 막대 = 우리 평균보다 낙찰률 높은 기관 · 투찰 적은 기관은 우연 가능</p>
        </>
      ) : <p className="py-6 text-center text-[14px] text-mute">기관별로 볼 만큼 투찰 부족</p>}
    </Card>
  );
}

/** 엑셀로 받기 — 누를 때만 작성기를 불러옴 */
function ExportButton({ corpName }: { corpName: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setErr(null);
    try {
      const [{ buildAnalysisWorkbook }, { downloadXlsx }] = await Promise.all([import('@/lib/export'), import('@/lib/xlsx')]);
      const { name, sheets } = await buildAnalysisWorkbook(corpName);
      downloadXlsx(name, sheets);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '내려받지 못했어요');
    } finally { setBusy(false); }
  };
  return (
    <div className="relative shrink-0">
      <button type="button" onClick={run} disabled={busy} aria-label="엑셀로 받기"
        className="flex h-[44px] shrink-0 items-center gap-1.5 rounded-btn bg-white px-3 text-[14px] font-semibold text-sub disabled:opacity-60 sm:px-3.5">
        {busy ? <InlineCompass className="h-[18px] w-[18px]" /> : <Download className="h-[18px] w-[18px]" />}<span className="hidden whitespace-nowrap min-[400px]:inline">{busy ? '만드는 중' : '엑셀'}</span>
      </button>
      {err && <p className="absolute right-0 top-full z-10 mt-1 w-56 rounded-xl bg-ink px-3 py-2 text-[13px] text-white">{err}</p>}
    </div>
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

function Mini({ label, value, unit, tone = 'text-ink', sub }: { label: string; value: string; unit: string; tone?: string; sub?: string }) {
  return (
    <div className="text-center lg:text-left">
      <p className="text-[13px] text-mute">{label}</p>
      <p className={`mt-0.5 text-[24px] font-bold tabular-nums lg:text-[28px] ${tone}`}>{value}<span className="ml-0.5 text-[14px] font-medium text-mute">{unit}</span></p>
      {/* 덧붙이는 숫자는 따로 작은 배지 (예: 경쟁 입찰 낙찰 0 + 1곳 참가 낙찰 1) */}
      {sub && <p className="mt-0.5"><span className="whitespace-nowrap rounded bg-fill px-1.5 py-0.5 text-[11px] font-medium text-sub">{sub}</span></p>}
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
      {p < 1 && (
        <p className="mt-1.5 flex items-center gap-1">
          <span className="rounded-md bg-fill px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-sub">순위 미수집 {(total - detailed).toLocaleString()}건</span>
          <Tip title="순위 미수집">투찰 순위가 아직 들어오지 않은 개찰이에요. 이 건들은 아깝게 놓친 공고·하한 미달에 아직 안 잡혀요. 순위는 계속 채워져요.</Tip>
        </p>
      )}
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
      return { key: `${d.getFullYear()}-${d.getMonth()}`, label: `${d.getMonth() + 1}`, total: 0, won: 0 };
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
            <span className="whitespace-nowrap text-[11px] tabular-nums text-mute">{m.label}</span>
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
        <p className="mt-1 text-[12px] text-mute">{m.rank}위{m.participants ? `/${m.participants}개사` : ''} · 내 {fmtRate(m.rate)} · 1순위 {fmtRate(m.first_rate)} · {fmtDate(new Date(m.opened_at))}</p>
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
  const [f, setF] = useState<'all' | 'won' | 'pending' | 'lost' | 'below' | 'unknown'>('all');
  const [n, setN] = useState(10);
  useEffect(() => { fetchMyBidList().then(setItems).catch(() => setItems(null)); }, []);
  if (items === undefined) return <LoadingBox className="h-40" />;
  if (!items) return null; // 011 실행 전
  const by = (o: BidOutcome) => items.filter((i) => bidOutcome(i) === o);
  const pick = { all: items, won: by('won'), pending: by('pending'), lost: by('lost'), below: by('below'), unknown: by('unknown') };
  const rows = pick[f];
  const tag = (i: MyBidItem) => {
    const o = bidOutcome(i);
    const c = o === 'won' ? 'bg-brand text-white' : o === 'below' ? 'bg-bad/10 text-bad' : o === 'pending' ? 'bg-brand-soft text-brand' : 'bg-fill text-sub';
    // 결정 전은 두 줄: '1위' + '결정 전'
    return o === 'pending' && i.rank ? { t: `${i.rank}위`, s: i.rank === 1 ? '심사 중' : '결정 전', c } : { t: outcomeLabel(i, o), s: null, c };
  };
  return (
    <Card title="투찰한 공고" aside={<span className="flex items-center gap-1.5 text-[13px] text-mute"><span className="rounded bg-fill px-1.5 py-0.5 text-[11px]">1곳 참가 포함</span>{items.length}건</span>}>
      <div className="no-scrollbar -mt-1 mb-2 flex gap-1.5 overflow-x-auto">
        {([['all', '전체'], ['won', '낙찰'], ['pending', '결정 전'], ['lost', '탈락'], ['below', '하한 미달'], ['unknown', '결과 없음']] as const).filter(([k]) => (k !== 'pending' && k !== 'unknown') || pick[k].length > 0).map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setF(k); setN(10); }} aria-pressed={f === k}
            className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-medium ${f === k ? 'border-ink bg-ink text-white' : 'border-line bg-white text-sub'}`}>
            {label} {pick[k].length}
          </button>
        ))}
      </div>
      {rows.length ? (
        <>
        {/* A8: 오른쪽 숫자가 무엇인지 */}
        <p className="flex justify-end pr-7 text-[11px] text-mute">투찰률</p>
        <ul className="divide-y divide-line">
          {rows.slice(0, n).map((i) => {
            const t = tag(i);
            return (
              <li key={i.id}>
                <Link href={`/analysis/${i.id}`} className="flex items-center gap-3 py-3 hover:bg-fill/60">
                  <span className={`w-[68px] shrink-0 py-1 text-center text-[12px] font-semibold leading-tight ${t.s ? 'rounded-xl' : 'rounded-full'} ${t.c}`}>{t.t}{t.s && <span className="block text-[11px] font-medium">{t.s}</span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 block text-[15px] font-medium">{i.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-mute">{i.org ?? ''} · {fmtDate(new Date(i.opened_at))}{i.participants ? ` · ${i.participants}곳 참가` : ''}{!i.won && i.winner ? ` · 낙찰 ${i.winner}` : ''}</span>
                  </span>
                  <span className="shrink-0 text-right text-[13px] tabular-nums text-sub">{i.rate ? fmtRate(i.rate) : ''}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
                </Link>
              </li>
            );
          })}
        </ul>
        </>
      ) : <p className="py-6 text-center text-[14px] text-mute">해당 공고 없음</p>}
      {rows.length > n && <button type="button" onClick={() => setN(n + 20)} className="w-full py-2 text-[14px] font-medium text-sub">{Math.min(20, rows.length - n)}건 더 보기</button>}
    </Card>
  );
}
