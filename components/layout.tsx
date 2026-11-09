'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Calculator, CircleUserRound, Compass, FileText, House } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useStore } from '@/lib/store';

/*
 * 화면 틀 (v3 투트랙)
 *  - 모바일(1024px 미만): 상단 바 + 하단 탭, 한 칸 세로 배치
 *  - 데스크탑(1024px 이상): 왼쪽 메뉴 + 넓은 본문 (wide: 최대 1200px / 기본: 최대 760px)
 */
export function Shell({ children, nav = true, tabs = nav, wide = false }: { children: ReactNode; nav?: boolean; tabs?: boolean; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-canvas text-ink lg:flex">
      {nav && <SideMenu />}
      <div className="min-w-0 flex-1">
        <div className={`mx-auto ${wide ? 'max-w-[1200px]' : 'max-w-[760px]'} lg:px-6 lg:pb-16 lg:pt-4`}>{children}</div>
      </div>
      {tabs && <BottomNav />}
    </div>
  );
}

const NAV = [
  { href: '/', label: '홈', Icon: House, match: (p: string) => p === '/' },
  { href: '/bids', label: '공고', Icon: FileText, match: (p: string) => p.startsWith('/bids') },
  { href: '/analysis', label: '분석', desk: '입찰 분석', Icon: BarChart3, match: (p: string) => p.startsWith('/analysis') },
  { href: '/calculator', label: '도구', desk: '투찰 도구', Icon: Calculator, match: (p: string) => p.startsWith('/calculator') },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-brand text-white"><Compass className="h-5 w-5" /></span>
      <span className="text-[17px] font-bold tracking-tight">입찰나침반</span>
    </Link>
  );
}

/** 로그인했고 회사 확인을 마친 경우 업체명 */
function useCorpName() {
  const { account, profile } = useStore();
  return account && profile.corpName ? profile.corpName : null;
}

function SideMenu() {
  const path = usePathname();
  const corp = useCorpName();
  const item = (on: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${on ? 'bg-fill text-ink' : 'text-mute hover:bg-fill hover:text-sub'}`;
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 lg:flex">
      <div className="mb-8 px-2"><Logo /></div>
      <nav className="space-y-1">
        {NAV.map(({ href, label, desk, Icon, match }) => {
          const on = match(path);
          return (
            <Link key={href} href={href} aria-current={on ? 'page' : undefined} className={item(on)}>
              <Icon className="h-5 w-5" strokeWidth={on ? 2.3 : 2} />{desk ?? label}
            </Link>
          );
        })}
      </nav>
      <Link href="/mypage" className={`mt-auto ${item(path.startsWith('/mypage'))}`}>
        <CircleUserRound className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block">마이페이지</span>
          {corp && <span className="block truncate text-[13px] font-medium text-mute">{corp}</span>}
        </span>
      </Link>
    </aside>
  );
}

function ProfileLink() {
  const corp = useCorpName();
  return (
    <Link href="/mypage" aria-label={corp ? `마이페이지 (${corp})` : '마이페이지'}
      className="flex h-10 max-w-[55vw] items-center gap-1.5 rounded-full px-2 text-sub active:bg-fill">
      {corp && <span className="truncate text-[14px] font-semibold">{corp}</span>}
      <CircleUserRound className="h-6 w-6 shrink-0" />
    </Link>
  );
}

/** 기본 상단 바 — 모바일만 (데스크탑은 왼쪽 메뉴에 로고) */
export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-canvas/90 px-5 backdrop-blur lg:hidden">
      <Logo />
      <ProfileLink />
    </header>
  );
}

/** 뒤로가기형 상단 바 */
export function BackHeader({ title, fallback = '/bids' }: { title: string; fallback?: string }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-1 bg-canvas/90 px-2 backdrop-blur lg:static lg:mb-2 lg:bg-transparent lg:px-0">
      <button type="button" aria-label="뒤로가기"
        onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fill">
        <ArrowLeft className="h-[22px] w-[22px]" />
      </button>
      <span className="truncate text-[17px] font-semibold">{title}</span>
      <div className="ml-auto lg:hidden"><ProfileLink /></div>
    </header>
  );
}

/** 모바일 하단 탭 */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-[760px] grid-cols-4">
        {NAV.map(({ href, label, Icon, match }) => {
          const on = match(pathname);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? 'page' : undefined}
                className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? 'text-ink' : 'text-mute'}`}>
                <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.3 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** 간편 시작(업종·지역)을 마치지 않았으면 S1로 보냄. 준비되면 true */
export function useRequireStart() {
  const { loaded, started } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (loaded && !started) router.replace('/start');
  }, [loaded, started, router]);
  return loaded && started;
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

/** 페이지 제목 */
export function PageTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-5 pb-2 pt-3 lg:px-0 lg:pt-6">
      <h1 className="text-[24px] font-bold leading-snug tracking-tight lg:text-[28px]">{title}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-sub">{sub}</p>}
    </div>
  );
}
