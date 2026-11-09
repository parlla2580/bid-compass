'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, ChevronDown, CircleAlert, Lock, X } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { Card } from '@/components/layout';
import { CTA_PRIMARY, CTA_SOFT } from '@/components/ui';
import { IndustryPicker, LocationPicker } from '@/components/inputs';
import { SignupSheet } from '@/components/signup-sheet';
import { Term } from '@/components/term';
import type { Industry, Notice } from '@/lib/data';
import { fmtDate, fmtDateTime, fmtShort, fmtWon } from '@/lib/format';
import { MANUAL_CHECKS, awardInfo, eligibilitySummary, judge, lawGuess, type ProfileNeed, type Reason, type Status } from '@/lib/judge';
import { fetchLatestOrder, fetchNotice, fetchSimilarContracts, type SimilarContract } from '@/lib/notices';
import { fetchNoticeExtra, fetchPastStats, type NoticeExtra, type PastStats } from '@/lib/briefing';
import { prepareHistory, similarity } from '@/lib/analysis';
import { fitScore, type Fit } from '@/lib/fit';
import { productMatch } from '@/lib/match';
import { useStore } from '@/lib/store';
import type { TermKey } from '@/lib/terms';

/*
 * S4. 공고 상세 (v3 — 모바일·데스크탑 투트랙)
 * 원칙: 포인트 1색 + 회색, 카드당 핵심 한 줄, 숫자는 크게, 설명은 눌러서 보기,
 *       모바일은 요약 후 펼치기 / 데스크탑은 펼친 상태로 여러 칸
 */

const HEADLINE: Record<Status, { text: string; dot: string; tone: string }> = {
  eligible: { text: '참여할 수 있어요', dot: 'bg-ok', tone: 'text-ok' },
  check: { text: '확인이 필요해요', dot: 'bg-warn', tone: 'text-warn' },
  ineligible: { text: '참여할 수 없어요', dot: 'bg-bad', tone: 'text-bad' },
};

const CONTRACT_TERMS = ['일반경쟁', '제한경쟁', '지명경쟁', '수의계약'];
const dday = (d: number) => (d < 0 ? '마감' : d === 0 ? '오늘 마감' : `D-${d}`);

export default function NoticeDetail({ id }: { id: number }) {
  const { notices, loaded } = useStore();
  const cached = notices?.find((n) => n.id === id) ?? null;
  const [notice, setNotice] = useState<Notice | null>(cached);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>(cached ? 'ok' : 'loading');

  useEffect(() => {
    if (cached) { setNotice(cached); setState('ok'); return; }
    fetchNotice(id).then((n) => { setNotice(n); setState(n ? 'ok' : 'missing'); }).catch(() => setState('missing'));
  }, [id, cached]);

  if (state === 'loading' || !loaded) return <Skeleton />;
  if (!notice) {
    return (
      <main className="px-5 pt-16 text-center">
        <p className="text-[15px] text-sub">공고를 찾을 수 없어요. 삭제됐거나 주소가 잘못됐을 수 있어요.</p>
        <Link href="/bids" className="mt-3 inline-block text-[15px] font-semibold text-brand">공고 목록으로</Link>
      </main>
    );
  }
  return <Detail n={notice} />;
}

