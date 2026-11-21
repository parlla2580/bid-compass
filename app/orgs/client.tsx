'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { Card } from '@/components/layout';
import { Tip } from '@/components/tip';
import { fetchOrgProfile, type OrgProfile } from '@/lib/analysis';
import { useStore } from '@/lib/store';

/*
 * 발주기관 카드 (로드맵 4, 034) — 이 기관은 언제·어떻게 사나
 *  발주 시기(월별 공고 수) · 보통 참가 업체 수 · 사정률 · 낙찰률 · 낙찰 많이 한 업체(가입 후) · 지금 열린 공고
 *  기간은 실제 수집 기간을 그대로 표시 (12개월이 안 될 수 있음)
 */

const ym = (d: string | null) => (d ? `${d.slice(2, 4)}.${d.slice(5, 7)}` : '');

export default function OrgView() {
  const org = useSearchParams().get('name') ?? '';
  const { account, notices } = useStore();
  const [p, setP] = useState<OrgProfile | null | undefined>(undefined);
  useEffect(() => { if (org) fetchOrgProfile(org).then(setP).catch(() => setP(null)); }, [org]);
  const open = useMemo(() => (notices ?? []).filter((n) => n.d >= 0 && ((n.demandOrg ?? n.org) === org || n.org === org)).length, [notices, org]);

  if (!org) return <main className="px-5 pt-16 text-center text-[15px] text-mute">기관 이름 없음</main>;
  if (p === undefined) return <main className="space-y-3 px-5 pt-4 lg:px-0">{[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-box bg-white" />)}</main>;
  if (!p || (!p.openings && !p.notices)) return <main className="px-5 pt-16 text-center text-[15px] text-mute">이 기관의 수집된 공고·개찰 없음</main>;

  const types = Object.entries(p.by_type).sort((a, b) => b[1].n - a[1].n);
  const maxM = Math.max(1, ...p.months.map((m) => m.n));
  const avgM = p.months.length ? p.months.reduce((s, m) => s + m.n, 0) / p.months.length : 0;
  const peaks = p.months.filter((m) => m.n >= avgM * 1.5 && m.n >= 3).map((m) => `${Number(m.ym.slice(5))}월`);

  return (
    <main className="space-y-3 px-5 pb-28 pt-1 lg:space-y-4 lg:px-0 lg:pb-0">
      <section>
        <h1 className="text-[22px] font-bold leading-snug tracking-tight lg:text-[26px]">{org}</h1>
        <p className="mt-1 text-[14px] tabular-nums text-mute">{ym(p.d_from)}~{ym(p.d_to)} · 공고 {p.notices.toLocaleString()}건 · 개찰 {p.openings.toLocaleString()}건</p>
        {open > 0 && (
          <Link href={`/bids?tab=all&org=${encodeURIComponent(org)}`} className="mt-3 flex items-center justify-between rounded-box bg-brand px-5 py-3.5 text-white">
            <span className="text-[15px] font-semibold">지금 열린 공고 {open}건</span><ChevronRight className="h-5 w-5" />
          </Link>
        )}
      </section>

      {/* 발주 시기 */}
      {p.months.length > 0 && (
        <Card title={<span className="flex items-center gap-1">발주 시기<Tip title="월별 공고 수">이 기관(수요기관 기준) 공고를 공고번호로 센 월별 건수. 수집 기간 안에서만 — 해마다 같은지는 기간이 쌓여야 판단 가능.</Tip></span>}
          aside={peaks.length ? <span className="text-[13px] font-semibold text-brand">많은 달 {peaks.join('·')}</span> : null}>
          <div className="flex h-28 items-end gap-1.5">
            {p.months.map((m) => (
              <div key={m.ym} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-[11px] tabular-nums text-mute">{m.n}</span>
                <div className={`w-full rounded-t ${peaks.includes(`${Number(m.ym.slice(5))}월`) ? 'bg-brand' : 'bg-[#C9D7F9]'}`} style={{ height: `${(m.n / maxM) * 72}px` }} />
                <span className="text-[11px] tabular-nums text-mute">{Number(m.ym.slice(5))}월</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        {/* 경쟁 */}
        {types.length > 0 && (
          <Card title="보통 참가 업체">
            <div className="grid grid-cols-3 gap-2">
              {types.map(([t, v]) => (
                <div key={t} className="rounded-2xl bg-fill px-3 py-3">
                  <p className="text-[12px] text-mute">{t} · {v.n}건</p>
                  <p className="mt-0.5 text-[20px] font-bold tabular-nums">{v.participants != null ? `${Math.round(v.participants)}곳` : '–'}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* 사정률 · 낙찰률 */}
        {(p.sajeong || p.win_rate) && (
          <Card title={<span className="flex items-center gap-1">사정률 · 낙찰률<Tip title="이 기관 개찰 기준">사정률 = 예정가격 ÷ 기초금액 (90~110% 안). 낙찰률 = 낙찰금액 ÷ 예정가격. 큰 숫자는 중앙값, 작은 글씨는 가운데 50%. 추첨 결과라 다음 개찰을 예측하지는 않음.</Tip></span>}>
            <div className="grid grid-cols-2 gap-2">
              {p.sajeong && (
                <div className="rounded-2xl bg-fill px-4 py-3">
                  <p className="text-[12px] text-mute">사정률 · {p.sajeong.n}건</p>
                  <p className="mt-0.5 text-[20px] font-bold tabular-nums">{p.sajeong.p50.toFixed(2)}%</p>
                  <p className="text-[12px] tabular-nums text-mute">{p.sajeong.p25.toFixed(2)}~{p.sajeong.p75.toFixed(2)}%</p>
                </div>
              )}
              {p.win_rate && (
                <div className="rounded-2xl bg-fill px-4 py-3">
                  <p className="text-[12px] text-mute">낙찰률 · {p.win_rate.n}건</p>
                  <p className="mt-0.5 text-[20px] font-bold tabular-nums">{p.win_rate.p50.toFixed(2)}%</p>
                  <p className="text-[12px] tabular-nums text-mute">{p.win_rate.p25.toFixed(2)}~{p.win_rate.p75.toFixed(2)}%</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      {/* 낙찰 많이 한 업체 */}
      {p.winners.length > 0 && (
        <Card title="낙찰 많이 한 업체" aside={<span className="text-[13px] text-mute">낙찰자 정해진 {p.decided.toLocaleString()}건 중</span>}>
          {account ? (
            <ul className="space-y-2.5">
              {p.winners.map((w) => (
                <li key={w.name}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate font-medium">{w.name}</span>
                    <span className="shrink-0 tabular-nums text-sub"><b className="font-semibold text-ink">{w.wins}</b>건 · {Math.round((w.wins / Math.max(p.decided, 1)) * 100)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-fill"><div className="h-2 rounded-full bg-brand" style={{ width: `${(w.wins / p.winners[0].wins) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          ) : (
            <Link href="/mypage?signup=1" className="flex items-center justify-center gap-1.5 rounded-xl bg-fill py-3.5 text-[14px] font-semibold text-brand"><Lock className="h-4 w-4" />가입하면 보기</Link>
          )}
        </Card>
      )}
    </main>
  );
}
