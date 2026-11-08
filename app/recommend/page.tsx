'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Info, SearchX } from 'lucide-react';
import { Header, Shell, useRequireStart } from '@/components/layout';
import { DdayBadge, NewBadge, NoticesState, ResultIcon, STATUS_STYLE, StatusBadge, TypeTag, chipClass, profileSummary } from '@/components/ui';
import { fmtRange, fmtShort } from '@/lib/format';
import { STATUS_LABEL, summarize, type Status } from '@/lib/judge';
import { useJudged, useStore, type Judged } from '@/lib/store';

type Tab = 'eligible' | 'check';
type SortKey = 'relevance' | 'deadline';

/** S5. 추천 공고 (F3-3) — 판정 통과 공고를 관련도 순으로 */
export default function RecommendPage() {
  const ready = useRequireStart();
  const { profile, notices, noticesError } = useStore();
  const judged = useJudged();
  const [tab, setTab] = useState<Tab>('eligible');
  const [sort, setSort] = useState<SortKey>('relevance');
  const [showIneligible, setShowIneligible] = useState(false);
  if (!ready) return <Shell><Header /></Shell>;

  const by = (s: Status) => (judged ?? []).filter((j) => j.judgment.status === s);
  const sorter = (a: Judged, b: Judged) => (sort === 'relevance' ? b.relevance - a.relevance : a.notice.d - b.notice.d);
  const rows = by(tab).sort(sorter);
  const ineligible = by('ineligible').sort(sorter);

  return (
    <Shell>
      <Header />
      <main className="pb-24">
        <section className="px-4 pt-5">
          <h1 className="text-xl font-bold">추천 공고</h1>
          <p className="mt-1 text-sm text-slate-500">
            <b className="text-slate-700">{profileSummary(profile)}</b> 기준으로 판정했어요
            <Link href="/mypage?edit=company" className="ml-1.5 font-semibold text-primary hover:underline">수정</Link>
          </p>
        </section>

        <div className="sticky top-14 z-20 mt-4 border-b border-slate-200 bg-slate-50">
          <div className="grid grid-cols-2 px-4" role="tablist">
            {(['eligible', 'check'] as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`border-b-2 py-3 text-sm font-bold transition ${tab === t ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>
                {STATUS_LABEL[t]} <span className="ml-0.5">{by(t).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <div className="flex gap-1.5">
            {([['relevance', '관련도순'], ['deadline', '마감임박순']] as const).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sort === k} onClick={() => setSort(k)}
                className={`rounded-full border px-3 py-1 text-[13px] font-semibold ${chipClass(sort === k)}`}>{label}</button>
            ))}
          </div>
        </div>

        {tab === 'check' && rows.length > 0 && (
          <p className="mx-4 mt-2 flex gap-1.5 rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            정보가 부족하거나 공고 조건을 읽지 못한 공고입니다. 공고를 열어 빠진 정보를 넣으면 바로 판정됩니다.
          </p>
        )}

        <div className="mt-3 space-y-3 px-4">
          <NoticesState notices={notices} error={noticesError}>
            {rows.map((j) => <RecommendCard key={j.notice.id} item={j} />)}
            {!rows.length && <EmptyState tab={tab} />}
          </NoticesState>
        </div>

        {/* 참여 불가 공고 — 기본 숨김 */}
        <div className="mt-6 px-4">
          <button type="button" aria-expanded={showIneligible} onClick={() => setShowIneligible(!showIneligible)}
            className="flex w-full items-center justify-center gap-1 rounded-btn border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            참여 불가 공고 {ineligible.length}건 {showIneligible ? '숨기기' : '보기'}
            <ChevronDown className={`h-4 w-4 transition ${showIneligible ? 'rotate-180' : ''}`} />
          </button>
          {showIneligible && <div className="mt-3 space-y-3">{ineligible.map((j) => <RecommendCard key={j.notice.id} item={j} />)}</div>}
        </div>
      </main>
    </Shell>
  );
}

function RecommendCard({ item: { notice: n, judgment, similar } }: { item: Judged }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-card border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/bids/${n.id}`} className="block p-4 pb-3">
        <div className="flex items-center gap-1.5">
          <StatusBadge status={judgment.status} />
          <TypeTag type={n.type} />
          {n.isNew && <NewBadge />}
          <span className="ml-auto"><DdayBadge d={n.d} /></span>
        </div>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-bold">{n.title}</h3>
        <p className="truncate text-sm text-slate-500">
          {n.org} · <span className="font-semibold text-slate-700">{n.estPrice ? `${fmtShort(n.estPrice)}원` : '금액 미공개'}</span>
        </p>
        <p className={`mt-1.5 line-clamp-2 text-xs ${STATUS_STYLE[judgment.status].text}`}>{summarize(judgment)}</p>
        {similar?.best && (
          <p className="mt-1 line-clamp-1 text-xs text-purple-700">
            이력: {similar.best.won ? '낙찰했던' : '참여했던'} &lsquo;{similar.best.title}&rsquo;와 비슷
          </p>
        )}
      </Link>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
        판정 사유 {open ? '접기' : '전체 보기'}<ChevronDown className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="space-y-2 border-t border-slate-100 px-4 py-3 text-xs">
          {judgment.reasons.map((r) => (
            <li key={r.rule} className="flex items-start gap-1.5"><ResultIcon result={r.result} /><span className="text-slate-700">{r.text}</span></li>
          ))}
        </ul>
      )}
    </article>
  );
}

/** 빈 상태 — 조건 완화 제안 */
function EmptyState({ tab }: { tab: Tab }) {
  const { profile } = useStore();
  if (tab === 'check') {
    return <p className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">확인이 필요한 공고가 없습니다.</p>;
  }
  return (
    <div className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <SearchX className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-semibold text-slate-700">지금 조건으로 참여 가능한 공고가 없습니다</p>
      <p className="mt-1 text-xs text-slate-500">조건을 넓혀 보세요</p>
      <div className="mt-4 flex flex-col gap-2 text-sm">
        <Link href="/mypage?edit=company" className="rounded-btn border border-slate-200 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
          업종 다시 선택하기
        </Link>
        <Link href="/mypage?edit=prefs" className="rounded-btn border border-slate-200 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">
          {profile.priceRange ? `금액 범위 조정 (현재 ${fmtRange(profile.priceRange[0])}~${fmtRange(profile.priceRange[1])})` : '선호 조건 조정'}
        </Link>
      </div>
    </div>
  );
}
