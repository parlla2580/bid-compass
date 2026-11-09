import Link from 'next/link';
import { CircleAlert, CircleCheck, CircleX } from 'lucide-react';
import type { BidType, Notice, Profile } from '@/lib/data';
import { fmtShort } from '@/lib/format';
import { STATUS_LABEL, summarize, type Judgment, type RuleResult, type Status } from '@/lib/judge';
import type { Fit } from '@/lib/fit';

// 폼·버튼 공통 클래스 (v3)
export const INPUT_CLS =
  'w-full rounded-btn border border-transparent bg-fill px-4 py-3.5 text-[16px] text-ink placeholder:text-mute focus:border-brand focus:bg-white focus:outline-none';
export const CTA_PRIMARY =
  'flex h-14 w-full items-center justify-center gap-2 rounded-cta bg-brand px-4 text-[16px] font-semibold text-white transition hover:bg-brand-strong active:scale-[.98] disabled:bg-line disabled:text-mute';
export const CTA_SOFT =
  'flex h-14 w-full items-center justify-center gap-2 rounded-cta bg-fill px-4 text-[16px] font-semibold text-sub transition hover:bg-line active:scale-[.98]';
/** 예전 이름 — 같은 모양 */
export const BTN_PRIMARY = CTA_PRIMARY;
export const BTN_OUTLINE = CTA_SOFT;

export const chipClass = (on: boolean) =>
  on ? 'border-ink bg-ink text-white' : 'border-line bg-white text-sub hover:bg-fill';

/** 사업유형 — 색 없이 회색 글자 */
export function TypeTag({ type }: { type: BidType }) {
  return <span className="text-[13px] font-medium text-mute">{type}</span>;
}

export function DdayBadge({ d }: { d: number }) {
  if (d < 0) return <span className="text-[13px] font-semibold text-mute">마감</span>;
  return <span className={`text-[13px] font-semibold ${d <= 3 ? 'text-bad' : 'text-sub'}`}>{d === 0 ? '오늘 마감' : `D-${d}`}</span>;
}

export function NewBadge() {
  return <span className="text-[13px] font-semibold text-brand">새 공고</span>;
}

/* ---------- 판정 표시: 점 + 글자 ---------- */
export const STATUS_STYLE: Record<Status, { dot: string; text: string; Icon: typeof CircleCheck }> = {
  eligible: { dot: 'bg-ok', text: 'text-ok', Icon: CircleCheck },
  check: { dot: 'bg-warn', text: 'text-warn', Icon: CircleAlert },
  ineligible: { dot: 'bg-bad', text: 'text-bad', Icon: CircleX },
};

export function StatusBadge({ status, size = 'sm' }: { status: Status; size?: 'sm' | 'lg' }) {
  const { dot, text } = STATUS_STYLE[status];
  const lg = size === 'lg';
  return (
    <span className={`inline-flex items-center gap-1.5 font-semibold ${text} ${lg ? 'text-[15px]' : 'text-[13px]'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />{STATUS_LABEL[status]}
    </span>
  );
}

const RESULT_ICON: Record<RuleResult, { Icon: typeof CircleCheck; cls: string }> = {
  pass: { Icon: CircleCheck, cls: 'text-mute' },
  check: { Icon: CircleAlert, cls: 'text-warn' },
  fail: { Icon: CircleX, cls: 'text-bad' },
};

export function ResultIcon({ result }: { result: RuleResult }) {
  const { Icon, cls } = RESULT_ICON[result];
  return <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} aria-label={result === 'pass' ? '충족' : result === 'check' ? '확인 필요' : '불충족'} />;
}

/* ---------- 공고 카드 (리스트 공통) ---------- */
export function NoticeCard({ notice: n, judgment, fit, note, footer }: { notice: Notice; judgment?: Judgment; fit?: Fit | null; note?: React.ReactNode; footer?: React.ReactNode }) {
  if (footer) {
    return (
      <div className="rounded-box bg-white">
        <NoticeCard notice={n} judgment={judgment} fit={fit} note={note} />
        <div className="-mt-2 flex justify-end px-5 pb-3">{footer}</div>
      </div>
    );
  }
  return (
    <Link href={`/bids/${n.id}`} className="block rounded-box bg-white p-5 transition hover:bg-white/70 active:scale-[.99]">
      <div className="flex items-center gap-2">
        {judgment && <StatusBadge status={judgment.status} />}
        {fit && <span className="text-[13px] font-semibold text-brand">맞춤 {fit.score}%</span>}
        <TypeTag type={n.type} />
        {n.isNew && <NewBadge />}
        <span className="ml-auto"><DdayBadge d={n.d} /></span>
      </div>
      <h3 className="mt-2 line-clamp-2 break-all text-[16px] font-semibold leading-snug text-ink">{n.title}</h3>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] text-mute">{n.org}</p>
        <p className="shrink-0 text-[16px] font-bold">{n.estPrice ? `${fmtShort(n.estPrice)}원` : <span className="text-[14px] font-normal text-mute">금액 미공개</span>}</p>
      </div>
      {judgment && judgment.status !== 'eligible' && <p className="mt-2 line-clamp-1 text-[13px] text-sub">{summarize(judgment)}</p>}
      {note}
    </Link>
  );
}

/** 공고 불러오는 중 / 오류 / 공고 없음 처리 */
export function NoticesState({ notices, error, children }: { notices: Notice[] | null; error: string | null; children: React.ReactNode }) {
  if (error) return <p className="rounded-box bg-white px-5 py-8 text-center text-[15px] text-bad">{error}</p>;
  if (!notices) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label="공고를 불러오는 중">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-box bg-white" />)}
      </div>
    );
  }
  if (!notices.length) {
    return <p className="rounded-box bg-white px-5 py-10 text-center text-[15px] text-mute">아직 마감 전 공고가 없어요. 공고는 3시간마다 모아요.</p>;
  }
  return <>{children}</>;
}

/** '전기공사업 외 2 · 경기도 용인시' */
export function profileSummary(p: Profile): string {
  const ind = p.industries?.length ? `${p.industries[0].name}${p.industries.length > 1 ? ` 외 ${p.industries.length - 1}` : ''}` : '업종 미입력';
  return `${ind} · ${p.location ?? '소재지 미입력'}`;
}