function Detail({ n }: { n: Notice }) {
  const { profile, saved, toggleSaved, account, loaded, history } = useStore();
  // 가입 전에는 상세를 흐리게 보여주고 가입 안내 (기획 v2.2)
  const gated = loaded && !account;
  const toast = useToast();
  const [signup, setSignup] = useState(false);
  const j = judge(n, profile);
  const fit = fitScore(n, profile, j, history.length ? similarity(n, prepareHistory(history)) : null, history, productMatch(n, profile.products));
  const closed = n.d < 0;
  const on = saved.includes(n.id);
  const save = () => toast(toggleSaved(n.id) ? '저장했어요' : '저장을 취소했어요');
  const onSave = () => (account ? save() : setSignup(true));

  const q = new URLSearchParams({ type: n.type, from: String(n.id) });
  if (n.basePrice) q.set('base', String(n.basePrice));
  if (n.reserveMax !== null) q.set('range', String(Math.abs(n.reserveMax)));
  if (n.floorRate !== null) q.set('rate', String(n.floorRate));
  const calc = `/calculator?${q}`;

  return (
    <main className="px-5 pb-32 lg:px-0 lg:pb-0">
      <Hero n={n} />
      <OrderNotice n={n} />

      {gated && <SignupGate onSignup={() => setSignup(true)} />}
      <div aria-hidden={gated || undefined}
        className={`mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 ${gated ? 'pointer-events-none max-h-[60vh] select-none overflow-hidden blur-[6px]' : ''}`}>
        <div className="space-y-3 lg:space-y-4">
          <Briefing n={n} />
          {!closed && <Judgment reasons={j.reasons} status={j.status} fit={fit} />}
          <Explain n={n} />
          <Info n={n} />
          <Similar n={n} />
        </div>

        {/* 데스크탑 오른쪽 고정 패널 */}
        <aside className="sticky top-6 hidden space-y-3 lg:block">
          <Card>
            {!closed && (
              <p className={`flex items-center gap-2 text-[15px] font-semibold ${HEADLINE[j.status].tone}`}>
                <span className={`h-2 w-2 rounded-full ${HEADLINE[j.status].dot}`} />{HEADLINE[j.status].text}
              </p>
            )}
            <dl className="mt-4 space-y-3 text-[15px]">
              <Row k="마감" v={<>{fmtDateTime(n.closesAt)} <b className={n.d <= 3 ? 'text-bad' : 'text-brand'}>{dday(n.d)}</b></>} />
              <Row k="추정가격" v={n.estPrice ? fmtWon(n.estPrice) : '미공개'} />
              <Row k="낙찰하한율" v={n.floorRate ? `${n.floorRate}%` : '–'} />
            </dl>
            <div className="mt-6 space-y-2">
              <Link href={calc} className={CTA_PRIMARY}>투찰금액 계산하기</Link>
              <button type="button" onClick={onSave} aria-pressed={on} className={CTA_SOFT}>
                <Bookmark className={`h-5 w-5 ${on ? 'fill-brand text-brand' : ''}`} />{on ? '저장됨' : '저장하기'}
              </button>
            </div>
          </Card>
          <Original n={n} />
        </aside>
      </div>

      {/* 모바일 하단 고정 버튼 */}
      {!gated && <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-6 lg:hidden">
        <button type="button" onClick={onSave} aria-pressed={on} aria-label={on ? '저장됨' : '저장하기'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-cta bg-white text-sub active:scale-[.98]">
          <Bookmark className={`h-6 w-6 ${on ? 'fill-brand text-brand' : ''}`} />
        </button>
        <Link href={calc} className={CTA_PRIMARY}>투찰금액 계산하기</Link>
      </div>}

      <SignupSheet open={signup} onClose={() => setSignup(false)}
        reason={gated ? '가입하면 이 공고의 판정 근거, 경쟁·낙찰률, 지난 계약 업체와 금액을 바로 볼 수 있어요.' : '공고를 저장하려면 가입이 필요해요.'}
        onDone={() => { setSignup(false); if (!gated) save(); }} />
    </main>
  );
}

/** 취소·변경된 공고 안내 — 같은 공고번호의 마지막 차수를 확인 */
function OrderNotice({ n }: { n: Notice }) {
  const [latest, setLatest] = useState<{ id: number; bidOrd: string; kind: string | null } | null>(null);
  useEffect(() => { fetchLatestOrder(n.bidNo).then(setLatest).catch(() => setLatest(null)); }, [n.bidNo]);
  const cancelled = /취소/.test(n.kind ?? '') || (!!latest && /취소/.test(latest.kind ?? ''));
  const newer = latest && latest.id !== n.id && !/취소/.test(latest.kind ?? '');
  if (!cancelled && !newer) return null;
  return (
    <div className="mt-4 rounded-box bg-white px-5 py-4 text-[15px]">
      {cancelled
        ? <p><b className="font-semibold text-bad">취소된 공고예요.</b> <span className="text-sub">나라장터에서 취소공고가 올라왔어요. 입찰에 참여할 수 없어요.</span></p>
        : <p className="text-sub"><b className="font-semibold text-ink">변경된 공고가 있어요.</b> <Link href={`/bids/${latest!.id}`} className="font-semibold text-brand">최신 공고 보기 →</Link></p>}
    </div>
  );
}

/** 가입 전: 상세 위에 띄우는 가입 안내 */
function SignupGate({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="relative z-10 mt-6 rounded-box bg-white px-6 py-8 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-brand"><Lock className="h-5 w-5" /></span>
      <h2 className="mt-4 text-[20px] font-bold">가입하고 자세히 보세요</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-sub">우리 회사가 참여할 수 있는지, 왜 그런지<br />지난번엔 누가 얼마에 계약했는지까지 보여드려요</p>
      <button type="button" onClick={onSignup} className={`${CTA_PRIMARY} mx-auto mt-6 max-w-[360px]`}>1분 만에 가입하기</button>
      <Link href="/login" className="mt-4 inline-block text-[14px] text-mute">이미 가입했어요 · 로그인</Link>
    </section>
  );
}

/* ---------- 상단 요약: 제목 + 큰 숫자 ---------- */
function Hero({ n }: { n: Notice }) {
  const stats = [
    { k: '마감까지', v: dday(n.d), tone: n.d >= 0 && n.d <= 3 ? 'text-bad' : 'text-ink', sub: fmtDateTime(n.closesAt) },
    { k: '추정가격', v: n.estPrice ? `${fmtShort(n.estPrice)}원` : '미공개', tone: 'text-ink', sub: n.estPrice ? fmtWon(n.estPrice) : '공고에서 공개하지 않음' },
    { k: '기초금액', v: n.basePrice ? `${fmtShort(n.basePrice)}원` : '–', tone: 'text-ink', sub: n.basePrice ? fmtWon(n.basePrice) : '아직 공개 전', desk: true },
    { k: '낙찰하한율', v: n.floorRate ? `${n.floorRate}%` : '–', tone: 'text-ink', sub: n.reserveMax !== null ? `예비가격 ±${Math.abs(n.reserveMax)}%` : '', desk: true },
  ];
  return (
    <section className="pt-1">
      <p className="text-[14px] text-mute">{n.type} · {n.demandOrg && n.demandOrg !== n.org ? n.demandOrg : n.org}{n.isNew && <span className="ml-1.5 font-semibold text-brand">새 공고</span>}</p>
      <h1 className="mt-1.5 text-[22px] font-bold leading-[1.4] tracking-[-0.01em] lg:text-[28px]">{n.title}</h1>
      <div className="mt-5 grid grid-cols-2 gap-2 lg:mt-6 lg:grid-cols-4 lg:gap-3">
        {stats.map((s) => (
          <div key={s.k} className={`rounded-box bg-white px-4 py-4 lg:px-5 ${s.desk ? 'hidden lg:block' : ''}`}>
            <p className="text-[13px] text-mute">{s.k}</p>
            <p className={`mt-1 text-[22px] font-bold tracking-tight lg:text-[26px] ${s.tone}`}>{s.v}</p>
            <p className="mt-0.5 hidden truncate text-[13px] text-mute lg:block">{s.sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 참여 가능 판정 ---------- */
function Judgment({ status, reasons, fit }: { status: Status; reasons: Reason[]; fit: Fit | null }) {
  const [more, setMore] = useState(false);
  const h = HEADLINE[status];
  return (
    <Card>
      <p className="text-[13px] text-mute">우리 회사 기준</p>
      <p className={`mt-1 flex items-center gap-2 text-[20px] font-bold ${h.tone}`}>
        <span className={`h-2.5 w-2.5 rounded-full ${h.dot}`} />{h.text}
      </p>
      <ul className="mt-4 space-y-3">
        {reasons.map((r) => (
          <li key={r.rule}>
            <div className="flex items-start gap-2.5 text-[15px] leading-relaxed">
              <ReasonIcon r={r} />
              <span className={r.result === 'pass' ? 'text-sub' : 'font-medium text-ink'}>{r.text}</span>
            </div>
            {r.result === 'check' && r.need && <InlineInput need={r.need} />}
          </li>
        ))}
      </ul>
      {fit && <FitBlock fit={fit} />}
      <div className="mt-5 border-t border-line pt-4">
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
          className="flex w-full items-center justify-between text-[14px] text-sub lg:pointer-events-none">
          원문에서 직접 확인할 항목 {MANUAL_CHECKS.length}개
          <ChevronDown className={`h-4 w-4 text-mute transition lg:hidden ${more ? 'rotate-180' : ''}`} />
        </button>
        <ul className={`mt-3 space-y-1.5 text-[14px] text-mute ${more ? '' : 'hidden lg:block'}`}>
          {MANUAL_CHECKS.map((m) => <li key={m}>· {m}</li>)}
          <li className="pt-1 text-[13px]">판정은 지역·업종 조건만 비교한 결과예요.</li>
        </ul>
      </div>
    </Card>
  );
}

/** 적합도 — 우리 회사와 맞는 정도 + 근거 */
function FitBlock({ fit }: { fit: Fit }) {
  const mark = { good: 'text-ok', mid: 'text-warn', low: 'text-mute' } as const;
  const sym = { good: '✓', mid: '△', low: '–' } as const;
  return (
    <div className="mt-5 rounded-2xl bg-fill p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px] text-sub">우리 회사와 맞는 정도</p>
        <p className="text-[24px] font-bold text-brand">{fit.score}<span className="text-[15px]">%</span></p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-brand" style={{ width: `${fit.score}%` }} /></div>
      <ul className="mt-3 space-y-1.5 text-[14px]">
        {fit.factors.map((f) => (
          <li key={f.key} className="flex gap-2">
            <span className={`w-4 shrink-0 text-center font-bold ${mark[f.mark]}`}>{sym[f.mark]}</span>
            <span className="w-16 shrink-0 text-mute">{f.label}</span>
            <span className="text-sub">{f.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-mute">낙찰 확률이 아니라, 귀사 정보·이력과 공고가 얼마나 맞는지예요. 정보를 더 넣을수록 정확해져요.</p>
    </div>
  );
}

/* ---------- 이 공고 브리핑 ---------- */
const dt = (s: string | null) => (s ? s.slice(5, 16).replace('-', '.').replace(' ', ' ') : null);
const daysUntil = (s: string) => Math.ceil((new Date(s.replace(' ', 'T') + '+09:00').getTime() - Date.now()) / 86400e3);

function Briefing({ n }: { n: Notice }) {
  const [extra, setExtra] = useState<NoticeExtra | null>(null);
  const [past, setPast] = useState<PastStats | null | undefined>(undefined);
  useEffect(() => {
    fetchNoticeExtra(n.id).then(setExtra).catch(() => setExtra(null));
    fetchPastStats(n).then(setPast).catch(() => setPast(null));
  }, [n]);

  const lines: { k: string; v: React.ReactNode }[] = [];
  if (past) {
    const where = past.basis === 'org' ? `이 기관의 지난 ${n.type} 공고` : '이름이 비슷한 지난 공고';
    if (past.medianParticipants) {
      const range = past.minParticipants !== past.maxParticipants ? `${past.minParticipants!.toLocaleString()}~${past.maxParticipants!.toLocaleString()}개사, ` : '';
      lines.push({ k: '경쟁', v: <>{where}에는 보통 <b className="font-semibold text-ink">{past.medianParticipants.toLocaleString()}개사</b>가 들어왔어요 <span className="text-mute">({range}{past.count}건 기준)</span></> });
    }
    if (past.rateLow && past.rateHigh) lines.push({ k: '낙찰률', v: <>낙찰자는 주로 <b className="font-semibold text-ink">{past.rateLow}~{past.rateHigh}%</b>에 썼어요 <span className="text-mute">({past.rateCount}건, 참고)</span></> });
  }
  if (extra?.qualifyBy) {
    const d = daysUntil(extra.qualifyBy);
    lines.push({ k: '등록 마감', v: <>입찰참가자격 등록 <b className={`font-semibold ${d >= 0 && d <= 2 ? 'text-bad' : 'text-ink'}`}>{dt(extra.qualifyBy)}</b>까지</> });
  }
  if (extra?.bidBegin) lines.push({ k: '투찰', v: <>{dt(extra.bidBegin)} ~ {fmtDateTime(n.closesAt).slice(5)}</> });
  if (extra?.openAt) lines.push({ k: '개찰', v: dt(extra.openAt) });
  const cond = [
    extra?.reNotice && '재공고',
    extra?.joint && extra.joint.replace(/공동수급/, '공동수급 '),
    extra?.reserveTotal && extra.reserveDraw && `복수예가 ${extra.reserveTotal}개 중 ${extra.reserveDraw}개 추첨`,
  ].filter(Boolean) as string[];
  if (cond.length) lines.push({ k: '조건', v: cond.join(' · ') });

  return (
    <Card title="이 공고 브리핑">
      {past === undefined && !extra ? <div className="h-20 animate-pulse rounded-2xl bg-fill" /> : (
        <>
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.k} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="w-[72px] shrink-0 text-mute">{l.k}</span><span className="text-sub">{l.v}</span>
              </li>
            ))}
          </ul>
          {past === null && <p className="mt-3 text-[13px] text-mute">비슷한 과거 개찰 결과가 아직 적어서 경쟁·낙찰률은 보여드리지 못해요. 데이터가 쌓이면 채워져요.</p>}
        </>
      )}
    </Card>
  );
}

function ReasonIcon({ r }: { r: Reason }) {
  const base = 'mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full';
  if (r.result === 'pass') return <span className={`${base} bg-fill text-sub`}><Check className="h-3 w-3" strokeWidth={3} /></span>;
  if (r.result === 'fail') return <span className={`${base} bg-bad text-white`}><X className="h-3 w-3" strokeWidth={3} /></span>;
  return <CircleAlert className="mt-[3px] h-[18px] w-[18px] shrink-0 text-warn" />;
}

function InlineInput({ need }: { need: ProfileNeed }) {
  const { profile, updateProfile } = useStore();
  const toast = useToast();
  const [ind, setInd] = useState<Industry[]>(profile.industries ?? []);
  const box = 'ml-7 mt-2.5 rounded-2xl bg-fill p-3';
  if (need === 'location' || need === 'sigungu') {
    return (
      <div className={box}>
        <LocationPicker value={profile.location} onChange={(v) => { updateProfile({ location: v }); if (v?.includes(' ')) toast('소재지로 다시 판정했어요'); }} />
      </div>
    );
  }
  return (
    <div className={`${box} space-y-2`}>
      <IndustryPicker value={ind} onChange={setInd} />
      <button type="button" disabled={!ind.length} onClick={() => { updateProfile({ industries: ind }); toast('업종으로 다시 판정했어요'); }}
        className="h-11 w-full rounded-xl bg-ink text-[15px] font-semibold text-white disabled:bg-line disabled:text-mute">저장하고 다시 판정</button>
    </div>
  );
}

/* ---------- 공고 해설 ---------- */
function Explain({ n }: { n: Notice }) {
  const a = awardInfo(n.award);
  const law = lawGuess(n);
  const items = [
    { k: '누가 참여하나', v: n.contract, d: eligibilitySummary(n), term: CONTRACT_TERMS.includes(n.contract) ? n.contract as TermKey : null },
    { k: '어떻게 뽑나', v: a.label, d: a.desc, term: a.label === '적격심사' ? '적격심사' as TermKey : null },
    { k: '적용 법률', v: law ? law.replace(/\(.*\)/, '') : '공고문 확인', d: law ? '발주기관으로 추정했어요' : '발주기관으로 추정할 수 없어요', term: null },
  ];
  return (
    <Card title="한눈에 보는 공고">
      <dl className="grid gap-4 lg:grid-cols-3 lg:gap-6">
        {items.map((it) => (
          <div key={it.k}>
            <dt className="text-[13px] text-mute">{it.k}</dt>
            <dd className="mt-1 text-[16px] font-semibold">{it.term ? <Term k={it.term}>{it.v}</Term> : it.v}</dd>
            {it.d && <dd className="mt-0.5 text-[14px] leading-relaxed text-sub">{it.d}</dd>}
          </div>
        ))}
      </dl>
    </Card>
  );
}

/* ---------- 공고 정보: 모바일 1열 / 데스크탑 2열, 모두 표시 ---------- */
function Info({ n }: { n: Notice }) {
  const rows: [React.ReactNode, React.ReactNode][] = [
    ['공고기관', n.org],
    ['입찰마감', fmtDateTime(n.closesAt)],
    [<Term key="e" k="추정가격" />, n.estPrice ? fmtWon(n.estPrice) : '미공개'],
    [<Term key="b" k="기초금액" />, n.basePrice ? fmtWon(n.basePrice) : '아직 공개 전'],
    ['참가자격', eligibilitySummary(n)],
    ...(n.demandOrg && n.demandOrg !== n.org ? [['수요기관', n.demandOrg] as [string, string]] : []),
    ['계약방식', n.contract],
    ['낙찰방식', n.award],
    ...(n.floorRate ? [[<Term key="f" k="낙찰하한율" />, `${n.floorRate}%`] as [React.ReactNode, string]] : []),
    ...(n.productName ? [['세부품명', n.productName] as [string, string]] : []),
    ['공고번호', `${n.bidNo}-${n.bidOrd}`],
  ];
  return (
    <Card title="공고 정보">
      <dl className="grid lg:grid-cols-2 lg:gap-x-10">
        {rows.map(([k, v], i) => (
          <div key={i} className={`flex justify-between gap-4 border-b border-line py-3 text-[15px] last:border-0 lg:[&:nth-last-child(2)]:border-0 `}>
            <dt className="shrink-0 text-mute">{k}</dt>
            <dd className="break-all text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 lg:hidden"><OriginalLink n={n} /></div>
    </Card>
  );
}

function OriginalLink({ n }: { n: Notice }) {
  if (!n.url) return <p className="text-center text-[14px] text-mute">원문 링크가 없는 공고예요</p>;
  return (
    <a href={n.url} target="_blank" rel="noopener noreferrer"
      className="flex h-12 w-full items-center justify-center gap-1 rounded-cta bg-fill text-[15px] font-semibold text-sub hover:bg-line">
      나라장터 원문 보기<ArrowUpRight className="h-4 w-4" />
    </a>
  );
}

/** 데스크탑 오른쪽: 원문 */
function Original({ n }: { n: Notice }) {
  return (
    <Card>
      <p className="text-[15px] font-semibold">공고 원문</p>
      <p className="mt-1 text-[13px] leading-relaxed text-mute">새 창으로 열려요. 첨부파일(공고문·과업내용서)은 원문에서 받을 수 있어요.</p>
      <div className="mt-4"><OriginalLink n={n} /></div>
    </Card>
  );
}

/* ---------- 유사 계약: 모바일 3건 목록 / 데스크탑 표 ---------- */
function Similar({ n }: { n: Notice }) {
  const [items, setItems] = useState<SimilarContract[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { fetchSimilarContracts(n).then(setItems).catch(() => setItems([])); }, [n]);
  const corp = (c: SimilarContract) => c.corps.map((x) => x.name).filter(Boolean).join(', ') || '–';

  return (
    <Card title="지난번엔 누가 얼마에 계약했나" aside={items?.length ? <span className="text-[14px] text-mute">{items.length}건</span> : null}>
      <p className="-mt-2 mb-3 text-[14px] leading-relaxed text-mute">이 기관이 예전에 같은 종류의 일을 어느 업체에 얼마에 맡겼는지 보여드려요</p>
      {!items && <div className="h-16 animate-pulse rounded-2xl bg-fill" />}
      {items && !items.length && <p className="text-[15px] text-mute">아직 찾지 못했어요. 계약 정보는 2026년 11월부터 모으고 있어서, 시간이 지나면 채워져요.</p>}
      {items && items.length > 0 && (
        <>
          {/* 모바일 */}
          <ul className="lg:hidden">
            {(all ? items : items.slice(0, 3)).map((c) => (
              <li key={c.id} className="border-b border-line py-3 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-[15px] font-medium">{c.title}</p>
                  <p className="shrink-0 text-[15px] font-semibold">{c.amount ? `${fmtShort(c.amount)}원` : '–'}</p>
                </div>
                <p className="mt-0.5 truncate text-[13px] text-mute">{corp(c)} · {c.contractDate ? fmtDate(new Date(c.contractDate)) : '날짜 미상'}</p>
              </li>
            ))}
          </ul>
          {items.length > 3 && (
            <button type="button" onClick={() => setAll(!all)} className="mt-1 flex w-full items-center justify-center gap-1 py-2 text-[14px] font-medium text-sub lg:hidden">
              {all ? '접기' : `${items.length - 3}건 더 보기`}<ChevronDown className={`h-4 w-4 transition ${all ? 'rotate-180' : ''}`} />
            </button>
          )}
          {/* 데스크탑 */}
          <table className="hidden w-full text-[14px] lg:table">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-mute">
                <th className="pb-2.5 font-medium">계약일</th><th className="pb-2.5 font-medium">계약명</th>
                <th className="pb-2.5 font-medium">계약업체</th><th className="pb-2.5 font-medium">방법</th><th className="pb-2.5 text-right font-medium">금액</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="whitespace-nowrap py-3 pr-4 text-sub">{c.contractDate ? fmtDate(new Date(c.contractDate)) : '–'}</td>
                  <td className="max-w-[280px] truncate py-3 pr-4 font-medium" title={c.title}>{c.title}</td>
                  <td className="max-w-[160px] truncate py-3 pr-4 text-sub">{corp(c)}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-sub">{c.method ?? '–'}</td>
                  <td className="whitespace-nowrap py-3 text-right font-semibold">{c.amount ? fmtWon(c.amount) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3"><dt className="text-mute">{k}</dt><dd className="text-right font-medium">{v}</dd></div>;
}

function Skeleton() {
  return (
    <main className="space-y-3 px-5 pt-4 lg:px-0">
      <div className="h-8 w-2/3 animate-pulse rounded-xl bg-white" />
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-box bg-white" />)}
    </main>
  );
}
