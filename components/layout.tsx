'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, CircleUserRound, Compass, FileText, House, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** 모바일 앱 셸 — 480px 중앙 정렬 */
export function Shell({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  return (
    <>
      <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 md:border-x md:border-slate-200 md:shadow-md">{children}</div>
      {nav && <BottomNav />}
    </>
  );
}

function ProfileLink() {
  return (
    <Link href="/mypage" aria-label="마이페이지" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
      <CircleUserRound className="h-6 w-6" />
    </Link>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-1.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
          <Compass className="h-5 w-5" />
        </span>
        <span className="text-[17px] font-extrabold tracking-tight text-slate-800">입찰나침반</span>
      </Link>
      <ProfileLink />
    </header>
  );
}

/** 뒤로가기형 서브 헤더 */
export function BackHeader({ title, fallback = '/bids' }: { title: string; fallback?: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-2 backdrop-blur">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
        aria-label="뒤로가기"
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <span className="truncate text-base font-bold">{title}</span>
      <div className="ml-auto">
        <ProfileLink />
      </div>
    </header>
  );
}

const NAV = [
  { href: '/', label: '홈', Icon: House, match: (p: string) => p === '/' },
  { href: '/bids', label: '공고', Icon: FileText, match: (p: string) => p.startsWith('/bids') },
  { href: '/recommend', label: '추천', Icon: Sparkles, match: (p: string) => p.startsWith('/recommend') },
  { href: '/calculator', label: '도구', Icon: Calculator, match: (p: string) => p.startsWith('/calculator') },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {NAV.map(({ href, label, Icon, match }) => {
          const on = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Icon className={`h-6 w-6 ${on ? 'fill-blue-100' : ''}`} strokeWidth={on ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
