'use client';

import Link from 'next/link';
import { AlarmClock, Building2, Calculator, ChevronRight, CircleCheck, FilePlus2, FileText, Lightbulb, Sparkles } from 'lucide-react';
import { Header, Shell, useRequireStart } from '@/components/layout';
import { DdayBadge, NewBadge, NoticesState, StatusBadge, TypeTag, profileSummary } from '@/components/ui';
import { fmtDate, fmtShort, weekdayKo, withEulReul } from '@/lib/format';
import { NEED_LABEL, topNeed } from '@/lib/needs';
import { useJudged, useStore } from '@/lib/store';

/** S2. 대시보드 */
export default function HomePage() {
  const ready = useRequireStart();
  const { profile, saved, notices, noticesError } = useStore();
  const judged = useJudged();
  if (!ready) return <Shell><Header /></Shell>;

  const now = new Date();
  const eligible = (judged ?? []).filter((j) => j.judgment.status === 'eligible').sort((a, b) => b.relevance - a.relevance);
  const newCount = (judged ?? []).filter((j) => j.notice.isNew).length;
  const savedSoon = (notices ?? []).filter((n) => saved.includes(n.id) && n.d >= 0 && n.d <= 3).length;
  const need = topNeed(judged);

  return (
    <Shell>
      <Header />
      <main className="pb-24">
        <section className="px-4 pb-4 pt-5">
          <p className="text-sm text-slate-500">{fmtDate(now)} ({weekdayKo(now)})</p>
          <h1 className="mt-1 text-xl font-bold leading-snug">
            <span className="text-primary">{profileSummary(profile)}</span> 기준
            <br />
            오늘의 입찰 현황입니다
          </h1>
        </section>

        <section aria-label="요약" className="grid grid-cols-3 gap-2.5 px-4">
          <Link href="/bids?sort=latest" className="rounded-card border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><FilePlus2 className="h-3.5 w-3.5 text-primary" />오늘 신규</div>
            <p className="mt-1.5 text-2xl font-extrabold">{judged ? newCount : '–'}<span className="ml-0.5 text-xs font-semibold text-slate-500">건</span></p>
          </Link>
          <Link href="/recommend" className="rounded-card border border-green-200 bg-green-50 p-3 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-green-700"><CircleCheck className="h-3.5 w-3.5" />참여 가능</div>
            <p className="mt-1.5 text-2xl font-extrabold text-green-700">{judged ? eligible.length : '–'}<span className="ml-0.5 text-xs font-semibold">건</span></p>
          </Link>
          <Link href="/mypage#saved" className="rounded-card border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><AlarmClock className="h-3.5 w-3.5 text-red-500" />저장·마감임박</div>
            <p className={`mt-1.5 text-2xl font-extrabold ${savedSoon ? 'text-red-500' : ''}`}>{savedSoon}<span className="ml-0.5 text-xs font-semibold text-slate-500">건</span></p>
          </Link>
        </section>

        {need && (
          <Link href="/mypage?edit=company"
            className="mx-4 mt-4 flex items-center gap-3 rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
            <Lightbulb className="h-5 w-5 shrink-0 text-amber-500" />
            <span className="flex-1"><b>{withEulReul(NEED_LABEL[need.need])}</b> 입력하면 확인 필요 공고 <b>{need.count}건</b>이 판정됩니다</span>
            <ChevronRight className="h-4 w-4 shrink-0" />
          </Link>
        )}

        <section className="mt-6 px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">참여 가능 공고</h2>
            <Link href="/recommend" className="flex items-center text-sm font-medium text-slate-500 hover:text-primary">
              전체보기<ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <NoticesState notices={notices} error={noticesError}>
            <div className="space-y-2.5">
              {eligible.slice(0, 5).map(({ notice: n }) => (
                <Link key={n.id} href={`/bids/${n.id}`}
                  className="block rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status="eligible" />
                    <TypeTag type={n.type} />
                    {n.isNew && <NewBadge />}
                  </div>
                  <h3 className="mt-1.5 line-clamp-2 text-[15px] font-bold">{n.title}</h3>
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                    <span className="min-w-0 truncate">{n.org}</span>
                    <span className="h-3 w-px shrink-0 bg-slate-200" />
                    <span className="shrink-0 font-semibold text-slate-700">{n.estPrice ? `${fmtShort(n.estPrice)}원` : '금액 미공개'}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
                      {fmtDate(n.closesAt).slice(5)} <DdayBadge d={n.d} />
                    </span>
                  </div>
                </Link>
              ))}
              {judged && !eligible.length && (
                <p className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                  지금은 참여 가능 공고가 없습니다. <Link href="/recommend" className="font-bold text-primary">확인 필요 공고</Link>를 살펴보세요.
                </p>
              )}
            </div>
          </NoticesState>
        </section>

        <section className="mt-8 px-4">
          <h2 className="mb-3 text-base font-bold">빠른 접근</h2>
          <div className="grid grid-cols-4 gap-2">
            {[
              { href: '/bids', label: '공고 리스트', Icon: FileText, cls: 'bg-blue-50 text-primary' },
              { href: '/recommend', label: '추천 공고', Icon: Sparkles, cls: 'bg-amber-50 text-amber-600' },
              { href: '/calculator', label: '적격심사', Icon: Calculator, cls: 'bg-purple-50 text-purple-600' },
              { href: '/mypage', label: '마이페이지', Icon: Building2, cls: 'bg-slate-100 text-slate-600' },
            ].map(({ href, label, Icon, cls }) => (
              <Link key={href} href={href} className="flex flex-col items-center gap-2 rounded-card border border-slate-200 bg-white px-1 py-3 shadow-sm hover:shadow-md">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${cls}`}><Icon className="h-5 w-5" /></span>
                <span className="text-xs font-semibold">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </Shell>
  );
}
