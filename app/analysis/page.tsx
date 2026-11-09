'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { SignupSheet } from '@/components/signup-sheet';
import { Card, Header, PageTitle, Shell } from '@/components/layout';
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
  if (!loaded) body = <div className="h-40 animate-pulse rounded-box bg-white" />;
  else if (!account) {
    body = (
      <Empty title="가입하면 우리 회사 입찰 성적표를 볼 수 있어요"
        text="회사를 확인하면 나라장터 개찰 결과에서 귀사의 투찰 이력을 찾아 분석해요. 따로 입력할 건 없어요.">
        <button type="button" onClick={() => setSignup(true)} className={BTN_PRIMARY}>가입하고 성적표 보기</button>
      </Empty>
    );
  } else if (error) body = <p className="rounded-box bg-white p-5 text-[15px] text-bad">분석을 불러오지 못했어요: {error}</p>;
  else if (!report) body = <div className="h-40 animate-pulse rounded-box bg-white" />;
  else if (!report.verified) {
    body = (
      <Empty title="회사 확인이 필요해요"
        text="사업자등록번호와 대표자명으로 회사를 확인한 회원에게만 보여드려요.">
        <Link href="/mypage?edit=company" className={BTN_PRIMARY}>기업 정보 확인하기</Link>
      </Empty>
    );
  } else if (!report.total) {
    body = (
      <Empty title="아직 분석할 입찰 이력이 없어요"
        text="개찰 결과를 매일 모으고 있어요. 서비스 공개 때 최근 3년치를 받아오면 성적표가 채워져요.">
        <Link href="/recommend" className={BTN_PRIMARY}>지금 참여 가능한 공고 보기</Link>
      </Empty>
    );
  } else {
    const r = report;
    const total = r.total ?? 0, won = r.won ?? 0;
    body = (
      <div className="space-y-3 lg:space-y-4">
        {/* F7-1 성적표 */}
        <section className="grid grid-cols-3 gap-2 lg:gap-3">
          <Stat label="투찰" value={total.toLocaleString()} unit="건" />
          <Stat label="낙찰" value={won.toLocaleString()} unit="건" />
          <Stat label="낙찰률" value={pct(won, total)} tone="text-brand" />
        </section>

        {similarNow.length > 0 && (
          <Link href="/recommend" className="flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
            <span className="flex-1 text-sub">귀사 이력과 비슷한 공고 <b className="font-semibold text-brand">{similarNow.length}건</b>이 지금 열려 있어요</span>
            <ChevronRight className="h-5 w-5 text-mute" />
          </Link>
        )}

        <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
          <Card title={`최근 ${r.years}년 요약`}>
            <dl className="space-y-3 text-[15px]">
              <Line k="평균 투찰률" v={r.avg_rate ? `${r.avg_rate}%` : '–'} />
              <Line k="참여 공고 평균 경쟁" v={r.avg_participants ? `${r.avg_participants}개사` : '–'} />
              <Line k="아깝게 놓친 공고" v={`${r.near_misses?.length ?? 0}건`} />
              <Line k="낙찰하한선 미달" v={<span className={r.below_floor ? 'text-bad' : ''}>{r.below_floor ?? 0}건</span>} />
            </dl>
          </Card>

          {/* 유형·기관별 */}
          <Card title="유형·기관별 성적">
            <table className="w-full text-[14px]">
              <thead><tr className="text-left text-[13px] text-mute"><th className="pb-2 font-medium">구분</th><th className="pb-2 text-right font-medium">투찰</th><th className="pb-2 text-right font-medium">낙찰</th><th className="pb-2 text-right font-medium">낙찰률</th></tr></thead>
              <tbody className="divide-y divide-line">
                {Object.entries(r.by_type ?? {}).map(([k, v]) => (
                  <tr key={k}><td className="py-2.5 font-medium">{k}</td><td className="py-2.5 text-right">{v.total}</td><td className="py-2.5 text-right">{v.won}</td><td className="py-2.5 text-right font-semibold">{pct(v.won, v.total)}</td></tr>
                ))}
                {(r.top_orgs ?? []).map((o) => (
                  <tr key={o.org}><td className="max-w-[180px] truncate py-2.5 text-sub">{o.org}</td><td className="py-2.5 text-right">{o.total}</td><td className="py-2.5 text-right">{o.won}</td><td className="py-2.5 text-right font-semibold">{pct(o.won, o.total)}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* F7-2 아깝게 놓친 공고 */}
          <Card title="아깝게 놓친 공고" aside={<span className="text-[13px] text-mute">1순위와 차이가 작은 순</span>}>
            {r.near_misses?.length ? (
              <ul className="divide-y divide-line">
                {r.near_misses.map((m) => (
                  <li key={m.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="line-clamp-1 text-[15px] font-medium">{m.title}</p>
                      <p className="shrink-0 text-[15px] font-semibold">{m.gap}%p</p>
                    </div>
                    <p className="mt-0.5 text-[13px] text-mute">
                      {m.rank}위{m.participants ? `/${m.participants}개사` : ''} · 내 {m.rate}% · 1순위 {m.first_rate}% · {fmtDate(new Date(m.opened_at))}
                    </p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-[15px] text-mute">해당하는 공고가 없어요</p>}
          </Card>

          {/* F7-3 하한선 미달 */}
          <Card title="낙찰하한선 미달" aside={<span className="text-[13px] text-mute">하한율보다 낮게 투찰</span>}>
            {r.below_floor_list?.length ? (
              <>
                <ul className="divide-y divide-line">
                  {r.below_floor_list.map((m) => (
                    <li key={m.id} className="py-3">
                      <p className="line-clamp-1 text-[15px] font-medium">{m.title}</p>
                      <p className="mt-0.5 text-[13px] text-mute">{m.org ?? ''} · {fmtDate(new Date(m.opened_at))} · 투찰률 {m.rate}%</p>
                    </li>
                  ))}
                </ul>
                <Link href="/calculator" className="mt-3 inline-flex items-center text-[15px] font-semibold text-brand">투찰 전에 하한 구간 계산하기<ChevronRight className="h-4 w-4" /></Link>
              </>
            ) : <p className="text-[15px] text-mute">하한선 미달로 빠진 공고가 없어요</p>}
          </Card>
        </div>

        <p className="px-1 text-[13px] leading-relaxed text-mute">
          나라장터 개찰 결과로 만든 참고 정보예요. 낙찰 여부는 최종낙찰자 기준이고, 수집되지 않은 기간·공고는 빠질 수 있어요.
          {r.detailed !== undefined && r.detailed < total && ` 지금은 ${total.toLocaleString()}건 중 ${r.detailed.toLocaleString()}건만 투찰 순위까지 받아서, 아깝게 놓친 공고·하한선 미달은 일부만 보여요.`}
        </p>
      </div>
    );
  }

  return (
    <Shell wide>
      <Header />
      <main className="space-y-4 px-5 pb-28 lg:px-0 lg:pb-0">
        <PageTitle title="우리 회사 입찰 분석" sub={`${profile.corpName ? `${profile.corpName} · ` : ''}나라장터 개찰 결과 기준`} />
        {body}
      </main>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="회사를 확인하면 입찰 성적표를 바로 보여드려요." onDone={() => setSignup(false)} />
    </Shell>
  );
}

function Stat({ label, value, unit, tone = 'text-ink' }: { label: string; value: string; unit?: string; tone?: string }) {
  return (
    <div className="rounded-box bg-white px-4 py-4 lg:px-6 lg:py-5">
      <p className="text-[13px] text-mute lg:text-[14px]">{label}</p>
      <p className={`mt-1 text-[22px] font-bold lg:text-[28px] ${tone}`}>{value}{unit && <span className="ml-0.5 text-[14px] font-medium text-mute">{unit}</span>}</p>
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-mute">{k}</dt><dd className="font-semibold">{v}</dd></div>;
}

function Empty({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="rounded-box bg-white px-6 py-12 text-center">
      <h2 className="text-[20px] font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-[440px] text-[15px] leading-relaxed text-sub">{text}</p>
      <div className="mx-auto mt-6 max-w-[360px]">{children}</div>
    </section>
  );
}
