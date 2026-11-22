'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

/** 범용 툴팁 — ⓘ 아이콘(또는 감싼 글자)을 누르면 짧은 설명. 긴 안내 문장을 화면에서 걷어낼 때 사용 */
export function Tip({ children, label, title }: { children: ReactNode; label?: ReactNode; title?: string }) {
  const [open, setOpen] = useState(false);
  // 말풍선 가로 위치 — 화면 양옆 16px 안에 들어오게 (2026-11-22 모바일에서 왼쪽 끝 ⓘ의 말풍선이 화면 밖으로 잘림)
  const [pos, setPos] = useState<{ left: number; width: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open || !ref.current) { setPos(null); return; }
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const width = Math.min(256, vw - 32);
      const want = Math.max(16, Math.min(r.right - width, vw - 16 - width)); // 기본은 ⓘ 오른쪽 끝에 맞춤
      setPos({ left: want - r.left, width });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button type="button" aria-expanded={open} aria-describedby={open ? id : undefined} aria-label={title ?? '설명 보기'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className={label ? 'cursor-help underline decoration-slate-400 decoration-dotted underline-offset-4' : 'flex h-5 w-5 items-center justify-center text-mute hover:text-sub'}>
        {label ?? <Info className="h-[15px] w-[15px]" />}
      </button>
      {open && (
        <span id={id} role="tooltip" style={pos ? { left: pos.left, width: pos.width } : { right: 0, width: 256, visibility: 'hidden' }}
          className="fade-in absolute top-full z-50 mt-1.5 block max-w-[calc(100vw-2rem)] rounded-lg bg-slate-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white">
          {title && <b className="mb-0.5 block text-[13px]">{title}</b>}
          {children}
        </span>
      )}
    </span>
  );
}
