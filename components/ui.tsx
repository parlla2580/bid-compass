import Link from 'next/link';
import { Target } from 'lucide-react';
import type { Bid, BidType } from '@/lib/data';
import { fmtShort } from '@/lib/format';

// 폼·버튼 공통 클래스
export const INPUT_CLS =
  'w-full rounded-btn border border-slate-200 bg-white px-3.5 py-3 text-[15px] placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-blue-100';
export const BTN_PRIMARY =
  'flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[.99] disabled:bg-slate-300';
export const BTN_OUTLINE =
  'flex w-full items-center justify-center gap-2 rounded-btn border border-primary bg-white px-4 py-3.5 text-[15px] font-bold text-primary transition hover:bg-blue-50 active:scale-[.99]';

export const chipClass = (on: boolean) =>
  on ? 'border-primary bg-primary text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';

const TYPE_CLASS: Record<BidType, string> = {
  '물품': 'bg-blue-50 text-blue-700 ring-blue-200',
  '용역': 'bg-purple-50 text-purple-700 ring-purple-200',
  '공사': 'bg-orange-50 text-orange-700 ring-orange-200',
};

export function TypeTag({ type }: { type: BidType }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TYPE_CLASS[type]}`}>
      {type}
    </span>
  );
}

export function DdayBadge({ d }: { d: number }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${d <= 3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
      D-{d}
    </span>
  );
}

export function MatchBadge({ match, size = 'sm' }: { match: number; size?: 'sm' | 'lg' }) {
  if (size === 'lg') {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-700">
        <Target className="h-4 w-4" />
        매칭 {match}%
      </span>
    );
  }
  return <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">매칭 {match}%</span>;
}

/** 공고 카드 (리스트 공통) */
export function BidCard({ bid }: { bid: Bid }) {
  return (
    <Link
      href={`/bids/${bid.id}`}
      className="block rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]"
    >
      <div className="mb-2 flex items-center justify-between">
        <TypeTag type={bid.type} />
        <span className="text-[11px] text-slate-400">{bid.no}</span>
      </div>
      <h3 className="truncate text-[15px] font-bold text-slate-800">{bid.title}</h3>
      <p className="mt-0.5 text-sm text-slate-500">{bid.org}</p>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-semibold text-slate-700">
          {fmtShort(bid.price)}
          <span className="ml-0.5 text-xs font-normal text-slate-400">원</span>
        </span>
        <div className="flex items-center gap-1.5">
          <DdayBadge d={bid.d} />
          <MatchBadge match={bid.match} />
        </div>
      </div>
    </Link>
  );
}
