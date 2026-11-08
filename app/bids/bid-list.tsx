'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Info, Search, SearchX, SlidersHorizontal } from 'lucide-react';
import { Sheet } from '@/components/feedback';
import { BTN_PRIMARY, NoticeCard, NoticesState, chipClass } from '@/components/ui';
import type { Notice } from '@/lib/data';
import { STATUS_LABEL, type Status } from '@/lib/judge';
import { useJudged, useStore, type Judged } from '@/lib/store';

type SortKey = 'relevance' | 'deadline' | 'latest' | 'price';

const SORT_LABEL: Record<SortKey, string> = { relevance: '관련도순', deadline: '마감임박순', latest: '최신순', price: '금액순' };

const SORTERS: Record<SortKey, (a: Judged, b: Judged) => number> = {
  relevance: (a, b) => b.relevance - a.relevance,
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
const PAGE = 6;

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

  return (
    <>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        {/* 커버리지 안내 (F2-6) */}
        <p className="flex items-center gap-1.5 bg-slate-50 px-4 py-2 text-xs text-slate-500">
          <Info className="h-3.5 w-3.5 shrink-0" />
          나라장터 공고 기준(공공조달 금액의 약 61%) · 기관 자체 조달시스템 공고는 포함되지 않습니다
        </p>
        <div className="flex gap-2 px-4 pt-3">
          <label className="relative block flex-1">
            <span className="sr-only">공고 검색</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input id="q" type="search" placeholder="공고명, 기관명 검색" value={q} onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-btn border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-3 text-[15px] placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
          <button type="button" onClick={() => { setDraft(filters); setSheet(true); }}
            className={`relative flex shrink-0 items-center gap-1 rounded-btn border px-3 text-sm font-semibold ${active.length ? 'border-primary text-primary' : 'border-slate-200 text-slate-600'}`}>
            <SlidersHorizontal className="h-4 w-4" />필터
            {active.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] text-white">{active.length}</span>}
          </button>
        </div>
        {/* 판정 결과 빠른 필터 */}
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 py-3">
          {(['eligible', 'check', 'ineligible'] as Status[]).map((s) => {
            const label = STATUS_LABEL[s];
            const on = filters.status === label;
            const count = (judged ?? []).filter((j) => j.judgment.status === s).length;
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggleStatus(label)}
                className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${chipClass(on)}`}>
                {label} {count}
              </button>
            );
          })}
          {active.filter((g) => g.key !== 'status').map((g) => (
            <button key={g.key} type="button" onClick={() => setFilters({ ...filters, [g.key]: null })}
              className="shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[13px] font-semibold text-blue-700">
              {filters[g.key]} ×
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 pb-24 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-slate-500">총 <b className="text-slate-800">{rows.length}</b>건</p>
          <label className="relative flex items-center">
            <span className="sr-only">정렬</span>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
              className="appearance-none rounded-btn border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-sm font-semibold text-slate-700 focus:border-primary focus:outline-none">
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-500" />
          </label>
        </div>

        <NoticesState notices={notices} error={noticesError}>
        {rows.length ? (
          <div className="space-y-3">
            {rows.slice(0, shown).map((j) => <NoticeCard key={j.notice.id} notice={j.notice} judgment={j.judgment} />)}
            {shown < rows.length && <div ref={sentinel} className="py-4 text-center text-xs text-slate-400">불러오는 중…</div>}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
            <SearchX className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-600">조건에 맞는 공고가 없습니다</p>
            <button type="button" onClick={() => { setFilters(EMPTY); setQ(''); }} className="mt-3 text-sm font-bold text-primary hover:underline">
              필터 초기화
            </button>
          </div>
        )}
        </NoticesState>
      </main>

      <Sheet title="필터" open={sheet} onClose={() => setSheet(false)}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(EMPTY)} className="w-1/3 rounded-btn border border-slate-200 py-3.5 text-[15px] font-bold text-slate-600">초기화</button>
            <button type="button" onClick={() => { setFilters(draft); setSheet(false); }} className={BTN_PRIMARY}>적용하기</button>
          </div>
        }>
        <div className="space-y-5">
          {GROUPS.map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-2 text-sm font-semibold text-slate-700">{g.label}</legend>
              <div className="flex flex-wrap gap-2">
                {['전체', ...g.options.map(([l]) => l)].map((label) => {
                  const on = (draft[g.key] ?? '전체') === label;
                  return (
                    <button key={label} type="button" aria-pressed={on}
                      onClick={() => setDraft({ ...draft, [g.key]: label === '전체' ? null : label })}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${chipClass(on)}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </Sheet>
    </>
  );
}
