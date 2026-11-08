import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

/** 약관·방침 문서 공통 레이아웃 */
export function DocPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-white px-5 pb-16 md:border-x md:border-slate-200">
      <header className="flex h-14 items-center gap-2">
        <Link href="/" aria-label="홈으로" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="text-base font-bold">{title}</span>
      </header>
      <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
        초안입니다. 서비스 공개 전에 법률 검토를 거쳐 확정합니다. · 최종 수정 {updated}
      </p>
      <div className="doc mt-5 space-y-5 text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-bold text-slate-900">{title}</h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}
