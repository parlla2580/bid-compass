'use client';

/** 도구 탭 위 구분 — 투찰 금액 계산 · 적격심사 점수 (발주기관은 2026-11-22 하단 '기관' 탭으로 이동) */
export type ToolTab = 'bid' | 'score';
const TABS: [ToolTab, string][] = [['bid', '투찰 금액 계산'], ['score', '적격심사 점수']];

export function ToolTabs({ active, onSelect }: { active: ToolTab; onSelect: (t: ToolTab) => void }) {
  const cls = (on: boolean) => `flex-1 whitespace-nowrap rounded-[10px] px-5 py-2 text-center text-[15px] font-semibold transition ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`;
  return (
    <div className="sticky top-14 z-20 bg-canvas/95 px-5 py-3 backdrop-blur lg:static lg:bg-transparent lg:px-0">
      <div className="flex rounded-btn bg-line/60 p-1 lg:inline-flex" role="tablist">
        {TABS.map(([t, label]) => <button key={t} type="button" role="tab" aria-selected={active === t} onClick={() => onSelect(t)} className={cls(active === t)}>{label}</button>)}
      </div>
    </div>
  );
}
