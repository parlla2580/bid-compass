'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Header, Shell, useRequireStart } from '@/components/layout';
import { NoticeRow, RowList } from '@/components/notice-row';
import { UrgentStrip } from '@/components/urgent-strip';
import { profileSummary } from '@/components/ui';
import { fmtDate, weekdayKo, withEulReul } from '@/lib/format';
import { NEED_LABEL, topNeed } from '@/lib/needs';
import { useJudged, useStore } from '@/lib/store';

/** S2. 홈 — 오늘의 요약만. 공고 목록은 '공고' 탭 한 곳에서 */
export default function HomePage() {
  const ready = useRequireStart();
  const { profile, saved, notices } = useStore();
  const judged = useJudged();
  if (!ready) return <Shell wide><Header /></Shell>;

  const now = new Date();
  const matched = (judged ?? []).filter((j) => j.matched);
  const newMatched = matched.filter((j) => j.notice.isNew).length;
  const soon = (judged ?? []).filter((j) => saved.includes(j.notice.id) && j.notice.d >= 0 && j.notice.d <= 3).sort((a, b) => a.notice.d - b.notice.d);
  const need = topNeed(judged);

  const stats = [
    { href: '/bids', label: '맞춤 공고', value: judged ? matched.length : null, tone: 'text-brand' },
    { href: '/bids?sort=latest', label: '오늘 새로 나온', value: judged ? newMatched : null, tone: 'text-ink' },
    { href: '/bids?tab=saved', label: '저장·마감 임박', value: judged ? soon.length : null, tone: soon.length ? 'text-bad' : 'text-ink' },
  ];

  return (
    <Shell wide>
      <Header />
      <main className="px-5 pb-28 lg:px-0 lg:pb-0">
        <section className="pt-3 lg:pt-6">
          <p className="text-[14px] text-mute">{fmtDate(now)} ({weekdayKo(now)})</p>
          <h1 className="mt-1 text-[24px] font-bold leading-snug tracking-tight lg:text-[28px]">
            {judged ? <>공고 {judged.length.toLocaleString()}건 중<br className="lg:hidden" /> 우리 회사 맞춤 공고는 <span className="text-brand">{matched.length}건</span>이에요</> : '맞춤 공고를 고르는 중이에요'}
          </h1>
          <Link href="/mypage?edit=company" className="mt-1.5 inline-flex items-center text-[15px] text-sub">
            {profileSummary(profile)} 기준<ChevronRight className="h-4 w-4 text-mute" />
          </Link>
        </section>

        {/* 기한 2일 이하 '해야 할 일'만 한 줄 — 전체는 알림함(🔔) (기획 16장 A1) */}
        <UrgentStrip />

        <section aria-label="요약" className="mt-5 grid grid-cols-3 gap-2 lg:gap-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-box bg-white px-4 py-4 transition hover:bg-white/70 lg:px-6 lg:py-5">
              <p className="text-[13px] text-mute lg:text-[14px]">{s.label}</p>
              <p className={`mt-1 text-[22px] font-bold lg:text-[28px] ${s.tone}`}>{s.value ?? '–'}<span className="ml-0.5 text-[14px] font-medium text-mute">건</span></p>
            </Link>
          ))}
        </section>

        {/* 오늘 가장 잘 맞는 공고 3건 — 전체 목록은 공고 탭에서 */}
        {matched.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[18px] font-bold">오늘 가장 잘 맞는 공고</h2>
            <RowList>
              {[...matched].sort((x, y) => (y.fit?.score ?? -1) - (x.fit?.score ?? -1) || y.relevance - x.relevance).slice(0, 3)
                .map((j) => <NoticeRow key={j.notice.id} item={j} lead="score" />)}
              <Link href="/bids" className="flex items-center justify-center gap-1 py-3.5 text-[15px] font-semibold text-brand hover:bg-fill/70">
                맞춤 공고 {matched.length.toLocaleString()}건 모두 보기<ChevronRight className="h-4 w-4" />
              </Link>
            </RowList>
          </section>
        )}

        {need && (
          <Link href="/mypage?edit=company" className="mt-3 flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
            <span className="flex-1 text-sub"><b className="font-semibold text-ink">{withEulReul(NEED_LABEL[need.need])}</b> 입력하면 공고 <b className="font-semibold text-ink">{need.count}건</b>을 더 판정할 수 있어요</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-mute" />
          </Link>
        )}

        {soon.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[18px] font-bold">곧 마감되는 저장 공고</h2>
            <RowList>{soon.slice(0, 3).map((j) => <NoticeRow key={j.notice.id} item={j} lead="none" />)}</RowList>
          </section>
        )}

        <section className="mt-8 grid gap-2 lg:grid-cols-2 lg:gap-3">
          <Link href="/analysis" className="flex items-center gap-4 rounded-box bg-white px-5 py-5 hover:bg-white/70">
            <span className="flex-1">
              <span className="block text-[16px] font-semibold">우리 회사 입찰 성적표</span>
              <span className="mt-0.5 block text-[14px] text-mute">지난 3년 투찰·낙찰 결과를 분석해요</span>
            </span>
            <ChevronRight className="h-5 w-5 text-mute" />
          </Link>
          <Link href="/calculator" className="flex items-center gap-4 rounded-box bg-white px-5 py-5 hover:bg-white/70">
            <span className="flex-1">
              <span className="block text-[16px] font-semibold">투찰금액 계산기</span>
              <span className="mt-0.5 block text-[14px] text-mute">사정률 분포로 투찰금액을 정해요</span>
            </span>
            <ChevronRight className="h-5 w-5 text-mute" />
          </Link>
        </section>
        {!notices && <div className="mt-6 h-20 animate-pulse rounded-box bg-white" />}
      </main>
    </Shell>
  );
}
