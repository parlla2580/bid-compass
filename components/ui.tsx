import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleX, Sparkle } from 'lucide-react';
import type { BidType, Notice, Profile } from '@/lib/data';
import { fmtShort } from '@/lib/format';
import { STATUS_LABEL, summarize, type Judgment, type RuleResult, type Status } from '@/lib/judge';

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
  if (d < 0) return <span className="inline-flex items-center rounded-md bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-500">마감</span>;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${d <= 3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
      {d === 0 ? 'D-Day' : `D-${d}`}
    </span>
  );
}

export function NewBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
      <Sparkle className="h-3 w-3 fill-white" />
      신규
    </span>
  );
}

/* ---------- 판정 배지 ---------- */
export const STATUS_STYLE: Record<Status, { cls: string; text: string; Icon: typeof CircleCheck }> = {
  eligible: { cls: 'bg-green-50 text-green-700 ring-green-200', text: 'text-green-700', Icon: CircleCheck },
  check: { cls: 'bg-amber-50 text-amber-700 ring-amber-200', text: 'text-amber-700', Icon: CircleAlert },
  ineligible: { cls: 'bg-red-50 text-red-600 ring-red-200', text: 'text-red-600', Icon: CircleX },
};

export function StatusBadge({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'lg' }) {
  const { cls, Icon } = STATUS_STYLE[status];
  const lg = size === 'lg';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold ring-1 ring-inset ${cls} ${lg ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'}`}>
      <Icon className={lg ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const RESULT_ICON: Record<RuleResult, { Icon: typeof CircleCheck; cls: string }> = {
  pass: { Icon: CircleCheck, cls: 'text-green-600' },
  check: { Icon: CircleAlert, cls: 'text-amber-500' },
  fail: { Icon: CircleX, cls: 'text-red-500' },
};

export function ResultIcon({ result }: { result: RuleResult }) {
  const { Icon, cls } = RESULT_ICON[result];
  return <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} aria-label={result === 'pass' ? '충족' : result === 'check' ? '확인 필요' : '불충족'} />;
}

/* ---------- 공고 카드 (리스트 공통) ---------- */
export function NoticeCard({ notice: n, judgment }: { notice: Notice; judgment: Judgment }) {
  return (
    <Link href={`/bids/${n.id}`}
      className="block rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]">
      <div className="mb-2 flex items-center gap-1.5">
        <StatusBadge status={judgment.status} />
        <TypeTag type={n.type} />
        {n.isNew && <NewBadge />}
      </div>
      <h3 className="line-clamp-2 text-[15px] font-bold text-slate-800">{n.title}</h3>
      <p className="mt-0.5 truncate text-sm text-slate-500">{n.org}</p>
      <p className={`mt-1.5 line-clamp-1 text-xs ${STATUS_STYLE[judgment.status].text}`}>{summarize(judgment)}</p>
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-sm font-semibold text-slate-700">
          {n.estPrice ? <>{fmtShort(n.estPrice)}<span className="ml-0.5 text-xs font-normal text-slate-400">원</span></> : <span className="text-xs font-normal text-slate-400">금액 미공개</span>}
        </span>
        <DdayBadge d={n.d} />
      </div>
    </Link>
  );
}

/** 공고 불러오는 중 / 오류 / 공고 없음 처리 */
export function NoticesState({ notices, error, children }: { notices: Notice[] | null; error: string | null; children: React.ReactNode }) {
  if (error) return <p className="rounded-card border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-600">{error}</p>;
  if (!notices) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="공고를 불러오는 중">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-card border border-slate-200 bg-white" />)}
      </div>
    );
  }
  if (!notices.length) {
    return <p className="rounded-card border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">아직 수집된 마감 전 공고가 없습니다. 공고는 3시간마다 수집됩니다.</p>;
  }
  return <>{children}</>;
}

/** '전기공사업 외 2 · 경기도 용인시' */
export function profileSummary(p: Profile): string {
  const ind = p.industries?.length ? `${p.industries[0].name}${p.industries.length > 1 ? ` 외 ${p.industries.length - 1}` : ''}` : '업종 미입력';
  return `${ind} · ${p.location ?? '소재지 미입력'}`;
}
