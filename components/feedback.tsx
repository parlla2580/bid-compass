'use client';

import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@/lib/store';

/* ---------- 토스트 ---------- */
const ToastContext = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((m: string) => {
    setMsg(m);
    setShow(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 1800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        role="status"
        className={`toast pointer-events-none fixed inset-x-0 bottom-24 z-[60] lg:bottom-10 mx-auto w-fit max-w-[90%] rounded-full bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white ${show ? 'opacity-100' : 'translate-y-2 opacity-0'}`}
      >
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

/** 서버 저장 실패를 토스트로 알림 */
export function SyncErrorToast() {
  const { syncError, clearSyncError } = useStore();
  const toast = useToast();
  useEffect(() => {
    if (!syncError) return;
    toast(syncError);
    clearSyncError();
  }, [syncError, clearSyncError, toast]);
  return null;
}

/* ---------- 바텀시트 모달 ---------- */
export function Sheet({ title, open, onClose, children, footer }: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fade-in absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={title}
        className="sheet-up absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] max-w-[520px] flex-col rounded-t-[24px] bg-white lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-box">
        <div className="flex items-center justify-between px-5 pb-1 pt-5">
          <h2 className="text-[20px] font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-mute hover:bg-fill">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-2">{footer}</div>}
      </div>
    </div>
  );
}
