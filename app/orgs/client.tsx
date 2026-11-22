'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, ChevronRight, Lock, Search } from 'lucide-react';
import { BackHeader, Card, Header, PageTitle } from '@/components/layout';
import { Tip } from '@/components/tip';
import { BTN_PRIMARY } from '@/components/ui';
import { SalesSection } from './sales';
import { fetchMyReport, fetchOrgProfile, orgPeaks, recentOrgs, rememberOrg, type OrgProfile } from '@/lib/analysis';
import { useInbox } from '@/lib/inbox';
import { daysTo } from '@/lib/sales';
import { useStore } from '@/lib/store';
import { GENERIC_ORG, orgOf } from '@/lib/data';

/*
 * 발주기관 카드 (로드맵 4, 034) — 이 기관은 언제·어떻게 사나
 *  발주 시기(월별 공고 수) · 보통 참가 업체 수 · 사정률 · 낙찰률 · 낙찰 많이 한 업체(가입 후) · 지금 열린 공고
 *  기간은 실제 수집 기간을 그대로 표시 (12개월이 안 될 수 있음)
 *  035 보정: 참가 1곳 이하(단가계약) 개찰은 통계 제외 · 표본 10건 미만 숫자는 '표본 부족'으로
 *  2026-11-22 하단 '기관' 탭: 찾기(기관 검색) · 영업(수의계약 기관, 분석 탭에서 이동) · 저장(저장한 기관)
 *   진입로: 공고 상세 요약 카드 · 분석 기관 줄 · 영업 기관 카드
 */

const MIN = 10;
const ym = (d: string | null) => (d ? `${d.slice(2, 4)}.${d.slice(5, 7)}` : '');

type OrgTab = 'find' | 'sales' | 'saved';
const TABS: [OrgTab, string][] = [['find', '찾기'], ['sales', '영업'], ['saved', '저장']];

export default function OrgPage() {
  const q = useSearchParams();
  const router = useRouter();
  const org = q.get('name') ?? '';
  const t = q.get('tab');
  const tab: OrgTab = t === 'sales' || t === 'saved' ? t : 'find';
  if (org) return (
    <>
      <BackHeader title="발주기관" fallback="/orgs" />
      <OrgView org={org} />
    </>
  );
  const pick = (x: OrgTab) => router.replace(x === 'find' ? '/orgs' : `/orgs?tab=${x}`, { scroll: false });
  return (
    <>
      <Header />
      <PageTitle title="발주기관" />
      <div className="sticky top-14 z-20 bg-canvas/95 px-5 py-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
        <div className="flex rounded-btn bg-line/60 p-1 lg:inline-flex" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => pick(k)}
              className={`flex-1 whitespace-nowrap rounded-[10px] px-5 py-2 text-[15px] font-semibold transition ${tab === k ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>{label}</button>
          ))}
        </div>
      </div>
      {tab === 'find' ? <OrgHome /> : tab === 'saved' ? <SavedTab /> : <SalesTab focus={q.get('org')} />}
    </>
  );
}

/* ---------- 영업 (수의계약 기관) — 회원만 ---------- */
function SalesTab({ focus }: { focus: string | null }) {
  const { account, loaded } = useStore();
  if (!loaded) return <main className="px-5 pt-1 lg:px-0"><div className="h-40 animate-pulse rounded-box bg-white" /></main>;
  if (!account) return (
    <main className="px-5 pb-28 pt-1 lg:px-0 lg:pb-0">
      <div className="rounded-box bg-white px-6 py-10 text-center">
        <p className="text-[17px] font-bold">가입하면 수의계약 기관을 찾아드려요</p>
        <p className="mx-auto mt-2 max-w-[420px] text-[14px] text-sub">우리 품목을 수의계약으로 산 기관 · 계약 끝 D-N</p>
        <div className="mx-auto mt-5 max-w-[320px]"><Link href="/mypage?signup=1" className={BTN_PRIMARY}>가입하기</Link></div>
        <Link href="/login" className="mt-2 block py-2 text-center text-[15px] font-semibold text-sub">로그인</Link>
      </div>
    </main>
  );
  return <main className="px-5 pb-28 lg:px-0 lg:pb-0"><SalesSection focus={focus} /></main>;
}

/* ---------- 저장한 기관 ---------- */
function SavedTab() {
  const { notices } = useStore();
  const { savedOrgs, unsaveOrg } = useInbox();
  const open = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notices ?? []) { if (n.d < 0) continue; for (const o of new Set([orgOf(n), n.org])) m.set(o, (m.get(o) ?? 0) + 1); }
    return m;
  }, [notices]);
  if (!savedOrgs.length) return (
    <main className="px-5 pb-28 pt-1 lg:px-0 lg:pb-0">
      <div className="rounded-box bg-white px-6 py-10 text-center">
        <p className="text-[17px] font-bold">저장한 기관 없음</p>
        <p className="mx-auto mt-2 max-w-[420px] text-[14px] text-sub">기관 화면·영업에서 저장하면 계약 끝과 새 공고를 알림함으로 알려드려요</p>
      </div>
    </main>
  );
  return (
    <main className="space-y-3 px-5 pb-28 pt-1 lg:px-0 lg:pb-0">
      <Card title={`저장한 기관 ${savedOrgs.length}곳`} aside={<Tip title="저장한 기관">계약이 끝나기 60일 전과 새 공고가 나올 때 알림함으로 알림. 계약 끝은 영업에서 저장한 기관만(수의계약 기록 기준).</Tip>}>
        <ul className="-my-1 divide-y divide-line">
          {savedOrgs.map((s) => {
            const next = s.watch.map((w) => w.end).filter((e) => daysTo(e) >= 0).sort()[0];
            const n = open.get(s.org) ?? 0;
            return (
              <li key={s.org} className="flex items-center gap-2 py-3">
                <Link href={href(s.org)} className="min-w-0 flex-1 hover:opacity-80">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[15px] font-semibold">{s.org}</span>
                    {s.kind && <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-mute">{s.kind}</span>}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[12px] font-semibold tabular-nums ${n ? 'bg-brand-soft text-brand' : 'bg-fill text-mute'}`}>지금 공고 {n}</span>
                    {next && <span className="rounded bg-warn/10 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-warn">계약 끝 D-{daysTo(next)}</span>}
                  </span>
                </Link>
                <button type="button" onClick={() => unsaveOrg(s.org)} aria-label="저장 해제" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand">
                  <Bookmark className="h-5 w-5 fill-current" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </main>
  );
}

