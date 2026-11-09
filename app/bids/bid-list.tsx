'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Search, SlidersHorizontal } from 'lucide-react';
import { Sheet, useToast } from '@/components/feedback';
import { MuteSheet } from '@/components/mute';
import { NoticeRow, RowList } from '@/components/notice-row';
import { BTN_PRIMARY, CTA_PRIMARY, CTA_SOFT, NoticesState, ResultIcon, STATUS_STYLE, chipClass } from '@/components/ui';
import type { Notice } from '@/lib/data';
import { fmtDateTime, fmtWon } from '@/lib/format';
import { STATUS_LABEL, type Status } from '@/lib/judge';
import { fetchNoticesByIds } from '@/lib/notices';
import { useJudged, useStore, type Judged } from '@/lib/store';

/*
 * 공고 (v3.1) — 공고는 이 화면 한 곳에서만
 *  탭: 맞춤 공고 / 전체 / 저장
 *  목록은 한 줄씩, 데스크탑은 오른쪽에 미리보기
 */

type Tab = 'match' | 'all' | 'saved';
type SortKey = 'relevance' | 'deadline' | 'latest' | 'price';

const SORT_LABEL: Record<SortKey, string> = { relevance: '맞춤순', deadline: '마감임박순', latest: '최신순', price: '금액순' };
const SORTERS: Record<SortKey, (a: Judged, b: Judged) => number> = {
  relevance: (a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || b.relevance - a.relevance,
  deadline: (a, b) => a.notice.d - b.notice.d,
  latest: (a, b) => b.notice.postedAt.getTime() - a.notice.postedAt.getTime(),
  price: (a, b) => b.notice.estPrice - a.notice.estPrice,
};

type Pred = (n: Notice, status: Status) => boolean;
interface Group { key: string; label: string; options: [string, Pred][] }
const sidoOf = (r: string) => r.split(' ')[0];

function buildGroups(notices: Notice[]): Group[] {
  const sidos = [...new Set(notices.flatMap((n) => (n.regionLimit ?? []).map(sidoOf)))].sort();
  const contracts = [...new Set(notices.map((n) => n.contract))].sort();
  return [
    { key: 'status', label: '판정 결과', options: (['eligible', 'check', 'ineligible'] as Status[]).map((s) => [STATUS_LABEL[s], (_, st) => st === s]) },
    { key: 'type', label: '사업유형', options: (['공사', '물품', '용역'] as const).map((t) => [t, (n) => n.type === t]) },
    { key: 'region', label: '지역', options: [
      ['제한 없음', (n) => !n.regionLimit],
      ...sidos.map((r): [string, Pred] => [r, (n) => !!n.regionLimit?.some((x) => sidoOf(x) === r)]),
    ] },
    { key: 'price', label: '추정가격', options: [
      ['1억 미만', (n) => n.estPrice < 1e8],
      ['1억~5억', (n) => n.estPrice >= 1e8 && n.estPrice < 5e8],
      ['5억 이상', (n) => n.estPrice >= 5e8],
    ] },
    { key: 'deadline', label: '마감일', options: [
      ['3일 이내', (n) => n.d <= 3],
      ['7일 이내', (n) => n.d <= 7],
      ['8일 이상', (n) => n.d > 7],
    ] },
    { key: 'contract', label: '계약방식', options: contracts.map((c): [string, Pred] => [c, (n) => n.contract === c]) },
  ];
}

type Filters = Record<string, string | null>;
const EMPTY: Filters = { status: null, type: null, region: null, price: null, deadline: null, contract: null };
const PAGE = 30;

export default function BidList() {
  const params = useSearchParams();
  const router = useRouter();
  const judged = useJudged();
  const { notices, noticesError, profile, saved } = useStore();
  const tab: Tab = params.get('tab') === 'all' ? 'all' : params.get('tab') === 'saved' ? 'saved' : 'match';
  const setTab = (t: Tab) => router.replace(t === 'match' ? '/bids' : `/bids?tab=${t}`, { scroll: false });

  const GROUPS = useMemo(() => buildGroups(notices ?? []), [notices]);
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, deadline: params.get('status') === 'imminent' ? '3일 이내' : null }));
  const [draft, setDraft] = useState<Filters>(filters);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>(() => {
    const s = params.get('sort');
    return s && s in SORTERS ? (s as SortKey) : 'relevance';
  });
  const [selected, setSelected] = useState<Notice | null>(null);
  const [mute, setMute] = useState<Notice | null>(null);

  // 검색·필터 (맞춤·전체 공통)
  const query = q.trim().toLowerCase();
  const pass = (j: Judged) =>
    GROUPS.every((g) => {
      const v = filters[g.key];
      const opt = v ? g.options.find(([label]) => label === v) : null;
      return !opt || opt[1](j.notice, j.judgment.status);
    }) && (!query || j.notice.title.toLowerCase().includes(query) || j.notice.org.toLowerCase().includes(query) || !!j.notice.demandOrg?.toLowerCase().includes(query));

  const all = useMemo(() => (judged ?? []).filter(pass).sort(SORTERS[sort]), [judged, filters, q, sort, GROUPS]); // eslint-disable-line react-hooks/exhaustive-deps
  const matched = all.filter((j) => j.judgment.status === 'eligible' && j.rel !== 'none');
  const checkRows = all.filter((j) => j.judgment.status === 'check');
  const otherRows = all.filter((j) => j.judgment.status === 'eligible' && j.rel === 'none');

  // 저장 공고 — 마감된 공고도 보이도록 id로 불러옴
  const [savedNotices, setSavedNotices] = useState<Notice[] | null>(null);
  useEffect(() => {
    if (tab !== 'saved') return;
    if (!saved.length) return setSavedNotices([]);
    fetchNoticesByIds(saved).then((l) => setSavedNotices(l.sort((a, b) => (a.d < 0 ? 999 : a.d) - (b.d < 0 ? 999 : b.d)))).catch(() => setSavedNotices([]));
  }, [tab, saved]);

  const activeFilters = GROUPS.filter((g) => filters[g.key]);
  const byId = useMemo(() => new Map((judged ?? []).map((j) => [j.notice.id, j])), [judged]);
  const sel = selected ? byId.get(selected.id) ?? { notice: selected } : null;

  const chips = (value: Filters, set: (f: Filters) => void, g: Group) =>
    ['전체', ...g.options.map(([l]) => l)].map((label) => {
      const on = (value[g.key] ?? '전체') === label;
      return (
        <button key={label} type="button" aria-pressed={on} onClick={() => set({ ...value, [g.key]: label === '전체' ? null : label })}
          className={`rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition ${chipClass(on)}`}>{label}</button>
      );
    });

  const counts = { match: matched.length, all: all.length, saved: saved.length };

  return (
    <>
      <div className="px-5 pt-3 lg:px-0 lg:pt-6">
        <h1 className="text-[24px] font-bold tracking-tight lg:text-[28px]">공고</h1>
      </div>

      {/* 탭 + 검색 */}
      <div className="sticky top-14 z-20 bg-canvas/95 px-5 pb-2 pt-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
        <div className="flex border-b border-line" role="tablist">
          {([['match', '맞춤 공고'], ['all', '전체'], ['saved', '저장']] as const).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setSelected(null); }}
              className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-[16px] font-semibold transition ${tab === t ? 'border-ink text-ink' : 'border-transparent text-mute'}`}>
              {label} <span className="text-[14px] font-medium">{judged || t === 'saved' ? counts[t].toLocaleString() : ''}</span>
            </button>
          ))}
        </div>
        {tab !== 'saved' && (
          <div className="mt-3 flex gap-2">
            <label className="relative block flex-1">
              <span className="sr-only">공고 검색</span>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mute" />
              <input type="search" placeholder="공고명, 기관명 검색" value={q} onChange={(e) => setQ(e.target.value)}
                className="h-11 w-full rounded-btn bg-white pl-12 pr-4 text-[15px] placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </label>
            <button type="button" onClick={() => { setDraft(filters); setSheet(true); }}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-btn bg-white px-4 text-[15px] font-semibold ${activeFilters.length ? 'text-brand' : 'text-sub'}`}>
              <SlidersHorizontal className="h-4 w-4" />필터{activeFilters.length > 0 && ` ${activeFilters.length}`}
            </button>
            <label className="relative hidden items-center lg:flex">
              <span className="sr-only">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-11 appearance-none rounded-btn bg-white pl-4 pr-9 text-[15px] font-semibold text-sub focus:outline-none">
                {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-mute" />
            </label>
          </div>
        )}
        {activeFilters.length > 0 && tab !== 'saved' && (
          <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto">
            {activeFilters.map((g) => (
              <button key={g.key} type="button" onClick={() => setFilters({ ...filters, [g.key]: null })}
                className="shrink-0 rounded-full border border-line bg-white px-3 py-1 text-[13px] text-sub">{filters[g.key]} ×</button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-28 pt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5 lg:px-0 lg:pb-0">
        <main className="min-w-0">
          {tab === 'match' && !profile.products?.length && (
            <Link href="/mypage?edit=company" className="mb-3 flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
              <span className="flex-1 text-sub"><b className="font-semibold text-ink">주요 품목</b>을 넣으면 우리 회사 일과 맞는 공고만 골라 드려요</span>
              <ChevronRight className="h-5 w-5 text-mute" />
            </Link>
          )}

          {tab !== 'saved' ? (
            <NoticesState notices={notices} error={noticesError}>
              <div className="mb-2 flex items-center justify-between lg:hidden">
                <p className="text-[13px] text-mute">{tab === 'match' ? '맞춤 점수 높은 순' : `총 ${all.length.toLocaleString()}건`}</p>
                <label className="relative flex items-center">
                  <span className="sr-only">정렬</span>
                  <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="appearance-none bg-transparent py-1 pl-2 pr-6 text-[13px] font-medium text-sub focus:outline-none">
                    {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-mute" />
                </label>
              </div>
              {tab === 'match' ? (
                <>
                  <Paged rows={matched} lead="score" selected={selected} onSelect={setSelected} empty="조건에 맞는 맞춤 공고가 없어요" />
                  <Folded title="확인이 필요한 공고" hint="정보가 부족해 판정하지 못한 공고예요" rows={checkRows} lead="status" selected={selected} onSelect={setSelected} />
                  <Folded title="다른 참여 가능 공고" hint="참여는 가능하지만 우리 회사 일과는 거리가 있어 보여요" rows={otherRows} lead="score" selected={selected} onSelect={setSelected} />
                </>
              ) : (
                <Paged rows={all} lead="status" selected={selected} onSelect={setSelected} empty="조건에 맞는 공고가 없어요" />
              )}
            </NoticesState>
          ) : !savedNotices ? <div className="h-40 animate-pulse rounded-box bg-white" /> : savedNotices.length ? (
            <RowList>{savedNotices.map((n) => <NoticeRow key={n.id} item={byId.get(n.id) ?? { notice: n }} lead="none" active={selected?.id === n.id} onSelect={desktopSelect(setSelected)} />)}</RowList>
          ) : (
            <p className="rounded-box bg-white px-5 py-14 text-center text-[15px] text-mute">저장한 공고가 없어요. 공고 상세에서 저장할 수 있어요.</p>
          )}
        </main>

        {/* 데스크탑 미리보기 */}
        <aside className="sticky top-6 hidden lg:block">
          {sel ? <Preview item={sel} onMute={setMute} /> : (
            <div className="rounded-box bg-white px-6 py-16 text-center text-[15px] text-mute">공고를 고르면 여기에서 미리 볼 수 있어요</div>
          )}
        </aside>
      </div>

      <MuteSheet notice={mute} onClose={() => setMute(null)} />
      <Sheet title="필터" open={sheet} onClose={() => setSheet(false)}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(EMPTY)} className={`${CTA_SOFT} w-1/3`}>초기화</button>
            <button type="button" onClick={() => { setFilters(draft); setSheet(false); }} className={BTN_PRIMARY}>적용하기</button>
          </div>
        }>
        <div className="space-y-6">
          {GROUPS.filter((g) => tab !== 'match' || g.key !== 'status').map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2.5 text-[15px] font-semibold">{g.label}</legend>
              <div className="flex flex-wrap gap-2">{chips(draft, setDraft, g)}</div>
            </fieldset>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/** 데스크탑(1024px 이상)에서만 미리보기 선택, 모바일은 상세로 이동 */
function desktopSelect(set: (n: Notice) => void) {
  if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return set;
  return undefined;
}

function useIsDesktop() {
  const [d, setD] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1024px)');
    const on = () => setD(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

/** 길게 이어지는 목록 — 끝에 닿으면 더 붙임 */
function Paged({ rows, lead, selected, onSelect, empty }: {
  rows: Judged[]; lead: 'score' | 'status'; selected: Notice | null; onSelect: (n: Notice) => void; empty: string;
}) {
  const desk = useIsDesktop();
  const [shown, setShown] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => setShown(PAGE), [rows.length]);
  useEffect(() => {
    const el = end.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((s) => s + PAGE), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, shown]);
  if (!rows.length) return <p className="rounded-box bg-white px-5 py-14 text-center text-[15px] text-mute">{empty}</p>;
  return (
    <>
      <RowList>
        {rows.slice(0, shown).map((j) => (
          <NoticeRow key={j.notice.id} item={j} lead={lead} active={selected?.id === j.notice.id} onSelect={desk ? onSelect : undefined} />
        ))}
      </RowList>
      {shown < rows.length && <div ref={end} className="py-4 text-center text-[13px] text-mute">불러오는 중…</div>}
    </>
  );
}

/** 접힌 묶음 — '확인 필요', '다른 참여 가능' */
function Folded({ title, hint, rows, lead, selected, onSelect }: {
  title: string; hint: string; rows: Judged[]; lead: 'score' | 'status'; selected: Notice | null; onSelect: (n: Notice) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <section className="mt-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-box bg-white px-5 py-4 text-left">
        <span>
          <span className="block text-[15px] font-semibold">{title} {rows.length.toLocaleString()}건</span>
          <span className="mt-0.5 block text-[13px] text-mute">{hint}</span>
        </span>
        <ChevronDown className={`h-5 w-5 text-mute transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2"><Paged rows={rows} lead={lead} selected={selected} onSelect={onSelect} empty="" /></div>}
    </section>
  );
}

/** 데스크탑 오른쪽 미리보기 */
function Preview({ item, onMute }: { item: Judged | { notice: Notice; judgment?: undefined; fit?: undefined }; onMute: (n: Notice) => void }) {
  const { account, saved, toggleSaved } = useStore();
  const toast = useToast();
  const n = item.notice;
  const on = saved.includes(n.id);
  return (
    <section className="rounded-box bg-white p-6">
      <p className="text-[13px] text-mute">{n.type} · {n.demandOrg && n.demandOrg !== n.org ? n.demandOrg : n.org}</p>
      <h2 className="mt-1 text-[18px] font-bold leading-snug">{n.title}</h2>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">추정가격</dt><dd className="mt-0.5 text-[16px] font-bold">{n.estPrice ? fmtWon(n.estPrice) : '미공개'}</dd></div>
        <div className="rounded-2xl bg-fill px-4 py-3"><dt className="text-[12px] text-mute">마감</dt><dd className={`mt-0.5 text-[16px] font-bold ${n.d >= 0 && n.d <= 3 ? 'text-bad' : ''}`}>{fmtDateTime(n.closesAt).slice(5)}</dd></div>
      </dl>
      {item.judgment && (
        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className={`flex items-center gap-1.5 text-[15px] font-semibold ${STATUS_STYLE[item.judgment.status].text}`}>
              <span className={`h-2 w-2 rounded-full ${STATUS_STYLE[item.judgment.status].dot}`} />{STATUS_LABEL[item.judgment.status]}
            </p>
            {item.fit && <p className="text-[15px] font-bold text-brand">맞춤 {item.fit.score}%</p>}
          </div>
          {account ? (
            <ul className="mt-3 space-y-2 text-[14px]">
              {item.judgment.reasons.map((r) => <li key={r.rule} className="flex gap-2"><ResultIcon result={r.result} /><span className="text-sub">{r.text}</span></li>)}
              {item.fit?.factors.slice(0, 3).map((f) => <li key={f.key} className="flex gap-2 text-sub"><span className="w-4 text-center text-mute">·</span>{f.text}</li>)}
            </ul>
          ) : <p className="mt-2 text-[14px] text-mute">가입하면 판정 근거와 맞춤 이유를 볼 수 있어요</p>}
        </div>
      )}
      <div className="mt-6 space-y-2">
        <Link href={`/bids/${n.id}`} className={CTA_PRIMARY}>자세히 보기</Link>
        <div className="flex gap-2">
          {account && (
            <button type="button" onClick={() => toast(toggleSaved(n.id) ? '저장했어요' : '저장을 취소했어요')} className={`${CTA_SOFT} h-12 flex-1 text-[15px]`}>
              {on ? '저장됨' : '저장하기'}
            </button>
          )}
          {item.judgment?.status === 'eligible' && (
            <button type="button" onClick={() => onMute(n)} className={`${CTA_SOFT} h-12 flex-1 text-[15px]`}>관심 없음</button>
          )}
        </div>
      </div>
    </section>
  );
}
