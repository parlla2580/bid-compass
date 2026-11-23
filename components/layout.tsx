'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, BarChart3, Bell, Calculator, ChevronRight, CircleUserRound, Compass, FileText, House, LogIn, ShieldAlert, UserRound, Building2 } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useStore } from '@/lib/store';
import { useInbox } from '@/lib/inbox';

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
  // 2026-11-22: 발주기관 찾기 · 영업(수의계약 기관) · 저장한 기관을 '기관' 탭 하나로 (분석 › 영업, 도구 › 발주기관에서 이동)
  { href: '/orgs', label: '기관', desk: '발주기관', Icon: Building2, match: (p: string) => p.startsWith('/orgs') },
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

/**
 * 계정 상태 — 로그인 전 / 회사 확인 전 / 확인됨 (2026-11-18 사용자: 로그인·회사 확인 위치가 눈에 띄지 않음)
 *  로그인 버튼은 가입 시트 맨 아래 작은 글씨에만 있었고, 회사 확인은 마이페이지 기업 정보 카드 맨 아래에 있었음
 */
function useAccountState(): 'guest' | 'unverified' | 'verified' {
  const { account, loaded } = useStore();
  const corp = useCorpName();
  if (!loaded || !account) return 'guest';
  return corp ? 'verified' : 'unverified';
}

/** 회사명 첫 글자 — (주)·주식회사 등은 건너뜀 */
const initialOf = (name: string) => name.replace(/^\s*(\(주\)|㈜|주식회사|\(유\)|유한회사|\(합\)|합자회사)\s*/, '').trim().charAt(0) || name.charAt(0);

/** 로그인한 사람 표시 — 파란 동그라미(회사 첫 글자). 로그인 전 회색 아이콘과 한눈에 구분 (2026-11-21) */
function Avatar({ corp, size = 'h-7 w-7 text-[13px]' }: { corp: string | null; size?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full bg-brand font-bold text-white ${size}`} aria-hidden>
      {corp ? initialOf(corp) : <UserRound className="h-4 w-4" strokeWidth={2.4} />}
    </span>
  );
}

/**
 * 홈 상단 계정 안내 — 로그인 전: 로그인·가입 / 회사 확인 전: 회사 확인 (2026-11-21 사용자: 로그인 후에도 그 영역이 안 보임)
 *  확인 끝난 회원은 표시 안 함 (상단 바의 회사 이름표로 충분)
 */
export function AccountBanner() {
  const state = useAccountState();
  const { loaded } = useStore();
  if (!loaded || state === 'verified') return null;
  if (state === 'guest') {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-box bg-white px-4 py-3.5">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">로그인</span>
          <span className="block text-[13px] text-mute">저장 공고·입찰 분석 이어 보기</span>
        </span>
        <Link href="/mypage?signup=1" className="shrink-0 px-2 text-[14px] font-semibold text-sub">가입</Link>
        <Link href="/login" className="flex h-10 shrink-0 items-center rounded-btn bg-ink px-4 text-[14px] font-semibold text-white active:scale-[.98]">로그인</Link>
      </div>
    );
  }
  return (
    <Link href="/mypage?verify=1" className="mt-4 flex items-center gap-3 rounded-box bg-[#FFF4E5] px-4 py-3.5 active:brightness-[.98]">
      <ShieldAlert className="h-5 w-5 shrink-0 text-[#B45309]" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-[#92400E]">회사 확인 필요</span>
        <span className="block text-[13px] text-[#B45309]">확인 시 입찰 분석·업계 비교 열림</span>
      </span>
      <span className="flex shrink-0 items-center text-[14px] font-semibold text-[#B45309]">확인<ChevronRight className="h-4 w-4" /></span>
    </Link>
  );
}

function SideMenu() {
  const path = usePathname();
  const corp = useCorpName();
  const state = useAccountState();
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
              <NavIcon Icon={Icon} on={on} size="h-5 w-5" />{desk ?? label}
            </Link>
          );
        })}
        <BellLink desk />
      </nav>
      <div className="mt-auto space-y-2">
        {state === 'guest' && (
          <div className="rounded-2xl bg-fill p-3">
            <Link href="/login" className="flex h-10 items-center justify-center gap-1.5 rounded-btn bg-ink text-[14px] font-semibold text-white hover:bg-ink/90">
              <LogIn className="h-4 w-4" />로그인
            </Link>
            <Link href="/mypage?signup=1" className="mt-1.5 block py-1 text-center text-[13px] font-medium text-sub hover:text-ink">처음이면 가입하기</Link>
          </div>
        )}
        {state === 'unverified' && (
          <Link href="/mypage?verify=1" className="flex items-center gap-2 rounded-2xl bg-[#FFF4E5] px-3 py-2.5 text-[14px] font-semibold text-[#B45309] hover:brightness-[.98]">
            <ShieldAlert className="h-[18px] w-[18px] shrink-0" /><span className="flex-1">회사 확인</span><ChevronRight className="h-4 w-4" />
          </Link>
        )}
        <Link href="/mypage" className={item(path.startsWith('/mypage'))}>
          {state === 'guest' ? <CircleUserRound className="h-5 w-5 shrink-0" /> : <Avatar corp={corp} />}
          <span className="min-w-0">
            <span className="block">마이페이지</span>
            {corp && <span className="block truncate text-[13px] font-medium text-mute">{corp}</span>}
          </span>
        </Link>
      </div>
    </aside>
  );
}

/** 알림함 종 — 안 읽은 알림 수 */
function BellLink({ desk = false }: { desk?: boolean }) {
  const { unread } = useInbox();
  const path = usePathname();
  const badge = unread > 0 && (
    <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[11px] font-bold leading-none text-white">{unread > 9 ? '9+' : unread}</span>
  );
  if (desk) {
    const on = path.startsWith('/inbox');
    return (
      <Link href="/inbox" className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${on ? 'bg-fill text-ink' : 'text-mute hover:bg-fill hover:text-sub'}`}>
        <span className="relative"><Bell className="h-5 w-5" strokeWidth={on ? 2.3 : 2} />{badge}</span>알림
      </Link>
    );
  }
  return (
    <Link href="/inbox" aria-label={unread ? `알림 ${unread}건` : '알림'} className="relative flex h-10 w-10 items-center justify-center rounded-full text-sub active:bg-fill">
      <Bell className="h-[22px] w-[22px]" />{badge}
    </Link>
  );
}

