'use client';

import Link from 'next/link';
import type { Notice } from '@/lib/data';
import { fmtShort } from '@/lib/format';
import type { Judged } from '@/lib/store';
import { STATUS_STYLE } from './ui';

/*
 * 공고 한 줄 (v3.1) — 세로로만 훑는 목록
 *  왼쪽: 맞춤 점수(맞춤 탭) 또는 판정 점(전체 탭)
 *  가운데: 새 공고 점 · 제목 / 기관 · 유형(회색 글자)
 *  오른쪽: 금액 / 마감(3일 이내만 빨강)
 */

const dday = (d: number) => (d < 0 ? '마감' : d === 0 ? '오늘' : `D-${d}`);

export function NoticeRow({ item, lead = 'score', active, onSelect }: {
  item: Judged | { notice: Notice; judgment?: undefined; fit?: undefined };
  /** score: 맞춤 점수 / status: 판정 점 / none */
  lead?: 'score' | 'status' | 'none';
  active?: boolean;
  /** 데스크탑 미리보기 — 있으면 클릭 시 상세로 가지 않고 선택 */
  onSelect?: (n: Notice) => void;
}) {
  const n = item.notice;
  const body = (
    <>
      {lead !== 'none' && (
        <span className="flex w-10 shrink-0 justify-center pt-0.5">
          {lead === 'score'
            ? <span className={`text-[17px] font-bold tabular-nums ${item.fit ? 'text-brand' : 'text-line'}`}>{item.fit?.score ?? '–'}</span>
            : item.judgment && <span className={`mt-2 h-2 w-2 rounded-full ${STATUS_STYLE[item.judgment.status].dot}`} aria-label={item.judgment.status} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          {n.isNew && <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="새 공고" />}
          <span className="line-clamp-2 text-[15px] font-medium leading-snug text-ink lg:line-clamp-1">{n.title}</span>
        </span>
        <span className="mt-1 block truncate text-[13px] text-mute">{n.demandOrg && n.demandOrg !== n.org ? n.demandOrg : n.org} · {n.type}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-[15px] font-semibold tabular-nums">{n.estPrice ? `${fmtShort(n.estPrice)}` : <span className="text-[13px] font-normal text-mute">미공개</span>}</span>
        <span className={`mt-1 block text-[13px] tabular-nums ${n.d >= 0 && n.d <= 3 ? 'font-semibold text-bad' : 'text-mute'}`}>{dday(n.d)}</span>
      </span>
    </>
  );
  const cls = `flex w-full items-start gap-3 px-4 py-3.5 text-left transition lg:px-5 ${active ? 'bg-brand-soft' : 'hover:bg-fill/70'}`;
  return onSelect
    ? <button type="button" onClick={() => onSelect(n)} className={cls} aria-pressed={active}>{body}</button>
    : <Link href={`/bids/${n.id}`} className={cls}>{body}</Link>;
}

/** 한 장 안에 구분선으로 나눈 목록 */
export function RowList({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-box bg-white">{children}</div>;
}
