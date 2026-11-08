'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';
import { Sheet } from '@/components/feedback';
import { BTN_PRIMARY, CTA_SOFT, NoticeCard, NoticesState, chipClass } from '@/components/ui';
import type { Notice } from '@/lib/data';
import { STATUS_LABEL, type Status } from '@/lib/judge';
import { useJudged, useStore, type Judged } from '@/lib/store';

type SortKey = 'relevance' | 'deadline' | 'latest' | 'price';

const SORT_LABEL: Record<SortKey, string> = { relevance: '맞춤순', deadline: '마감임박순', latest: '최신순', price: '금액순' };

const SORTERS: Record<SortKey, (a: Judged, b: Judged) => number> = {
  relevance: (a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || b.relevance - a.relevance,
  deadline: (a, b) => a.notice.d - b.notice.d,
  latest: (a, b) => b.notice.postedAt.getTime() - a.notice.postedAt.getTime(),
  price: (a, b) => b.notice.estPrice - a.notice.estPrice,
};

/* 필터 그룹 — 각 값은 공고에 대한 조건 함수. 지역·계약방식 선택지는 실제 공고에서 만듦 */
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
const PAGE = 12;

/** S3. 공고 리스트 */
export default function BidList() {
  const params = useSearchParams();
  const judged = useJudged();
  const { notices, noticesError } = useStore();
  const GROUPS = useMemo(() => buildGroups(notices ?? []), [notices]);
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, deadline: params.get('status') === 'imminent' ? '3일 이내' : null }));
  const [draft, setDraft] = useState<Filters>(filters);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>(() => {
    const s = params.get('sort');
    return s && s in SORTERS ? (s as SortKey) : 'relevance';
  });
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return (judged ?? [])
      .filter(({ notice: n, judgment }) =>
        GROUPS.every((g) => {
          const v = filters[g.key];
          const opt = v ? g.options.find(([label]) => label === v) : null;
          return !opt || opt[1](n, judgment.status);
        }) && (!query || n.title.toLowerCase().includes(query) || n.org.toLowerCase().includes(query) || !!n.demandOrg?.toLowerCase().includes(query)))
      .sort(SORTERS[sort]);
  }, [judged, filters, q, sort, GROUPS]);

  // 조건이 바뀌면 처음부터 다시 보여줌
  useEffect(() => setShown(PAGE), [filters, q, sort]);

  // 무한 스크롤 — 마지막 카드가 보이면 다음 묶음을 붙임
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((s) => s + PAGE), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length, shown]);

  const active = GROUPS.filter((g) => filters[g.key]);
  const toggleStatus = (label: string) => setFilters({ ...filters, status: filters.status === label ? null : label });

  const chips = (value: Filters, set: (f: Filters) => void, g: Group) =>
    ['전체', ...g.options.map(([l]) => l)].map((label) => {
      const on = (value[g.key] ?? '전체') === label;
      return (
        <button key={label} type="button" aria-pressed={on} onClick={() => set({ ...value, [g.key]: label === '전체' ? null : label })}
          className={`rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition ${chipClass(on)}`}>
          {label}
        </button>
      );
    });

  return (
    <>
      <div className="px-5 pt-3 lg:px-0 lg:pt-6">
        <h1 className="text-[24px] font-bold tracking-tight lg:text-[28px]">공고</h1>
        <p className="mt-1 text-[14px] text-mute">나라장터 공고 기준 · 기관 자체 조달시스템 공고는 빠져 있어요</p>
      </div>

      <div className="lg:mt-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* 데스크탑: 왼쪽 필터 (바로 적용) */}
        <aside className="sticky top-6 hidden space-y-6 rounded-box bg-white p-6 lg:block">
          {GROUPS.map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2.5 text-[14px] font-semibold">{g.label}</legend>
              <div className="flex flex-wrap gap-1.5">{chips(filters, setFilters, g)}</div>
            </fieldset>
          ))}
          {active.length > 0 && (
            <button type="button" onClick={() => setFilters(EMPTY)} className="text-[14px] font-medium text-mute hover:text-sub">필터 모두 지우기</button>
          )}
        </aside>

        <div>
          <div className="sticky top-14 z-20 bg-canvas/95 px-5 pb-2 pt-3 backdrop-blur lg:static lg:bg-transparent lg:px-0 lg:pt-0">
            <div className="flex gap-2">
              <label className="relative block flex-1">
                <span className="sr-only">공고 검색</span>
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mute" />
                <input id="q" type="search" placeholder="공고명, 기관명 검색" value={q} onChange={(e) => setQ(e.target.value)}
                  className="h-12 w-full rounded-btn bg-white pl-12 pr-4 text-[16px] placeholder:text-mute focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </label>
              <button type="button" onClick={() => { setDraft(filters); setSheet(true); }}
                className={`flex h-12 shrink-0 items-center gap-1.5 rounded-btn bg-white px-4 text-[15px] font-semibold lg:hidden ${active.length ? 'text-brand' : 'text-sub'}`}>
                <SlidersHorizontal className="h-4 w-4" />필터{active.length > 0 && ` ${active.length}`}
              </button>
            </div>
            {/* 판정 결과 빠른 필터 — 모바일 */}
            <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto lg:hidden">
              {(['eligible', 'check', 'ineligible'] as Status[]).map((st) => {
                const label = STATUS_LABEL[st];
                const on = filters.status === label;
                const count = (judged ?? []).filter((j) => j.judgment.status === st).length;
                return (
                  <button key={st} type="button" aria-pressed={on} onClick={() => toggleStatus(label)}
                    className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[14px] font-medium transition ${chipClass(on)}`}>
                    {label} {count}
                  </button>
                );
              })}
              {active.filter((g) => g.key !== 'status').map((g) => (
                <button key={g.key} type="button" onClick={() => setFilters({ ...filters, [g.key]: null })}
                  className="shrink-0 rounded-full border border-line bg-white px-3.5 py-1.5 text-[14px] font-medium text-sub">
                  {filters[g.key]} ×
                </button>
              ))}
            </div>
          </div>

          <main className="px-5 pb-28 pt-2 lg:px-0 lg:pb-0 lg:pt-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[14px] text-mute">총 <b className="font-semibold text-ink">{rows.length.toLocaleString()}</b>건</p>
              <label className="relative flex items-center">
                <span className="sr-only">정렬</span>
                <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                  className="appearance-none bg-transparent py-1 pl-2 pr-6 text-[14px] font-medium text-sub focus:outline-none">
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-mute" />
              </label>
            </div>

            <NoticesState notices={notices} error={noticesError}>
              {rows.length ? (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
                  {rows.slice(0, shown).map((j) => <NoticeCard key={j.notice.id} notice={j.notice} judgment={j.judgment} fit={j.fit} />)}
                  {shown < rows.length && <div ref={sentinel} className="py-4 text-center text-[13px] text-mute lg:col-span-2">불러오는 중…</div>}
                </div>
              ) : (
                <div className="rounded-box bg-white px-5 py-14 text-center">
                  <p className="text-[16px] font-semibold">조건에 맞는 공고가 없어요</p>
                  <button type="button" onClick={() => { setFilters(EMPTY); setQ(''); }} className="mt-3 text-[15px] font-semibold text-brand">필터 초기화</button>
                </div>
              )}
            </NoticesState>
          </main>
        </div>
      </div>

      <Sheet title="필터" open={sheet} onClose={() => setSheet(false)}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(EMPTY)} className={`${CTA_SOFT} w-1/3`}>초기화</button>
            <button type="button" onClick={() => { setFilters(draft); setSheet(false); }} className={BTN_PRIMARY}>적용하기</button>
          </div>
        }>
        <div className="space-y-6">
          {GROUPS.map((g) => (
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