function ProfileLink() {
  const corp = useCorpName();
  const state = useAccountState();
  if (state === 'guest') {
    return (
      <Link href="/login" className="ml-1 flex h-9 items-center rounded-full bg-ink px-3.5 text-[14px] font-semibold text-white active:scale-[.98]">로그인</Link>
    );
  }
  // 로그인 후: 파란 동그라미 + 회사 이름(확인됨) / 주황 '회사 확인'(확인 전) — 알약 모양으로 로그인 상태가 한눈에
  if (state === 'unverified') {
    return (
      <Link href="/mypage?verify=1" aria-label="회사 확인 필요 — 마이페이지"
        className="ml-1 flex h-9 items-center gap-1.5 rounded-full bg-[#FFF4E5] pl-1 pr-3 active:brightness-[.97]">
        <Avatar corp={null} />
        <span className="text-[13px] font-semibold text-[#B45309]">회사 확인</span>
      </Link>
    );
  }
  return (
    <Link href="/mypage" aria-label={`마이페이지 (${corp})`}
      className="ml-1 flex h-9 max-w-[52vw] items-center gap-1.5 rounded-full bg-white pl-1 pr-3 ring-1 ring-line active:bg-fill">
      <Avatar corp={corp} />
      <span className="truncate text-[14px] font-semibold text-ink">{corp}</span>
    </Link>
  );
}

/** 기본 상단 바 — 모바일만 (데스크탑은 왼쪽 메뉴에 로고) */
export function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between bg-canvas/90 px-5 backdrop-blur lg:hidden">
      <Logo />
      <div className="flex items-center"><BellLink /><ProfileLink /></div>
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
      <div className="ml-auto flex items-center lg:hidden"><BellLink /><ProfileLink /></div>
    </header>
  );
}

/** 모바일 하단 탭 */
/** 메뉴 아이콘 — 누른 뒤 화면을 불러오는 동안 나침반이 돎 (2026-11-23) */
function NavIcon({ Icon, on, size = 'h-[22px] w-[22px]' }: { Icon: typeof House; on: boolean; size?: string }) {
  const { pending } = useLinkStatus();
  return pending
    ? <Compass className={`compass-seek ${size} text-brand`} strokeWidth={2.2} aria-label="불러오는 중" />
    : <Icon className={size} strokeWidth={on ? 2.3 : 1.8} />;
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-[760px] grid-cols-5">
        {NAV.map(({ href, label, Icon, match }) => {
          const on = match(pathname);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? 'page' : undefined}
                className={`flex h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium ${on ? 'text-ink' : 'text-mute'}`}>
                <NavIcon Icon={Icon} on={on} />
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
