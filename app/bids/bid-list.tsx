'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ChevronDown, Search, SearchX } from 'lucide-react';
import { BidCard, chipClass } from '@/components/ui';
import { BIDS, type Bid } from '@/lib/data';

type SortKey = 'match' | 'deadline' | 'latest' | 'price';

const GROUPS = [
  { key: 'type', label: '사업유형', options: ['전체', '물품', '용역', '공사'] },
  { key: 'region', label: '지역', options: ['전체', '서울', '경기', '인천', '대전', '세종', '전남'] },
  { key: 'status', label: '마감상태', options: ['전체', '진행중', '마감임박'] },
] as const;

type FilterKey = (typeof GROUPS)[number]['key'];

const SORTERS: Record<SortKey, (a: Bid, b: Bid) => number> = {
  match: (a, b) => b.match - a.match,
  deadline: (a, b) => a.d - b.d,
  latest: (a, b) => a.posted - b.posted || b.id - a.id,
  price: (a, b) => b.price - a.price,
};

const INITIAL = { type: '전체', region: '전체', status: '전체' };

export default function BidList() {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    ...INITIAL,
    status: params.get('status') === 'imminent' ? '마감임박' : '전체',
  });
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>(() => {
    const s = params.get('sort');
    return s && s in SORTERS ? (s as SortKey) : 'match';
  });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return BIDS.filter((b) =>
      (filters.type === '전체' || b.type === filters.type) &&
      (filters.region === '전체' || b.region === filters.region) &&
      // 진행중 = D-4 이상, 마감임박 = D-3 이내
      (filters.status === '전체' || (filters.status === '마감임박' ? b.d <= 3 : b.d > 3)) &&
      (!query || b.title.toLowerCase().includes(query) || b.org.toLowerCase().includes(query)),
    ).sort(SORTERS[sort]);
  }, [filters, q, sort]);

  return (
    <>
      <div className="sticky top-14 z-20 border-b border-slate-200 bg-white">
        <div className="px-4 pt-3">
          <label className="relative block">
            <span className="sr-only">공고 검색</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input id="q" type="search" placeholder="공고명, 기관명 검색" value={q} onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-btn border border-slate-200 bg-slate-50 py-2.5 pl-11 pr-3 text-[15px] placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </label>
        </div>
        <div className="space-y-2 py-3">
          {GROUPS.map((g) => (
            <div key={g.key} role="group" aria-label={g.label} className="no-scrollbar flex items-center gap-1.5 overflow-x-auto px-4">
              <span className="w-14 shrink-0 text-xs font-semibold text-slate-400">{g.label}</span>
              {g.options.map((o) => {
                const on = filters[g.key] === o;
                return (
                  <button key={o} type="button" aria-pressed={on} onClick={() => setFilters({ ...filters, [g.key]: o })}
                    className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${chipClass(on)}`}>
                    {o}
                  </button>
                );
              })}
            </div>
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
              <option value="match">매칭율순</option>
              <option value="deadline">마감임박순</option>
              <option value="latest">최신순</option>
              <option value="price">금액순</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-500" />
          </label>
        </div>

        {rows.length ? (
          <div className="space-y-3">{rows.map((b) => <BidCard key={b.id} bid={b} />)}</div>
        ) : (
          <div className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
            <SearchX className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-semibold text-slate-600">조건에 맞는 공고가 없습니다</p>
            <button type="button" onClick={() => { setFilters(INITIAL); setQ(''); }} className="mt-3 text-sm font-bold text-primary hover:underline">
              필터 초기화
            </button>
          </div>
        )}
      </main>
    </>
  );
}
