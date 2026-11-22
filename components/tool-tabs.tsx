'use client';

import Link from 'next/link';

/**
 * 도구 탭 위 구분 (2026-11-22 발주기관 진입로 ②) — 투찰 금액 계산 · 적격심사 점수 · 발주기관
 *  계산기 안의 두 탭은 화면 안에서 바꾸고(onSelect), 발주기관은 /orgs 로 이동
 */
export type ToolTab = 'bid' | 'score' | 'org';
const TABS: [ToolTab, string, string][] = [['bid', '투찰 금액 계산', '/calculator?tab=bid'], ['score', '적격심사 점수', '/calculator?tab=score'], ['org', '발주기관', '/orgs']];

export function ToolTabs({ active, onSelect }: { active: ToolTab; onSelect?: (t: 'bid' | 'score') => void }) {
  const cls = (on: boolean) => `flex-1 whitespace-nowrap rounded-[10px] px-3 py-2 text-center text-[15px] font-semibold transition sm:px-5 ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`;
  return (
    <div className="sticky top-14 z-20 bg-canvas/95 px-5 py-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
      <div className="flex rounded-btn bg-line/60 p-1 lg:inline-flex" role="tablist">
        {TABS.map(([t, label, href]) => (onSelect && t !== 'org'
          ? <button key={t} type="button" role="tab" aria-selected={active === t} onClick={() => onSelect(t)} className={cls(active === t)}>{label}</button>
          : <Link key={t} href={href} role="tab" aria-selected={active === t} className={cls(active === t)}>{label}</Link>))}
      </div>
    </div>
  );
}
