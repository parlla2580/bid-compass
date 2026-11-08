'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { TERMS, type TermKey } from '@/lib/terms';

/** 용어 툴팁 (F2-5) — 점선 밑줄, 탭하면 한 줄 설명 */
export function Term({ k, children }: { k: TermKey; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline">
      <button type="button" aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4 hover:decoration-primary">
        {children ?? k}
      </button>
      {open && (
        <span id={id} role="tooltip"
          className="fade-in absolute left-0 top-full z-50 mt-1.5 block w-64 max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white">
          <b className="mb-0.5 block text-[13px]">{k}</b>
          {TERMS[k]}
        </span>
      )}
    </span>
  );
}
