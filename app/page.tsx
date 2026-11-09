'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Header, Shell, useRequireStart } from '@/components/layout';
import { NoticeCard, NoticesState, profileSummary } from '@/components/ui';
import { fmtDate, weekdayKo, withEulReul } from '@/lib/format';
import { NEED_LABEL, topNeed } from '@/lib/needs';
import { useJudged, useStore } from '@/lib/store';

/** S2. 홈 */
export default function HomePage() {
  const ready = useRequireStart();
  const { profile, saved, notices, noticesError } = useStore();
  const judged = useJudged();
  if (!ready) return <Shell wide><Header /></Shell>;

  const now = new Date();
  const eligible = (judged ?? []).filter((j) => j.matched || (j.judgment.status === 'eligible' && j.rel === 'unknown')).sort((a, b) => (b.fit?.score ?? -1) - (a.fit?.score ?? -1) || b.relevance - a.relevance);
  const newCount = (judged ?? []).filter((j) => j.notice.isNew).length;
  const savedSoon = (notices ?? []).filter((n) => saved.includes(n.id) && n.d >= 0 && n.d <= 3).length;
  const need = topNeed(judged);

  const stats = [
    { href: '/recommend', label: '맞춤 공고', value: judged ? eligible.length : null, tone: 'text-brand' },
    { href: '/bids?sort=latest', label: '오늘 새 공고', value: judged ? newCount : null, tone: 'text-ink' },
    { href: '/mypage#saved', label: '저장·마감 임박', value: savedSoon, tone: savedSoon ? 'text-bad' : 'text-ink' },
  ];

  return (
    <Shell wide>
      <Header />
      <main className="px-5 pb-28 lg:px-0 lg:pb-0">
        <section className="pt-3 lg:pt-6">
          <p className="text-[14px] text-mute">{fmtDate(now)} ({weekdayKo(now)})</p>
          <h1 className="mt-1 text-[24px] font-bold leading-snug tracking-tight lg:text-[28px]">
            {judged ? <>공고 {judged.length.toLocaleString()}건 중<br className="lg:hidden" /> 우리 회사 맞춤 공고는 <span className="text-brand">{eligible.length}건</span>이에요</> : '맞춤 공고를 고르는 중이에요'}
          </h1>
          <Link href="/mypage?edit=company" className="mt-1.5 inline-flex items-center text-[15px] text-sub">
            {profileSummary(profile)} 기준<ChevronRight className="h-4 w-4 text-mute" />
          </Link>
        </section>

        <section aria-label="요약" className="mt-5 grid grid-cols-3 gap-2 lg:gap-3">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="rounded-box bg-white px-4 py-4 transition hover:bg-white/70 lg:px-6 lg:py-5">
              <p className="text-[13px] text-mute lg:text-[14px]">{s.label}</p>
              <p className={`mt-1 text-[22px] font-bold lg:text-[28px] ${s.tone}`}>{s.value ?? '–'}<span className="ml-0.5 text-[14px] font-medium text-mute">건</span></p>
            </Link>
          ))}
        </section>

        {need && (
          <Link href="/mypage?edit=company" className="mt-3 flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
            <span className="flex-1 text-sub"><b className="font-semibold text-ink">{withEulReul(NEED_LABEL[need.need])}</b> 입력하면 공고 <b className="font-semibold text-ink">{need.count}건</b>을 더 판정할 수 있어요</span>
            <ChevronRight className="h-5 w-5 shrink-0 text-mute" />
          </Link>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[20px] font-bold">추천 공고</h2>
            <Link href="/recommend" className="flex items-center text-[14px] text-mute hover:text-sub">전체 보기<ChevronRight className="h-4 w-4" /></Link>
          </div>
          <NoticesState notices={notices} error={noticesError}>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
              {eligible.slice(0, 6).map(({ notice, judgment, fit }) => <NoticeCard key={notice.id} notice={notice} judgment={judgment} fit={fit} />)}
            </div>
            {judged && !eligible.length && (
              <p className="rounded-box bg-white px-5 py-10 text-center text-[15px] text-mute">
                지금은 참여 가능한 공고가 없어요. <Link href="/recommend" className="font-semibold text-brand">확인이 필요한 공고</Link>를 살펴보세요.
              </p>
            )}
          </NoticesState>
        </section>

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
              <span className="mt-0.5 block text-[14px] text-mute">하한율로 투찰 가능 구간을 계산해요</span>
            </span>
            <ChevronRight className="h-5 w-5 text-mute" />
          </Link>
        </section>
      </main>
    </Shell>
  );
}
