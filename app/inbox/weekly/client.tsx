'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/layout';
import { LoadingBox } from '@/components/loading';
import { Tip } from '@/components/tip';
import { CTA_PRIMARY } from '@/components/ui';
import { useInbox } from '@/lib/inbox';
import { useStore } from '@/lib/store';

/*
 * 이번 주 리포트 (2026-11-27 오픈 전 아하 포인트 ④) — 최근 7일
 *  새 맞춤 공고 · 마감 임박 저장 공고 · 개찰 결과 · 가장 아깝게 놓친 공고 · 저장한 기관(새 공고·계약 끝) · 곧 나올 공고
 *  이메일 발송은 도메인이 생기면 같은 내용으로 (lib/inbox Weekly)
 */
export default function WeeklyView() {
  const { account, loaded } = useStore();
  const { weekly, loading } = useInbox();
  if (!loaded || (account && (loading || !weekly))) return <main className="px-5 pt-1 lg:px-0"><LoadingBox className="h-48" /></main>;
  if (!account || !weekly) return (
    <main className="px-5 pb-28 pt-1 lg:px-0">
      <div className="rounded-box bg-white px-6 py-10 text-center">
        <p className="text-[17px] font-bold">가입하면 매주 리포트를 모아 드려요</p>
        <div className="mx-auto mt-5 max-w-[320px]"><Link href="/mypage?signup=1" className={CTA_PRIMARY}>가입하기</Link></div>
      </div>
    </main>
  );
  const w = weekly, r = w.results;
  const md = (s: string) => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;
  const box = 'rounded-2xl bg-fill px-4 py-3';
  const row = 'flex items-center gap-3 py-3 text-[15px] hover:opacity-80';
  return (
    <main className="space-y-3 px-5 pb-28 pt-1 lg:space-y-4 lg:px-0 lg:pb-0">
      <p className="flex items-center gap-1 px-1 text-[13px] tabular-nums text-mute">{md(w.week)} 주 · 최근 7일
        <Tip title="이번 주 리포트">최근 7일 동안 올라온 맞춤 공고, 개찰 결과, 저장한 기관 소식을 모았어요. 매주 월요일 알림함에 새로 올라와요.</Tip>
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/bids?sort=latest" className={`${box} hover:bg-line/60`}><p className="text-[12px] text-mute">새 맞춤 공고</p><p className="mt-0.5 text-[22px] font-bold tabular-nums text-brand">{w.newMatched.toLocaleString()}건</p></Link>
        <Link href="/bids?tab=saved" className={`${box} hover:bg-line/60`}><p className="text-[12px] text-mute">마감 7일 안 저장 공고</p><p className={`mt-0.5 text-[22px] font-bold tabular-nums ${w.closingSaved.length ? 'text-bad' : ''}`}>{w.closingSaved.length}건</p></Link>
        <Link href="/analysis" className={`${box} hover:bg-line/60`}>
          <p className="text-[12px] text-mute">개찰 결과</p>
          <p className="mt-0.5 text-[22px] font-bold tabular-nums">{(r.won + r.lost + r.below).toLocaleString()}건</p>
          <p className="text-[12px] tabular-nums text-mute">낙찰 {r.won} · 탈락 {r.lost} · 하한 미달 {r.below}</p>
        </Link>
        <Link href="/bids?tab=soon" className={`${box} hover:bg-line/60`}><p className="text-[12px] text-mute">곧 나올 맞춤 공고</p><p className="mt-0.5 text-[22px] font-bold tabular-nums">{w.soon.toLocaleString()}건</p></Link>
      </div>

      {w.topNew.length > 0 && (
        <Card title="적합도 높은 새 공고">
          <ul className="-my-1 divide-y divide-line">
            {w.topNew.map((n) => (
              <li key={n.id}><Link href={`/bids/${n.id}`} className={row}>
                <span className="w-11 shrink-0 text-[13px] font-bold tabular-nums text-brand">{n.score != null ? `${n.score}%` : '–'}</span>
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className={`shrink-0 text-[13px] tabular-nums ${n.d <= 3 ? 'text-bad' : 'text-mute'}`}>D-{n.d}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      {w.bestMiss && (
        <Card title="가장 아깝게 놓친 공고">
          <Link href={`/analysis/${w.bestMiss.id}`} className="block hover:opacity-80">
            <p className="truncate text-[15px] font-medium">{w.bestMiss.title}</p>
            <p className="mt-1"><span className="rounded bg-warn/10 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-warn">{w.bestMiss.line}</span></p>
          </Link>
          <Link href="/calculator" className="mt-3 inline-flex items-center text-[14px] font-semibold text-brand">다음 투찰 금액 계산<ChevronRight className="h-4 w-4" /></Link>
        </Card>
      )}

      {w.closingSaved.length > 0 && (
        <Card title="마감 임박 저장 공고">
          <ul className="-my-1 divide-y divide-line">
            {w.closingSaved.slice(0, 5).map((n) => (
              <li key={n.id}><Link href={`/bids/${n.id}`} className={row}>
                <span className="min-w-0 flex-1 truncate">{n.title}</span>
                <span className={`shrink-0 text-[13px] font-semibold tabular-nums ${n.d <= 3 ? 'text-bad' : 'text-mute'}`}>{n.d === 0 ? '오늘' : `D-${n.d}`}</span>
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      {(w.orgEnd.length > 0 || w.orgNew > 0) && (
        <Card title="저장한 기관" aside={<span className="text-[13px] tabular-nums text-mute">새 공고 {w.orgNew}</span>}>
          {w.orgEnd.length ? (
            <ul className="-my-1 divide-y divide-line">
              {w.orgEnd.slice(0, 5).map((o) => (
                <li key={`${o.org}-${o.title}`}><Link href={`/orgs?tab=sales&org=${encodeURIComponent(o.org)}`} className={row}>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{o.org}</span><span className="block truncate text-[12px] text-mute">{o.title}</span></span>
                  <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[12px] font-semibold tabular-nums text-warn">계약 끝 D-{o.d}</span>
                </Link></li>
              ))}
            </ul>
          ) : <p className="text-[14px] text-mute">60일 안에 끝나는 계약 없음</p>}
        </Card>
      )}
    </main>
  );
}
