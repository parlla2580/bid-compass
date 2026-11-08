'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Calculator, CircleUserRound, Compass, FileText, House, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/*
 * v3 화면 틀 — 투트랙
 *  - 모바일(1024px 미만): 상단 뒤로가기 바 + 한 칸 세로 배치
 *  - 데스크탑(1024px 이상): 왼쪽 메뉴 + 넓은 본문
 */

const MENU = [
  { href: '/', label: '홈', Icon: House, match: (p: string) => p === '/' },
  { href: '/bids', label: '공고', Icon: FileText, match: (p: string) => p.includes('/bids') },
  { href: '/recommend', label: '추천 공고', Icon: Sparkles, match: (p: string) => p.startsWith('/recommend') },
  { href: '/analysis', label: '입찰 분석', Icon: BarChart3, match: (p: string) => p.startsWith('/analysis') },
  { href: '/calculator', label: '투찰 도구', Icon: Calculator, match: (p: string) => p.startsWith('/calculator') },
];

export function Frame({ title, back = '/bids', children }: { title: string; back?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink lg:flex">
      <SideMenu />
      <div className="min-w-0 flex-1">
        <MobileBar title={title} back={back} />
        {children}
      </div>
    </div>
  );
}

function SideMenu() {
  const path = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 lg:flex">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-white"><Compass className="h-5 w-5" /></span>
        <span className="text-[17px] font-bold tracking-tight">입찰나침반</span>
      </Link>
      <nav className="space-y-1">
        {MENU.map(({ href, label, Icon, match }) => {
          const on = match(path);
          return (
            <Link key={href} href={href} aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${on ? 'bg-fill text-ink' : 'text-mute hover:bg-fill hover:text-sub'}`}>
              <Icon className="h-5 w-5" strokeWidth={on ? 2.3 : 2} />{label}
            </Link>
          );
        })}
      </nav>
      <Link href="/mypage" className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold text-mute hover:bg-fill hover:text-sub">
        <CircleUserRound className="h-5 w-5" />마이페이지
      </Link>
    </aside>
  );
}

function MobileBar({ title, back }: { title: string; back: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center bg-canvas/90 px-2 backdrop-blur lg:hidden">
      <button type="button" aria-label="뒤로가기" onClick={() => (window.history.length > 1 ? router.back() : router.push(back))}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink active:bg-fill">
        <ArrowLeft className="h-[22px] w-[22px]" />
      </button>
      <span className="text-[17px] font-semibold">{title}</span>
    </header>
  );
}

/* ---------- v3 공통 조각 ---------- */

/** 흰 카드 — 테두리 없이 여백으로 구분 */
export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-box bg-white p-5 lg:p-6 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-bold">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export const CTA_PRIMARY =
  'flex h-14 w-full items-center justify-center gap-2 rounded-cta bg-brand text-[16px] font-semibold text-white transition hover:bg-brand-strong active:scale-[.98] disabled:bg-line disabled:text-mute';
export const CTA_SOFT =
  'flex h-14 w-full items-center justify-center gap-2 rounded-cta bg-fill text-[16px] font-semibold text-sub transition hover:bg-line active:scale-[.98]';
