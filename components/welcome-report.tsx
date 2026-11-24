'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sheet } from './feedback';
import { LoadingBox } from './loading';
import { CTA_PRIMARY, CTA_SOFT } from './ui';
import { fetchMyBidList, fetchMyReport, bidOutcome, type BidReport } from '@/lib/analysis';
import { isCatalog } from '@/lib/data';
import { useJudged, useStore } from '@/lib/store';

/*
 * 가입 30초 리포트 (2026-11-23 오픈 전 아하 포인트 ①)
 *  · 회사 확인이 끝나는 순간(verify-client 가 표시를 남김) + 기존 확인 회원은 계정마다 한 번
 *  · 우리 회사 숫자 한 장: 경쟁 입찰 · 낙찰률 · 아깝게 놓친 공고(1순위와 차이) · 하한 미달 · 지금 맞춤 공고
 *  · 투찰 기록이 없는 회사는 맞춤 공고 · 수의계약 기관으로
 */
export const WELCOME_FLAG = 'bc.welcome';
const SEEN = (id: string) => `bc.welcomeSeen.${id}`;
const SKIP = /^\/(login|start|terms|privacy)/;
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 저장소를 못 써도 동작 */ } };

export function WelcomeReport() {
  const { account, profile } = useStore();
  const judged = useJudged();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<BidReport | null | undefined>(undefined);
  const [unknown, setUnknown] = useState(0);

  useEffect(() => {
    if (!account || SKIP.test(path) || open) return;
    const fresh = read(WELCOME_FLAG) === '1';
    if (!fresh && read(SEEN(account.id))) return;
    let on = true;
    const t = setTimeout(() => {
      fetchMyReport(3).then((rep) => {
        if (!on) return;
        if (!rep?.verified) { if (!fresh) write(SEEN(account.id), '1'); return; } // 회사 확인 전 회원은 보여 주지 않음
        setR(rep); setOpen(true);
        if (rep.unknown == null) fetchMyBidList().then((l) => on && setUnknown((l ?? []).filter((i) => (i.participants ?? 2) >= 2 && bidOutcome(i) === 'unknown').length)).catch(() => {});
      }).catch(() => {});
    }, 1200);
    return () => { on = false; clearTimeout(t); };
  }, [account, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setOpen(false); write(WELCOME_FLAG, null); if (account) write(SEEN(account.id), '1'); };
  if (!open) return null;

  const matched = (judged ?? []).filter((j) => j.matched && !isCatalog(j.notice)).length;
  const corp = profile.corpName ?? '우리 회사';
  let body: React.ReactNode = <LoadingBox className="h-40" tone="fill" />;
  let cta: React.ReactNode = null;
  if (r) {
    const total = r.total ?? 0, won = r.won ?? 0;
    const decided = Math.max(0, total - (r.pending ?? 0) - (r.unknown ?? unknown));
    const near = (r.near_misses ?? []).filter((m) => Number(m.gap) < 1);
    const best = near.length ? Math.min(...near.map((m) => Number(m.gap))) : null;
    if (total + (r.single ?? 0) > 0) {
      body = (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="경쟁 입찰" value={`${total.toLocaleString()}건`} />
          <Stat label="낙찰률" value={decided ? `${((won / decided) * 100).toFixed(1)}%` : '–'} sub={`낙찰 ${won.toLocaleString()}건`} tone="text-brand" />
          <Stat label="아깝게 놓친 공고" value={`${near.length}건`} sub={best != null ? `1순위와 ${best.toFixed(3)}%p` : undefined} tone={near.length ? 'text-warn' : undefined} />
          <Stat label="하한 미달" value={`${(r.below_floor ?? 0).toLocaleString()}건`} tone={r.below_floor ? 'text-bad' : undefined} />
          <Link href="/bids" onClick={close} className="col-span-2 flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3.5">
            <span className="text-[13px] font-medium text-brand">지금 맞춤 공고</span>
            <span className="text-[20px] font-bold tabular-nums text-brand">{judged ? `${matched.toLocaleString()}건` : '–'}</span>
          </Link>
        </div>
      );
      cta = <Link href="/analysis" onClick={close} className={CTA_PRIMARY}>입찰 분석 보기</Link>;
    } else {
      body = (
        <div className="space-y-2">
          <p className="text-[14px] text-sub">나라장터 투찰 기록 없음</p>
          <Link href="/bids" onClick={close} className="flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3.5">
            <span className="text-[13px] font-medium text-brand">지금 맞춤 공고</span>
            <span className="text-[20px] font-bold tabular-nums text-brand">{judged ? `${matched.toLocaleString()}건` : '–'}</span>
          </Link>
        </div>
      );
      cta = <Link href="/orgs?tab=sales" onClick={close} className={CTA_PRIMARY}>수의계약 기관 찾기</Link>;
    }
  }
  return (
    <Sheet title={`${corp} 한눈에`} open={open} onClose={close}
      footer={<div className="space-y-2">{cta}<button type="button" onClick={close} className={CTA_SOFT}>닫기</button></div>}>
      <p className="mb-3 flex items-center gap-1.5 text-[13px] text-mute">나라장터 개찰 결과 기준<span className="rounded bg-fill px-1.5 py-0.5 text-[11px]">경쟁 입찰(2곳 이상)만</span></p>
      {body}
    </Sheet>
  );
}

function Stat({ label, value, sub, tone = 'text-ink' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-fill px-4 py-3.5">
      <p className="text-[12px] text-mute">{label}</p>
      <p className={`mt-0.5 text-[22px] font-bold tabular-nums tracking-tight ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[12px] tabular-nums text-mute">{sub}</p>}
    </div>
  );
}
