'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { INDUSTRY_OPTIONS, PRICE_STEPS } from '@/lib/data';
import { fmtRange } from '@/lib/format';
import { INPUT_CLS, chipClass } from './ui';

const LAST = PRICE_STEPS.length - 1;
const idxOf = (v: number) => Math.max(0, PRICE_STEPS.findIndex((s) => s >= v));

/** 듀얼 슬라이더 (관심 추정가격 범위) */
export function PriceRange({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [min, max] = value;
  const lo = idxOf(min);
  const hi = idxOf(max);
  return (
    <div>
      <p className="mb-3 text-lg font-bold text-primary">{fmtRange(min)} ~ {fmtRange(max)}</p>
      <div className="dual-range">
        <div className="track" />
        <div className="fill" style={{ left: `${(lo / LAST) * 100}%`, width: `${((hi - lo) / LAST) * 100}%` }} />
        <input type="range" min={0} max={LAST} step={1} value={lo} aria-label="최소 금액"
          onChange={(e) => onChange([PRICE_STEPS[Math.min(+e.target.value, hi)], max])} />
        <input type="range" min={0} max={LAST} step={1} value={hi} aria-label="최대 금액"
          onChange={(e) => onChange([min, PRICE_STEPS[Math.max(+e.target.value, lo)]])} />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>1천만원</span><span>50억원</span></div>
    </div>
  );
}

/** 단일 선택 칩 */
export function ChoiceChips<T extends string>({ options, value, onChange, label }: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} onClick={() => onChange(o)}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${chipClass(value === o)}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

/** 검색형 업종 선택 (대분류 > 중분류) */
export function IndustrySearch({ value, onChange }: {
  value: { big: string; mid: string } | null;
  onChange: (v: { big: string; mid: string }) => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const s = q.trim();
    return s ? INDUSTRY_OPTIONS.filter((o) => o.label.includes(s)) : INDUSTRY_OPTIONS;
  }, [q]);

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">업종 검색</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input id="industry-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="업종 검색 (예: 전자부품)"
          className={INPUT_CLS + ' pl-11'} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {results.map((o) => {
          const on = value?.big === o.big && value.mid === o.mid;
          return (
            <button key={o.label} type="button" aria-pressed={on} onClick={() => onChange({ big: o.big, mid: o.mid })}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${chipClass(on)}`}>
              {o.label}
            </button>
          );
        })}
        {!results.length && <p className="py-2 text-sm text-slate-400">검색 결과가 없습니다</p>}
      </div>
    </div>
  );
}

/** 태그 입력 — 면허, 직접생산확인 품목, 선호 기관 */
export function TagInput({ id, value, onChange, placeholder }: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim().replace(/,$/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-btn border border-slate-200 bg-white px-2.5 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-blue-100">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-blue-50 py-1 pl-2 pr-1 text-sm font-medium text-blue-700">
          {t}
          <button type="button" aria-label={`${t} 삭제`} onClick={() => onChange(value.filter((x) => x !== t))}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-blue-100">×</button>
        </span>
      ))}
      <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={add} placeholder={placeholder}
        className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-slate-400" />
    </div>
  );
}
