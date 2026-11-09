'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Header, PageTitle, Shell, useRequireStart } from '@/components/layout';
import { CTA_SOFT, NoticeCard, NoticesState, profileSummary } from '@/components/ui';
import { MuteSheet } from '@/components/mute';
import type { Notice } from '@/lib/data';
import { fmtRange } from '@/lib/format';
import { STATUS_LABEL, type Status } from '@/lib/judge';
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
  const [showOther, setShowOther] = useState(false);
  const [mute, setMute] = useState<Notice | null>(null);
  if (!ready) return <Shell wide><Header /></Shell>;

  // '참여 가능' 탭은 맞춤 공고(참여 가능 + 우리 일과 관련)만, 관련 없는 참여 가능 공고는 아래에 접음
  const by = (s: Status) => (judged ?? []).filter((j) => j.judgment.status === s && (s !== 'eligible' || j.rel !== 'none'));
  const other = (judged ?? []).filter((j) => j.judgment.status === 'eligible' && j.rel === 'none');
  const unknown = !profile.products?.length;
  const sorter = (a: Judged, b: Judged) => (sort === 'relevance' ? (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || b.relevance - a.relevance : a.notice.d - b.notice.d);
  const rows = by(tab).sort(sorter);
  const ineligible = by('ineligible').sort(sorter);
  const otherRows = other.sort(sorter);

  return (
    <Shell wide>
      <Header />
      <main className="pb-28 lg:pb-0">
        <PageTitle title="추천 공고" sub={<>{profileSummary(profile)} 기준 <Link href="/mypage?edit=company" className="ml-1 font-semibold text-brand">수정</Link></>} />

        <div className="sticky top-14 z-20 bg-canvas/95 px-5 pt-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex rounded-btn bg-line/60 p-1" role="tablist">
              {(['eligible', 'check'] as Tab[]).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                  className={`rounded-[10px] px-4 py-2 text-[15px] font-semibold transition ${tab === t ? 'bg-white text-ink shadow-sm' : 'text-mute'}`}>
                  {STATUS_LABEL[t]} {by(t).length}
                </button>
              ))}
            </div>
            <label className="relative flex items-center">
              <span className="sr-only">정렬</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                className="appearance-none bg-transparent py-1 pl-2 pr-6 text-[14px] font-medium text-sub focus:outline-none">
                <option value="relevance">맞춤순</option><option value="deadline">마감임박순</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-mute" />
            </label>
          </div>
          {tab === 'check' && rows.length > 0 && (
            <p className="mt-3 text-[14px] text-sub">정보가 부족해 판정하지 못한 공고예요. 공고를 열어 정보를 넣으면 바로 판정돼요.</p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 px-5 lg:grid-cols-2 lg:gap-3 lg:px-0">
          <NoticesState notices={notices} error={noticesError}>
            {rows.map((j) => <RecommendCard key={j.notice.id} item={j} onMute={setMute} />)}
            {!rows.length && <div className="lg:col-span-2"><EmptyState tab={tab} /></div>}
          </NoticesState>
        </div>

        {tab === 'eligible' && unknown && (
          <Link href="/mypage?edit=company" className="mx-5 mt-3 flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70 lg:mx-0">
            <span className="flex-1 text-sub"><b className="font-semibold text-ink">주요 품목</b>을 넣으면 우리 회사 일과 맞는 공고만 골라 드려요</span>
            <ChevronDown className="h-5 w-5 -rotate-90 text-mute" />
          </Link>
        )}

        {/* 참여는 가능하지만 우리 일과 관련 없는 공고 — 기본 접음 */}
        {tab === 'eligible' && otherRows.length > 0 && (
          <div className="mt-6 px-5 lg:px-0">
            <button type="button" aria-expanded={showOther} onClick={() => setShowOther(!showOther)}
              className="flex w-full items-center justify-center gap-1 py-3 text-[14px] font-medium text-mute hover:text-sub">
              다른 참여 가능 공고 {otherRows.length.toLocaleString()}건 {showOther ? '숨기기' : '보기'}
              <ChevronDown className={`h-4 w-4 transition ${showOther ? 'rotate-180' : ''}`} />
            </button>
            {showOther && <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">{otherRows.slice(0, 60).map((j) => <RecommendCard key={j.notice.id} item={j} onMute={setMute} />)}</div>}
          </div>
        )}

        {/* 참여 불가 공고 — 기본 숨김 */}
        <div className="mt-6 px-5 lg:px-0">
          <button type="button" aria-expanded={showIneligible} onClick={() => setShowIneligible(!showIneligible)}
            className="flex w-full items-center justify-center gap-1 py-3 text-[14px] font-medium text-mute hover:text-sub">
            참여할 수 없는 공고 {ineligible.length}건 {showIneligible ? '숨기기' : '보기'}
            <ChevronDown className={`h-4 w-4 transition ${showIneligible ? 'rotate-180' : ''}`} />
          </button>
          {showIneligible && <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">{ineligible.map((j) => <RecommendCard key={j.notice.id} item={j} onMute={setMute} />)}</div>}
        </div>
      </main>
      <MuteSheet notice={mute} onClose={() => setMute(null)} />
    </Shell>
  );
}

function RecommendCard({ item: { notice, judgment, similar, fit, product }, onMute }: { item: Judged; onMute?: (n: Notice) => void }) {
  return (
    <NoticeCard notice={notice} judgment={judgment} fit={fit}
      footer={onMute && judgment.status === 'eligible' ? (
        <button type="button" onClick={() => onMute(notice)} className="py-1 text-[13px] text-mute hover:text-sub">관심 없음</button>
      ) : undefined}
      note={product && product.sim >= 0.5 ? (
        <p className="mt-2 line-clamp-1 text-[13px] text-sub">
          <span className="font-semibold text-brand">품목</span> 주요 품목 &lsquo;{product.mine.name}&rsquo;{product.sim >= 0.8 ? '과 같은 품목이에요' : '과 비슷한 품목이에요'}
        </p>
      ) : similar?.best && (
        <p className="mt-2 line-clamp-1 text-[13px] text-sub">
          <span className="font-semibold text-brand">이력</span> {similar.best.won ? '낙찰했던' : '참여했던'} &lsquo;{similar.best.title}&rsquo;와 비슷해요
        </p>
      )} />
  );
}

/** 빈 상태 — 조건 완화 제안 */
function EmptyState({ tab }: { tab: Tab }) {
  const { profile } = useStore();
  if (tab === 'check') {
    return <p className="rounded-box bg-white px-5 py-12 text-center text-[15px] text-mute">확인이 필요한 공고가 없어요</p>;
  }
  return (
    <div className="rounded-box bg-white px-5 py-12 text-center">
      <p className="text-[17px] font-semibold">지금 조건으로 참여할 수 있는 공고가 없어요</p>
      <p className="mt-1 text-[15px] text-mute">조건을 넓혀 보세요</p>
      <div className="mx-auto mt-6 flex max-w-[360px] flex-col gap-2">
        <Link href="/mypage?edit=company" className={CTA_SOFT}>업종 다시 선택하기</Link>
        <Link href="/mypage?edit=prefs" className={CTA_SOFT}>
          {profile.priceRange ? `금액 범위 조정 (${fmtRange(profile.priceRange[0])}~${fmtRange(profile.priceRange[1])})` : '선호 조건 조정'}
        </Link>
      </div>
    </div>
  );
}
