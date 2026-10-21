'use client';

import { PRICE_STEPS, REGIONS } from '@/lib/data';
import { fmtRange } from '@/lib/format';
import { chipClass } from './ui';

const LAST = PRICE_STEPS.length - 1;
const idxOf = (v: number) => Math.max(0, PRICE_STEPS.findIndex((s) => s >= v));

/** 듀얼 슬라이더 (관심 추정가격 범위) */
export function PriceRange({ min, max, onChange }: { min: number; max: number; onChange: (min: number, max: number) => void }) {
  const lo = idxOf(min);
  const hi = idxOf(max);

  return (
    <div>
      <p className="mb-3 text-lg font-bold text-primary">
        {fmtRange(min)} ~ {fmtRange(max)}
      </p>
      <div className="dual-range">
        <div className="track" />
        <div className="fill" style={{ left: `${(lo / LAST) * 100}%`, width: `${((hi - lo) / LAST) * 100}%` }} />
        <input type="range" min={0} max={LAST} step={1} value={lo} aria-label="최소 금액"
          onChange={(e) => onChange(PRICE_STEPS[Math.min(+e.target.value, hi)], max)} />
        <input type="range" min={0} max={LAST} step={1} value={hi} aria-label="최대 금액"
          onChange={(e) => onChange(min, PRICE_STEPS[Math.max(+e.target.value, lo)])} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400">
        <span>1천만원</span>
        <span>50억원</span>
      </div>
    </div>
  );
}

/** 지역 다중선택 칩 */
export function RegionChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (r: string) => {
    const next = value.includes(r) ? value.filter((x) => x !== r) : [...value, r];
    onChange(REGIONS.filter((x) => next.includes(x)));
  };
  return (
    <div className="flex flex-wrap gap-2">
      {REGIONS.map((r) => {
        const on = value.includes(r);
        return (
          <button key={r} type="button" aria-pressed={on} onClick={() => toggle(r)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${chipClass(on)}`}>
            {r}
          </button>
        );
      })}
    </div>
  );
}
