'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ChevronDown, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import { Header, Shell } from '@/components/layout';
import { DdayBadge, TypeTag, chipClass } from '@/components/ui';
import { BIDS, REASONS, type Reason } from '@/lib/data';
import { fmtRange, fmtShort } from '@/lib/format';
import { useProfile } from '@/lib/store';

const ITEMS = [...BIDS].sort((a, b) => b.match - a.match).slice(0, 5);

/** 원형 프로그레스 */
function Ring({ pct }: { pct: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#FEF3C7" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke="#F59E0B" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-extrabold text-amber-600">
        {pct}<span className="text-[10px]">%</span>
      </span>
    </div>
  );
}

export default function RecommendPage() {
  const router = useRouter();
  const [profile] = useProfile();
  const [active, setActive] = useState<Reason | null>(null);
  const rows = active ? ITEMS.filter((b) => b.reasons.includes(active)) : ITEMS;
  const toggle = (r: Reason) => setActive(active === r ? null : r);

  const criteria = [
    ['업종', profile.industry.slice(0, 2).join(' > ')],
    ['지역', profile.regions.join(', ') || '전체'],
    ['관심 사업유형', profile.types.join(', ')],
    ['추정가격', `${fmtRange(profile.priceMin)} ~ ${fmtRange(profile.priceMax)}`],
  ];

  return (
    <Shell>
      <Header />
      <main className="px-4 pb-24 pt-5">
        <section>
          <h1 className="text-xl font-bold">맞춤 추천 공고</h1>
          <p className="mt-1 text-sm text-slate-500">회원님의 업종·지역·실적 기반 매칭 결과입니다</p>
        </section>

        <details className="group mt-4 rounded-card border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5 text-sm font-bold"><SlidersHorizontal className="h-4 w-4 text-primary" />매칭 기준</span>
            <ChevronDown className="h-5 w-5 text-slate-400 transition group-open:rotate-180" />
          </summary>
          <div className="border-t border-slate-100 px-4 pb-4 pt-3">
            <dl className="grid grid-cols-[104px_1fr] gap-y-2 text-sm">
              {criteria.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <Link href="/mypage?edit=matching" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
              프로필 수정<ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </details>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-slate-500"><b className="text-slate-800">{rows.length}</b>건 · 매칭율 높은 순</p>
          {active && (
            <button type="button" onClick={() => setActive(null)} className="inline-flex items-center gap-1 rounded-full bg-slate-800 py-1 pl-3 pr-2 text-xs font-semibold text-white">
              필터: {active}<X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
          {REASONS.map((r) => (
            <button key={r} type="button" aria-pressed={active === r} onClick={() => toggle(r)}
              className={`shrink-0 rounded-full border px-3 py-1 text-[13px] font-semibold transition ${chipClass(active === r)}`}>
              # {r}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {rows.map((b) => (
            <article key={b.id} tabIndex={0} role="link" aria-label={`${b.title} 상세 보기`}
              onClick={() => router.push(`/bids/${b.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && router.push(`/bids/${b.id}`)}
              className="cursor-pointer rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]">
              <div className="flex gap-3">
                <Ring pct={b.match} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><TypeTag type={b.type} /><DdayBadge d={b.d} /></div>
                  <h3 className="mt-1 truncate text-[15px] font-bold">{b.title}</h3>
                  <p className="truncate text-sm text-slate-500">
                    {b.org} · <span className="font-semibold text-slate-700">{fmtShort(b.price)}원</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                {b.reasons.map((r) => (
                  <button key={r} type="button" onClick={(e) => { e.stopPropagation(); toggle(r); }}
                    className={`rounded-md px-2 py-1 text-xs font-semibold transition ${active === r ? 'bg-primary text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>
    </Shell>
  );
}