/* ---------- 기관 찾기 첫 화면 ---------- */
const href = (o: string) => `/orgs?name=${encodeURIComponent(o)}`;
function OrgHome() {
  const router = useRouter();
  const { account, notices } = useStore();
  const { savedOrgs } = useInbox();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [mine, setMine] = useState<{ org: string; total: number }[]>([]);
  useEffect(() => { setRecent(recentOrgs()); }, []);
  useEffect(() => {
    if (!account) return;
    fetchMyReport().then((r) => setMine([...(r.top_orgs ?? [])].sort((a, b) => b.total - a.total).slice(0, 8))).catch(() => setMine([]));
  }, [account]);
  // 지금 열린 공고의 기관(수요기관 우선)별 공고 수
  const open = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notices ?? []) {
      if (n.d < 0) continue;
      const o = orgOf(n);
      if (GENERIC_ORG.test(o)) continue;
      m.set(o, (m.get(o) ?? 0) + 1);
    }
    return m;
  }, [notices]);
  const busy = useMemo(() => [...open.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10), [open]);
  const saved = savedOrgs.map((s) => s.org);
  const term = q.trim();
  const hits = useMemo(() => {
    if (!term) return [];
    const all = new Set([...open.keys(), ...saved, ...recent, ...mine.map((m) => m.org)]);
    return [...all].filter((o) => o.includes(term)).sort((a, b) => (open.get(b) ?? 0) - (open.get(a) ?? 0) || a.length - b.length).slice(0, 10);
  }, [term, open, saved, recent, mine]);
  const go = (o: string) => router.push(href(o));

  const chips = (list: string[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((o) => <Link key={o} href={href(o)} className="max-w-full truncate rounded-full bg-fill px-3.5 py-2 text-[14px] font-medium text-ink hover:bg-line/60">{o}</Link>)}
    </div>
  );
  const rows = (list: [string, string][]) => (
    <ul className="-my-1 divide-y divide-line">
      {list.map(([o, v]) => (
        <li key={o}>
          <Link href={href(o)} className="flex items-center gap-3 py-3 text-[15px] hover:opacity-80">
            <span className="min-w-0 flex-1 truncate">{o}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-mute">{v}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="space-y-3 px-5 pb-28 pt-1 lg:space-y-4 lg:px-0 lg:pb-0">
      <form onSubmit={(e) => { e.preventDefault(); if (term) go(hits[0] ?? term); }} className="flex h-12 items-center gap-2 rounded-box bg-white px-4">
        <Search className="h-5 w-5 shrink-0 text-mute" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="기관 이름 검색 (예: 조달청, 서울특별시)" enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-mute" />
        <Tip title="기관 검색">공고에 적힌 기관 이름(수요기관 우선)으로 찾음. 목록에 없으면 정확한 이름을 넣고 검색. 발주 시기·참가 업체 수·사정률·낙찰률을 보여 줌.</Tip>
      </form>

      {term ? (
        <Card>
          {hits.length ? rows(hits.map((o) => [o, open.get(o) ? `공고 ${open.get(o)}` : ''])) : (
            <button type="button" onClick={() => go(term)} className="flex w-full items-center justify-between py-2 text-[15px]">
              <span><b className="font-semibold">{term}</b> <span className="text-mute">이름 그대로 검색</span></span><ChevronRight className="h-4 w-4 text-mute" />
            </button>
          )}
        </Card>
      ) : (
        <>
          {recent.length > 0 && <Card title="최근 본 기관">{chips(recent)}</Card>}
          {mine.length > 0 && <Card title="자주 들어간 기관" aside={<span className="text-[13px] text-mute">우리 투찰 기록</span>}>{rows(mine.map((m) => [m.org, `투찰 ${m.total}`]))}</Card>}
          {busy.length > 0 && <Card title="공고 많은 기관" aside={<span className="text-[13px] text-mute">지금 열린 공고</span>}>{rows(busy.map(([o, n]) => [o, `공고 ${n}`]))}</Card>}
          {!busy.length && !recent.length && <div className="h-48 animate-pulse rounded-box bg-white" />}
        </>
      )}
    </main>
  );
}

/* ---------- 기관 한 곳 ---------- */
function OrgView({ org }: { org: string }) {
  const { account, notices } = useStore();
  const { isSavedOrg, saveOrg, unsaveOrg } = useInbox();
  const saved = isSavedOrg(org);
  const [p, setP] = useState<OrgProfile | null | undefined>(undefined);
  useEffect(() => {
    setP(undefined);
    fetchOrgProfile(org).then((r) => { setP(r); if (r && (r.openings || r.notices)) rememberOrg(org); }).catch(() => setP(null));
  }, [org]);
  const open = useMemo(() => (notices ?? []).filter((n) => n.d >= 0 && ((n.demandOrg ?? n.org) === org || n.org === org)).length, [notices, org]);

  if (p === undefined) return <main className="space-y-3 px-5 pt-4 lg:px-0">{[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-box bg-white" />)}</main>;
  if (!p || (!p.openings && !p.notices)) return <main className="px-5 pt-16 text-center text-[15px] text-mute">이 기관의 수집된 공고·개찰 없음</main>;

  const types = Object.entries(p.by_type).sort((a, b) => b[1].n - a[1].n);
  const maxM = Math.max(1, ...p.months.map((m) => m.n));
  const peaks = orgPeaks(p.months);

  return (
    <main className="space-y-3 px-5 pb-28 pt-1 lg:space-y-4 lg:px-0 lg:pb-0">
      <section>
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-[22px] font-bold leading-snug tracking-tight lg:text-[26px]">{org}</h1>
          {account ? (
            <button type="button" onClick={() => (saved ? unsaveOrg(org) : saveOrg({ org, kind: null, watch: [] }))} aria-pressed={saved}
              className={`mt-0.5 inline-flex h-9 shrink-0 items-center gap-1 rounded-btn px-3 text-[14px] font-semibold ${saved ? 'bg-brand-soft text-brand' : 'bg-ink text-white'}`}>
              <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />{saved ? '저장됨' : '저장'}
            </button>
          ) : (
            // 저장·알림은 회원만 (공고 저장과 같은 기준)
            <Link href="/mypage?signup=1" className="mt-0.5 inline-flex h-9 shrink-0 items-center gap-1 rounded-btn bg-ink px-3 text-[14px] font-semibold text-white"><Bookmark className="h-4 w-4" />저장</Link>
          )}
        </div>
        <p className="mt-1 text-[14px] tabular-nums text-mute">{ym(p.d_from)}~{ym(p.d_to)} · 공고 {p.notices.toLocaleString()}건 · 개찰 {p.openings.toLocaleString()}건</p>
        {!!p.single && (
          <p className="mt-0.5 flex items-center gap-1 text-[13px] tabular-nums text-mute">단가계약 등 1곳 참가 {p.single.toLocaleString()}건 통계 제외
            <Tip title="통계에서 뺀 개찰">제3자단가·우수조달·혁신제품 시범구매처럼 참가 업체가 1곳인 개찰은 낙찰률이 100% 가까이 나와 경쟁 입찰 통계를 왜곡해 제외. 월별 공고 수와 전체 개찰 수에는 포함.</Tip>
          </p>
        )}
        {open > 0 && (
          <Link href={`/bids?tab=all&org=${encodeURIComponent(org)}`} className="mt-3 flex items-center justify-between rounded-box bg-brand px-5 py-3.5 text-white">
            <span className="text-[15px] font-semibold">지금 열린 공고 {open}건</span><ChevronRight className="h-5 w-5" />
          </Link>
        )}
      </section>

      {/* 발주 시기 */}
      {p.months.length > 0 && (
        <Card title={<span className="flex items-center gap-1">발주 시기<Tip title="월별 공고 수">이 기관(수요기관 기준) 공고를 공고번호로 센 월별 건수. 수집 기간 안에서만 — 해마다 같은지는 기간이 쌓여야 판단 가능.</Tip></span>}
          aside={peaks.length ? <span className="text-[13px] font-semibold text-brand">많은 달 {peaks.join('·')}</span> : null}>
          <div className="flex h-28 items-end gap-1.5">
            {p.months.map((m) => (
              <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-mute">{m.n}</span>
                <div className={`w-full rounded-t ${peaks.includes(`${Number(m.ym.slice(5))}월`) ? 'bg-brand' : 'bg-[#C9D7F9]'}`} style={{ height: `${(m.n / maxM) * 72}px` }} />
                <span className="text-[11px] tabular-nums text-mute">{Number(m.ym.slice(5))}월</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {/* 경쟁 */}
        {types.length > 0 && (
          <Card title="보통 참가 업체">
            <div className="grid grid-cols-3 gap-2">
              {types.map(([t, v]) => (
                <div key={t} className="rounded-2xl bg-fill px-3 py-3">
                  <p className="text-[12px] text-mute">{t} · {v.n}건</p>
                  {v.n >= MIN && v.participants != null
                    ? <p className="mt-0.5 text-[20px] font-bold tabular-nums">{Math.round(v.participants).toLocaleString()}곳</p>
                    : <p className="mt-1.5 text-[13px] font-semibold text-mute">표본 부족</p>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 사정률 · 낙찰률 */}
        {(p.sajeong || p.win_rate) && (
          <Card title={<span className="flex items-center gap-1">사정률 · 낙찰률<Tip title="이 기관 개찰 기준">사정률 = 예정가격 ÷ 기초금액 (90~110% 안). 낙찰률 = 낙찰금액 ÷ 예정가격. 큰 숫자는 중앙값, 작은 글씨는 가운데 50%. 추첨 결과라 다음 개찰을 예측하지는 않음.</Tip></span>}>
            <div className="grid grid-cols-2 gap-2">
              {p.sajeong && (
                <div className="rounded-2xl bg-fill px-4 py-3">
                  <p className="text-[12px] text-mute">사정률 · {p.sajeong.n}건</p>
                  {p.sajeong.n >= MIN ? (
                    <>
                      <p className="mt-0.5 text-[20px] font-bold tabular-nums">{p.sajeong.p50.toFixed(2)}%</p>
                      <p className="text-[12px] tabular-nums text-mute">{p.sajeong.p25.toFixed(2)}~{p.sajeong.p75.toFixed(2)}%</p>
                    </>
                  ) : <p className="mt-1.5 text-[13px] font-semibold text-mute">표본 부족</p>}
                </div>
              )}
              {p.win_rate && (
                <div className="rounded-2xl bg-fill px-4 py-3">
                  <p className="text-[12px] text-mute">낙찰률 · {p.win_rate.n}건</p>
                  {p.win_rate.n >= MIN ? (
                    <>
                      <p className="mt-0.5 text-[20px] font-bold tabular-nums">{p.win_rate.p50.toFixed(2)}%</p>
                      <p className="text-[12px] tabular-nums text-mute">{p.win_rate.p25.toFixed(2)}~{p.win_rate.p75.toFixed(2)}%</p>
                    </>
                  ) : <p className="mt-1.5 text-[13px] font-semibold text-mute">표본 부족</p>}
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* 낙찰 많이 한 업체 */}
      {p.winners.length > 0 && p.decided >= MIN && (
        <Card title="낙찰 많이 한 업체" aside={<span className="text-[13px] text-mute">낙찰자 정해진 {p.decided.toLocaleString()}건 중</span>}>
          {account ? (
            <ul className="space-y-2.5">
              {p.winners.map((w) => (
                <li key={w.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate font-medium">{w.name}</span>
                    <span className="shrink-0 tabular-nums text-sub"><b className="font-semibold text-ink">{w.wins}</b>건 · {Math.round((w.wins / Math.max(p.decided, 1)) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-fill"><div className="h-2 rounded-full bg-brand" style={{ width: `${(w.wins / p.winners[0].wins) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/mypage?signup=1" className="flex items-center justify-center gap-1.5 rounded-xl bg-fill py-3.5 text-[14px] font-semibold text-brand"><Lock className="h-4 w-4" />가입하면 보기</Link>
          )}
        </Card>
      )}
    </main>
  );
}
