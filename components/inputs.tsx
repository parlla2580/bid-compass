'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { PRICE_STEPS, SIDO, SIGUNGU, splitLocation, type Industry } from '@/lib/data';
import { searchIndustries } from '@/lib/notices';
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

/** 나라장터 업종 검색·다중 선택 (업종 2,916개, Supabase industries 테이블) */
export function IndustryPicker({ value, onChange, max = 10 }: {
  value: Industry[];
  onChange: (v: Industry[]) => void;
  max?: number;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Industry[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');

  // 입력이 멈추면 검색
  useEffect(() => {
    const s = q.trim();
    if (s.length < 1) {
      setResults([]);
      return;
    }
    setState('loading');
    const t = setTimeout(() => {
      searchIndustries(s)
        .then((r) => { setResults(r); setState('idle'); })
        .catch(() => setState('error'));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const chosen = new Set(value.map((v) => v.code));
  const toggle = (i: Industry) =>
    onChange(chosen.has(i.code) ? value.filter((v) => v.code !== i.code) : value.length >= max ? value : [...value, i]);

  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((i) => (
            <span key={i.code} className="inline-flex items-center gap-1 rounded-full bg-primary py-1 pl-3 pr-1.5 text-sm font-medium text-white">
              {i.name}
              <button type="button" aria-label={`${i.name} 빼기`} onClick={() => toggle(i)} className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/20">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <label className="relative block">
        <span className="sr-only">나라장터 업종 검색</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input id="industry-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="업종 검색 (예: 전기공사업, 의료기기)"
          className={INPUT_CLS + ' pl-11'} />
      </label>
      {q.trim() && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-btn border border-slate-200 bg-white">
          {state === 'loading' && <p className="px-3 py-3 text-sm text-slate-400">검색 중…</p>}
          {state === 'error' && <p className="px-3 py-3 text-sm text-red-500">업종 목록을 불러오지 못했습니다</p>}
          {state === 'idle' && !results.length && <p className="px-3 py-3 text-sm text-slate-400">검색 결과가 없습니다</p>}
          {state === 'idle' && results.map((i) => (
            <button key={i.code} type="button" aria-pressed={chosen.has(i.code)} onClick={() => toggle(i)}
              className={`flex w-full items-center justify-between border-b border-slate-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-slate-50 ${chosen.has(i.code) ? 'font-semibold text-primary' : ''}`}>
              <span>{i.name}</span>
              <span className="text-xs text-slate-400">{chosen.has(i.code) ? '선택됨' : i.code}</span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-slate-400">나라장터에 등록된 업종 기준입니다. 최대 {max}개까지 선택할 수 있습니다.</p>
    </div>
  );
}

/** 소재지 선택 — 시도 → 시군구 (시군구는 선택) */
export function LocationPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { sido, sigungu } = splitLocation(value);
  const list = sido ? SIGUNGU[sido] ?? [] : [];
  const select = INPUT_CLS + ' py-2.5';
  return (
    <div className="grid grid-cols-2 gap-2">
      <select aria-label="시도" value={sido ?? ''} className={select}
        onChange={(e) => onChange(e.target.value || null)}>
        <option value="">시도 선택</option>
        {SIDO.map((s) => <option key={s}>{s}</option>)}
      </select>
      <select aria-label="시군구" value={sigungu ?? ''} disabled={!sido || !list.length} className={select + ' disabled:bg-slate-100'}
        onChange={(e) => onChange(e.target.value ? `${sido} ${e.target.value}` : sido)}>
        <option value="">{sido && !list.length ? '시군구 없음' : '시군구 선택'}</option>
        {list.map((g) => <option key={g}>{g}</option>)}
      </select>
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
