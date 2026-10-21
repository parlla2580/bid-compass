import Link from 'next/link';
import { AlarmClock, Calculator, ChevronRight, ClipboardCheck, FilePlus2, Target } from 'lucide-react';
import { Header, Shell } from '@/components/layout';
import { DdayBadge, TypeTag } from '@/components/ui';
import { BIDS, TODAY } from '@/lib/data';
import { fmtDate, fmtShort } from '@/lib/format';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function HomePage() {
  const top5 = [...BIDS].sort((a, b) => b.match - a.match).slice(0, 5);

  return (
    <Shell>
      <Header />
      <main className="pb-24">
        <section className="px-4 pb-4 pt-5">
          <p className="text-sm text-slate-500">{fmtDate(TODAY)} ({DAYS[TODAY.getDay()]})</p>
          <h1 className="mt-1 text-xl font-bold leading-snug">
            <span className="text-primary">(주)테스트전자</span>님,
            <br />
            오늘의 입찰 현황입니다
          </h1>
        </section>

        {/* 요약 카드 (가로 스크롤) — 2단계에서 실제 집계로 교체 */}
        <section aria-label="요약" className="no-scrollbar flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          <Link href="/bids?sort=latest" className="w-[150px] shrink-0 snap-start rounded-card border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><FilePlus2 className="h-4 w-4 text-primary" />오늘 신규 공고</div>
            <p className="mt-2 text-2xl font-extrabold">47<span className="ml-0.5 text-sm font-semibold text-slate-500">건</span></p>
            <p className="mt-1 text-xs font-semibold text-green-600">전일 대비 +12</p>
          </Link>
          <Link href="/bids?status=imminent" className="w-[150px] shrink-0 snap-start rounded-card border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><AlarmClock className="h-4 w-4 text-red-500" />마감 임박</div>
            <p className="mt-2 text-2xl font-extrabold text-red-500">15<span className="ml-0.5 text-sm font-semibold text-slate-500">건</span></p>
            <p className="mt-1 text-xs text-slate-500">3일 이내 마감</p>
          </Link>
          <Link href="/recommend" className="w-[150px] shrink-0 snap-start rounded-card border border-amber-200 bg-amber-50 p-4 shadow-sm hover:shadow-md">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700"><Target className="h-4 w-4" />내 매칭 공고</div>
            <p className="mt-2 text-2xl font-extrabold text-amber-600">8<span className="ml-0.5 text-sm font-semibold text-amber-700/70">건</span></p>
            <p className="mt-1 text-xs text-amber-700">매칭율 70%↑</p>
          </Link>
        </section>

        <section className="mt-6 px-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">📌 맞춤 추천 공고 TOP 5</h2>
            <Link href="/recommend" className="flex items-center text-sm font-medium text-slate-500 hover:text-primary">
              전체보기<ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {top5.map((b) => (
              <Link key={b.id} href={`/bids/${b.id}`}
                className="flex gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]">
                <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <span className="text-lg font-extrabold leading-none">{b.match}<span className="text-xs">%</span></span>
                  <span className="mt-0.5 text-[10px] font-semibold">매칭</span>
                </div>
                <div className="min-w-0 flex-1">
                  <TypeTag type={b.type} />
                  <h3 className="mt-1 truncate text-[15px] font-bold">{b.title}</h3>
                  <p className="truncate text-sm text-slate-500">{b.org}</p>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-700">{fmtShort(b.price)}원</span>
                    <span className="h-3 w-px bg-slate-200" />
                    <DdayBadge d={b.d} />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 px-4">
          <h2 className="mb-3 text-base font-bold">빠른 도구</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link href="/calculator?tab=price" className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-primary"><Calculator className="h-5 w-5" /></span>
              <span className="text-sm font-bold">입찰금액 계산기</span>
            </Link>
            <Link href="/calculator?tab=score" className="flex flex-col gap-3 rounded-card border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600"><ClipboardCheck className="h-5 w-5" /></span>
              <span className="text-sm font-bold">적격심사 점수 계산기</span>
            </Link>
          </div>
        </section>
      </main>
    </Shell>
  );
}
