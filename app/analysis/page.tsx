'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ChevronRight, Info, Target, Trophy } from 'lucide-react';
import { SignupSheet } from '@/components/signup-sheet';
import { Header, Shell } from '@/components/layout';
import { BTN_PRIMARY } from '@/components/ui';
import { fetchMyReport, type BidReport } from '@/lib/analysis';
import { fmtDate } from '@/lib/format';
import { useJudged, useStore } from '@/lib/store';

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : '–');

/** F7 입찰 분석 — 성적표(F7-1), 아깝게 놓친 공고(F7-2), 하한선 미달(F7-3), 기관·유형별 */
export default function AnalysisPage() {
  const { loaded, account, profile } = useStore();
  const judged = useJudged();
  const [report, setReport] = useState<BidReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signup, setSignup] = useState(false);

  useEffect(() => {
    if (!account) return;
    fetchMyReport(3).then(setReport).catch((e: Error) => setError(e.message));
  }, [account, profile.corpName]);

  // 이력과 닮은 '참여 가능' 공고 (F7-4 연결)
  const similarNow = useMemo(
    () => (judged ?? []).filter((j) => j.judgment.status === 'eligible' && (j.similar?.score ?? 0) > 0).sort((a, b) => b.relevance - a.relevance),
    [judged],
  );

  let body: React.ReactNode;
  if (!loaded) body = <div className="h-40 animate-pulse rounded-card bg-white" />;
  else if (!account) {
    body = (
      <Empty title="가입하면 우리 회사 입찰 성적표를 볼 수 있어요"
        text="사업자등록번호와 대표자명으로 회사를 확인하면, 나라장터 개찰 결과에서 귀사의 투찰 이력을 찾아 분석합니다. 따로 입력할 것은 없습니다.">
        <button type="button" onClick={() => setSignup(true)} className={BTN_PRIMARY}>가입하고 성적표 보기</button>
      </Empty>
    );
  } else if (error) body = <p className="rounded-card bg-red-50 p-4 text-sm text-red-600">분석을 불러오지 못했습니다: {error}</p>;
  else if (!report) body = <div className="h-40 animate-pulse rounded-card bg-white" />;
  else if (!report.verified) {
    body = (
      <Empty title="회사 확인이 필요합니다"
        text="입찰 분석은 회사 확인(사업자등록번호 + 대표자명)을 마친 회원에게만 보여드립니다. 나라장터에 등록되지 않은 사업자는 아직 분석할 이력이 없습니다.">
        <Link href="/mypage?edit=company" className={BTN_PRIMARY}>기업 정보 확인하기</Link>
      </Empty>
    );
  } else if (!report.total) {
    body = (
      <Empty title="아직 분석할 입찰 이력이 없어요"
        text="개찰 결과는 매일 조금씩 수집하고 있습니다. 서비스 공개 시점에 최근 3년치를 한 번에 받아오면 귀사의 성적표가 채워집니다.">
        <Link href="/recommend" className={BTN_PRIMARY}>지금 참여 가능한 공고 보기</Link>
      </Empty>
    );
  } else {
    const r = report;
    const total = r.total ?? 0, won = r.won ?? 0;
    body = (
      <div className="space-y-4">
        {/* F7-1 성적표 */}
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Trophy className="h-4 w-4 text-amber-500" />최근 {r.years}년 입찰 성적표</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="투찰" value={`${total.toLocaleString()}건`} />
            <Stat label="낙찰" value={`${won.toLocaleString()}건`} tone="text-green-600" />
            <Stat label="낙찰률" value={pct(won, total)} tone="text-primary" />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-y-1.5 border-t border-slate-100 pt-3 text-sm">
            <dt className="text-slate-500">평균 투찰률</dt><dd className="text-right font-semibold">{r.avg_rate ? `${r.avg_rate}%` : '–'}</dd>
            <dt className="text-slate-500">참여 공고 평균 경쟁</dt><dd className="text-right font-semibold">{r.avg_participants ? `${r.avg_participants}개사` : '–'}</dd>
            <dt className="text-slate-500">아깝게 놓친 공고</dt><dd className="text-right font-semibold text-amber-600">{r.near_misses?.length ?? 0}건</dd>
            <dt className="text-slate-500">낙찰하한선 미달</dt><dd className="text-right font-semibold text-red-500">{r.below_floor ?? 0}건</dd>
          </dl>
        </section>

        {similarNow.length > 0 && (
          <Link href="/recommend" className="flex items-center gap-3 rounded-card border border-green-200 bg-green-50 px-4 py-3.5 text-sm text-green-900 hover:bg-green-100">
            <Target className="h-5 w-5 shrink-0 text-green-600" />
            <span className="flex-1">귀사 이력과 비슷한 <b>참여 가능 공고 {similarNow.length}건</b>이 지금 열려 있어요</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}

        {/* F7-2 아깝게 놓친 공고 */}
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold"><Target className="h-4 w-4 text-amber-500" />아깝게 놓친 공고</h2>
          <p className="mb-3 text-xs text-slate-500">2~5위로 탈락한 공고 중 1순위와 투찰률 차이가 작은 순서입니다.</p>
          {r.near_misses?.length ? (
            <ul className="divide-y divide-slate-100">
              {r.near_misses.map((m) => (
                <li key={m.id} className="py-2.5 text-sm">
                  <p className="line-clamp-1 font-medium">{m.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {m.org ?? ''} · {fmtDate(new Date(m.opened_at))} · <b className="text-slate-700">{m.rank}위</b>
                    {m.participants ? ` / ${m.participants}개사` : ''}
                  </p>
                  <p className="mt-0.5 text-xs">
                    내 투찰률 {m.rate}% · 1순위 {m.first_rate}% · <b className="text-amber-600">차이 {m.gap}%p</b>
                  </p>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-400">해당하는 공고가 없습니다.</p>}
        </section>

        {/* F7-3 하한선 미달 */}
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold"><AlertTriangle className="h-4 w-4 text-red-500" />낙찰하한선 미달</h2>
          <p className="mb-3 text-xs text-slate-500">하한율보다 낮게 투찰해 낙찰 대상에서 빠진 공고입니다.</p>
          {r.below_floor_list?.length ? (
            <>
              <ul className="divide-y divide-slate-100">
                {r.below_floor_list.map((m) => (
                  <li key={m.id} className="py-2.5 text-sm">
                    <p className="line-clamp-1 font-medium">{m.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{m.org ?? ''} · {fmtDate(new Date(m.opened_at))} · 투찰률 {m.rate}%</p>
                  </li>
                ))}
              </ul>
              <Link href="/calculator" className="mt-2 inline-flex items-center text-sm font-bold text-primary">투찰 전에 하한 구간 계산하기<ChevronRight className="h-4 w-4" /></Link>
            </>
          ) : <p className="text-sm text-slate-400">하한선 미달로 빠진 공고가 없습니다.</p>}
        </section>

        {/* 유형·기관별 */}
        <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><BarChart3 className="h-4 w-4 text-primary" />유형·기관별 성적</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="pb-1.5 font-medium">구분</th><th className="pb-1.5 text-right font-medium">투찰</th><th className="pb-1.5 text-right font-medium">낙찰</th><th className="pb-1.5 text-right font-medium">낙찰률</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(r.by_type ?? {}).map(([k, v]) => (
                <tr key={k}><td className="py-1.5">{k}</td><td className="py-1.5 text-right">{v.total}</td><td className="py-1.5 text-right">{v.won}</td><td className="py-1.5 text-right">{pct(v.won, v.total)}</td></tr>
              ))}
              {(r.top_orgs ?? []).map((o) => (
                <tr key={o.org}><td className="max-w-[160px] truncate py-1.5 text-slate-600">{o.org}</td><td className="py-1.5 text-right">{o.total}</td><td className="py-1.5 text-right">{o.won}</td><td className="py-1.5 text-right">{pct(o.won, o.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="flex gap-1.5 px-1 text-[11px] leading-relaxed text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          나라장터 개찰 결과를 바탕으로 한 참고 정보입니다. 낙찰 여부는 최종낙찰자 기준이며, 수집되지 않은 기간·공고는 빠질 수 있습니다.
        </p>
      </div>
    );
  }

  return (
    <Shell>
      <Header />
      <main className="space-y-4 px-4 pb-24 pt-5">
        <div>
          <h1 className="text-xl font-bold">우리 회사 입찰 분석</h1>
          <p className="mt-1 text-sm text-slate-500">{profile.corpName ? `${profile.corpName} · ` : ''}나라장터 개찰 결과 기준</p>
        </div>
        {body}
      </main>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="회사를 확인하면 입찰 성적표를 바로 보여드려요." onDone={() => setSignup(false)} />
    </Shell>
  );
}

function Stat({ label, value, tone = 'text-slate-800' }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-extrabold ${tone}`}>{value}</p>
    </div>
  );
}

function Empty({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-slate-200 bg-white p-5 text-center shadow-sm">
      <Trophy className="mx-auto h-8 w-8 text-amber-400" />
      <h2 className="mt-2 text-base font-bold">{title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{text}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
