'use client';

import Link from 'next/link';
import { COPY } from '@/lib/copy';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, ChevronDown, CircleAlert, Lock, X } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { Card } from '@/components/layout';
import { CTA_PRIMARY, CTA_SOFT } from '@/components/ui';
import { IndustryPicker, LocationPicker } from '@/components/inputs';
import { SignupSheet } from '@/components/signup-sheet';
import { Term } from '@/components/term';
import { Tip } from '@/components/tip';
import { SIZES, baseStatus, calcHref, looksUnitPrice, type Industry, type Notice } from '@/lib/data';
import { fmtDate, fmtDateTime, fmtShort, fmtWon } from '@/lib/format';
import { MANUAL_CHECKS, awardInfo, eligibilitySummary, judge, lawGuess, type ProfileNeed, type Reason, type Status } from '@/lib/judge';
import { fetchLatestOrder, fetchNotice, fetchSimilarContracts, type SimilarContract } from '@/lib/notices';
import { fetchNoticeExtra, fetchPastStats, type NoticeExtra, type PastStats } from '@/lib/briefing';
import { prepareHistory, similarity } from '@/lib/analysis';
import { fitScore, type Fit } from '@/lib/fit';
import { productMatch } from '@/lib/match';
import { useSeen } from '@/lib/seen';
import { ItemPrices } from '@/components/item-prices';
import { noticeAward, awardTone } from '@/lib/award';
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
  const { markSeen } = useSeen();
  useEffect(() => { markSeen(id); }, [id, markSeen]);

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
  const { profile, saved, toggleSaved, account, loaded, history, competition, stats } = useStore();
  // 가입 전: 참여 판정·이유·공고 정보·원문·계산기는 그대로, 경쟁·낙찰률·지난 계약·저장만 가입 후 (2026-11-16 초심자 점검)
  //  가린 내용은 화면에 아예 그리지 않음 (흐림 처리만 하면 페이지 소스로 보임)
  const gated = loaded && !account;
  const toast = useToast();
  const [signup, setSignup] = useState(false);
  const j = judge(n, profile);
  const fit = fitScore(n, profile, j, history.length ? similarity(n, prepareHistory(history), stats) : null, history, productMatch(n, profile.products, stats), competition, stats);
  const closed = n.d < 0;
  const on = saved.includes(n.id);
  // 기초금액 상태 — 공개 전이면 저장 = 공개 알림, 비예가면 계산기 대신 공고문 (2026-11-18)
  const bst = baseStatus(n);
  const save = () => toast(toggleSaved(n.id) ? (bst === 'pending' && !closed ? '저장했어요. 기초금액이 나오면 알려 드릴게요' : '저장했어요') : '저장을 취소했어요');
  const [saveAfter, setSaveAfter] = useState(false);
  const onSave = () => { if (account) save(); else { setSaveAfter(true); setSignup(true); } };

  const calc = calcHref(n);
  const calcLabel = bst === 'pending' ? '기초금액 공개 전 · 미리 계산' : '투찰금액 계산하기';
  // 비예가는 사정률 계산 대상이 아님 → 공고문으로
  const primary = bst === 'noDraw' || bst === 'catalog'
    ? (n.url ? <a href={n.url} target="_blank" rel="noopener noreferrer" className={CTA_PRIMARY}>{bst === 'catalog' ? '공고문에서 계약 조건 보기' : '공고문에서 가격 평가 보기'}</a> : null)
    : <Link href={calc} className={CTA_PRIMARY}>{calcLabel}</Link>;

  return (
    <main className="px-5 pb-32 lg:px-0 lg:pb-0">
      <Hero n={n} />
      <OrderNotice n={n} />

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-3 lg:space-y-4">
          {!closed && <Judgment reasons={j.reasons} status={j.status} fit={fit} />}
          <Briefing n={n} locked={gated} onSignup={() => setSignup(true)} />
          <ItemPrices n={n} locked={gated} onSignup={() => setSignup(true)} />
          <Info n={n} />
          {gated ? <SignupGate onSignup={() => setSignup(true)} /> : <Similar n={n} />}
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
            {bst === 'pending' && !closed && <p className="mt-4 rounded-xl bg-brand-soft px-3.5 py-3 text-[13px] leading-relaxed text-sub"><b className="font-semibold text-ink">기초금액은 아직 공개 전이에요.</b> 저장해 두면 공개될 때 알려 드려요.</p>}
            {bst === 'noDraw' && <p className="mt-4 rounded-xl bg-fill px-3.5 py-3 text-[13px] leading-relaxed text-sub">예정가격을 추첨하지 않는 <b className="font-semibold text-ink">비예가</b> 공고라 투찰금액 계산 대상이 아니에요.</p>}
            <div className="mt-6 space-y-2">
              {primary}
              <button type="button" onClick={onSave} aria-pressed={on} className={CTA_SOFT}>
                <Bookmark className={`h-5 w-5 ${on ? 'fill-brand text-brand' : ''}`} />{on ? '저장됨' : '저장하기'}
              </button>
            </div>
          </Card>
          <Original n={n} />
        </aside>
      </div>

      {/* 모바일 하단 고정 버튼 */}
      {<div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-6 lg:hidden">
        <button type="button" onClick={onSave} aria-pressed={on} aria-label={on ? '저장됨' : '저장하기'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-cta bg-white text-sub active:scale-[.98]">
          <Bookmark className={`h-6 w-6 ${on ? 'fill-brand text-brand' : ''}`} />
        </button>
        {primary}
      </div>}

      <SignupSheet open={signup} onClose={() => { setSignup(false); setSaveAfter(false); }}
        reason={saveAfter ? '공고를 저장하려면 가입이 필요해요. 마감 전에 알려드려요.' : '가입하면 경쟁·낙찰률·지난 계약을 보고, 공고를 저장할 수 있어요.'}
        onDone={() => { setSignup(false); if (saveAfter) { setSaveAfter(false); save(); } }} />
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

/** 가입 전: 지난 계약 자리에 두는 가입 안내 (내용은 그리지 않음) */
function SignupGate({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="rounded-box bg-white px-6 py-7 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-soft text-brand"><Lock className="h-5 w-5" /></span>
      <h2 className="mt-3 text-[18px] font-bold">지난번엔 누가 얼마에 계약했을까요?</h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-sub">가입하면 이 기관의 지난 계약·경쟁·낙찰률을 보고<br />공고를 저장해 마감 알림을 받을 수 있어요</p>
      <button type="button" onClick={onSignup} className={`${CTA_PRIMARY} mx-auto mt-5 max-w-[360px]`}>1분 만에 가입하기</button>
      <Link href="/login" className="mt-3 inline-block text-[14px] text-mute">이미 가입했어요 · 로그인</Link>
    </section>
  );
}

/* ---------- 상단 요약: 제목 + 큰 숫자 ---------- */
function Hero({ n }: { n: Notice }) {
  const award = noticeAward(n);
  const stats = [
    { k: '마감까지', v: n.d > 365 ? '장기 접수' : dday(n.d), tone: n.d >= 0 && n.d <= 3 ? 'text-bad' : 'text-ink', sub: fmtDateTime(n.closesAt) },
    { k: '추정가격', v: n.estPrice ? `${fmtShort(n.estPrice)}원` : '미공개', tone: 'text-ink', sub: n.estPrice ? fmtWon(n.estPrice) : '공고에서 공개하지 않음' },
    { k: '기초금액', v: n.basePrice ? `${fmtShort(n.basePrice)}원` : '–', tone: 'text-ink', sub: n.basePrice ? fmtWon(n.basePrice) : '아직 공개 전', desk: true },
    { k: '낙찰하한율', v: n.floorRate ? `${n.floorRate}%` : '–', tone: 'text-ink', sub: n.reserveMax !== null ? `예비가격 ±${Math.abs(n.reserveMax)}%` : '', desk: true },
  ];
  return (
    <section className="pt-1">
      <p className="text-[14px] text-mute">{n.type} · {n.demandOrg && n.demandOrg !== n.org ? n.demandOrg : n.org}{n.isNew && <span className="ml-1.5 font-semibold text-brand">새 공고</span>}</p>
      <h1 className="mt-1.5 text-[22px] font-bold leading-[1.4] tracking-[-0.01em] lg:text-[28px]">{n.title}</h1>
      {award && (
        <p className="mt-2 flex items-start gap-2 text-[14px] text-sub">
          <span className={`shrink-0 rounded px-1.5 py-px text-[13px] font-semibold ${awardTone(award.kind)}`}>{award.label}</span>
          <span>{award.desc}</span>
        </p>
      )}
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
            {r.need && (r.result === 'check' || r.need === 'size') && <InlineInput need={r.need} />}
          </li>
        ))}
      </ul>
      {fit && <FitBlock fit={fit} />}
      <div className="mt-5 border-t border-line pt-4">
        <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
          className="flex w-full items-center justify-between text-[14px] text-sub lg:pointer-events-none">
          원문 확인 항목 {MANUAL_CHECKS.length}개
          <ChevronDown className={`h-4 w-4 text-mute transition lg:hidden ${more ? 'rotate-180' : ''}`} />
        </button>
        <ul className={`mt-3 space-y-1.5 text-[14px] text-mute ${more ? '' : 'hidden lg:block'}`}>
          {MANUAL_CHECKS.map((m) => <li key={m}>· {m}</li>)}
        </ul>
      </div>
    </Card>
  );
}

/** 맞춤 점수 — 근거는 강한 것 4개만, 나머지는 펼쳐 보기. 설명은 ⓘ로 */
const NEGATIVE = new Set(['deadline', 'type']);
function FitBlock({ fit }: { fit: Fit }) {
  const [all, setAll] = useState(false);
  const shown = fit.factors.filter((f) => f.value > 0.05 || NEGATIVE.has(f.key));
  const list = all ? shown : shown.slice(0, 4);
  return (
    <div className="mt-5 rounded-2xl bg-fill p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-[14px] text-sub">맞춤 점수<Tip title="맞춤 점수">{COPY.notWinChance} 드문 품목·업종이 맞을수록, 참여했던 공고와 비슷할수록 높아요.</Tip></p>
        <p className="text-[24px] font-bold text-brand">{fit.score}<span className="text-[15px]">%</span></p>
      </div>
      <div className="mt-2 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-brand" style={{ width: `${fit.score}%` }} /></div>
      <ul className="mt-3 space-y-1.5 text-[14px]">
        {list.map((f) => {
          const neg = NEGATIVE.has(f.key) || f.mark === 'low';
          return (
            <li key={f.key} className="flex gap-2">
              <span className={`w-4 shrink-0 text-center font-bold ${neg ? 'text-warn' : 'text-ok'}`}>{neg ? '!' : '✓'}</span>
              <span className="text-sub">{f.text}</span>
            </li>
          );
        })}
      </ul>
      {shown.length > 4 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 text-[13px] font-medium text-mute">{all ? '접기' : `근거 ${shown.length - 4}개 더`}</button>
      )}
    </div>
  );
}

/* ---------- 이 공고 브리핑 ---------- */
// 'YYYY-MM-DD HH:mm' → 'MM.DD HH:mm' (올해가 아니면 'YYYY.MM.DD HH:mm')
const dt = (s: string | null) => {
  if (!s) return null;
  const sameYear = s.slice(0, 4) === String(new Date().getFullYear());
  return (sameYear ? s.slice(5, 16) : s.slice(0, 16)).replace(/-/g, '.');
};
/** 공동수급 원문('(없음)공동수급불허', '()공동수급허용' 등) → '공동수급 불허' */
const jointLabel = (raw: string | null) => {
  const t = (raw ?? '').replace(/\([^)]*\)/g, '').replace(/\s+/g, '');
  return t ? t.replace(/^공동수급(?=\S)/, '공동수급 ') : null;
};
const daysUntil = (s: string) => Math.ceil((new Date(s.replace(' ', 'T') + '+09:00').getTime() - Date.now()) / 86400e3);

function Briefing({ n, locked = false, onSignup }: { n: Notice; locked?: boolean; onSignup?: () => void }) {
  const [extra, setExtra] = useState<NoticeExtra | null>(null);
  const [past, setPast] = useState<PastStats | null | undefined>(undefined);
  useEffect(() => {
    fetchNoticeExtra(n.id).then(setExtra).catch(() => setExtra(null));
    // 경쟁·낙찰률은 회원만 — 가입 전에는 아예 불러오지 않음
    if (locked) setPast(null); else fetchPastStats(n).then(setPast).catch(() => setPast(null));
  }, [n, locked]);

  const lines: { k: React.ReactNode; v: React.ReactNode }[] = [];
  if (locked) {
    const lock = <button type="button" onClick={onSignup} className="inline-flex items-center gap-1 font-semibold text-brand"><Lock className="h-3.5 w-3.5" />가입하면 보여요</button>;
    lines.push({ k: '경쟁', v: lock }, { k: '낙찰률', v: lock });
  } else if (past) {
    const basis = past.basis === 'org' ? `이 기관의 지난 ${n.type} 공고` : '이름이 비슷한 지난 공고';
    if (past.medianParticipants) {
      const range = past.minParticipants !== past.maxParticipants ? ` 적게는 ${past.minParticipants!.toLocaleString()}곳, 많게는 ${past.maxParticipants!.toLocaleString()}곳이었어요.` : '';
      lines.push({ k: '경쟁', v: <><b className="font-semibold text-ink">보통 {past.medianParticipants.toLocaleString()}곳</b> <span className="text-mute">· {past.count}건 기준</span> <Tip title="경쟁">{basis}에 들어온 업체 수의 중간값이에요.{range}</Tip></> });
    }
    if (past.rateLow && past.rateHigh) lines.push({ k: '낙찰률', v: <><b className="font-semibold text-ink">{past.rateLow}~{past.rateHigh}%</b> <span className="text-mute">· {past.rateCount}건</span> <Tip title="낙찰률">{basis}에서 낙찰자가 쓴 낙찰률의 가운데 절반 범위예요. 참고만 하세요.</Tip></> });
  }
  if (extra?.qualifyBy) {
    const d = daysUntil(extra.qualifyBy);
    lines.push({ k: <Tip label="참가 등록" title="입찰참가자격 등록 마감">이때까지 나라장터에 참가자격이 등록돼 있어야 투찰할 수 있어요.</Tip>, v: <b className={`font-semibold ${d >= 0 && d <= 2 ? 'text-bad' : 'text-ink'}`}>{dt(extra.qualifyBy)}까지</b> });
  }
  if (extra?.bidBegin) lines.push({ k: '투찰', v: <>{dt(extra.bidBegin)} ~ {fmtDateTime(n.closesAt).slice(5)}</> });
  if (extra?.openAt) lines.push({ k: '개찰', v: dt(extra.openAt) });
  const cond = [
    extra?.reNotice && '재공고',
    jointLabel(extra?.joint ?? null),
    extra?.reserveTotal && extra.reserveDraw ? `예비가격 ${extra.reserveTotal}개 중 ${extra.reserveDraw}개 추첨` : n.prearng && n.prearng !== '복수예가' && n.prearng,
    looksUnitPrice(n) && '단가 입찰(추정)',
  ].filter(Boolean) as string[];
  if (cond.length) lines.push({ k: '조건', v: cond.join(' · ') });

  return (
    <Card title="이 공고 브리핑">
      {past === undefined && !extra ? <div className="h-20 animate-pulse rounded-2xl bg-fill" /> : (
        <>
          <ul className="space-y-3">
            {lines.map((l, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="w-[72px] shrink-0 text-mute">{l.k}</span><span className="text-sub">{l.v}</span>
              </li>
            ))}
          </ul>
          {past === null && !locked && <p className="mt-3 text-[13px] text-mute">비교할 지난 개찰이 아직 적어요</p>}
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
  if (need === 'size') {
    return (
      <div className={`${box} flex flex-wrap gap-1.5`}>
        {SIZES.map((v) => (
          <button key={v} type="button" aria-pressed={profile.size === v} onClick={() => { updateProfile({ size: v }); toast('기업규모로 다시 판정했어요'); }}
            className={`rounded-full border px-3 py-1.5 text-[14px] font-medium ${profile.size === v ? 'border-ink bg-ink text-white' : 'border-line bg-white text-sub'}`}>{v}</button>
        ))}
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
/* ---------- 공고 정보: 모바일 1열 / 데스크탑 2열, 모두 표시 ---------- */
function Info({ n }: { n: Notice }) {
  const rows: [React.ReactNode, React.ReactNode][] = [
    ['공고기관', n.org],
    ['입찰마감', fmtDateTime(n.closesAt)],
    [<Term key="e" k="추정가격" />, n.estPrice ? fmtWon(n.estPrice) : '미공개'],
    [<Term key="b" k="기초금액" />, n.basePrice ? fmtWon(n.basePrice) : '아직 공개 전'],
    ['참가자격', eligibilitySummary(n)],
    ...(n.demandOrg && n.demandOrg !== n.org ? [['수요기관', n.demandOrg] as [string, string]] : []),
    ['계약방식', CONTRACT_TERMS.includes(n.contract) ? <Term key="c" k={n.contract as TermKey} /> : n.contract],
    // 제목 아래 배지와 같은 이름 (예: '규격가격동시입찰-…예가 내 최저가'가 '최저가'로 보이던 불일치, 2026-11-18)
    ['낙찰방식', (() => { const b = noticeAward(n); const o = awardInfo(n.award); const label = b?.label ?? o.label; const desc = b?.desc ?? o.desc;
      return <Tip key="a" label={label} title={label}>{desc ? `${desc}. ` : ''}원래 표기: {n.award}</Tip>; })()],
    ...(lawGuess(n) ? [['적용 법률', `${lawGuess(n)!.replace(/\(.*\)/, '').replace(' 적용', '')} (추정)`] as [string, string]] : []),
    ...(n.floorRate ? [[<Term key="f" k="낙찰하한율" />, `${n.floorRate}%`] as [React.ReactNode, string]] : []),
    ...(n.productName ? [['세부품명', n.productName] as [string, string]] : []),
    ['공고번호', `${n.bidNo}-${n.bidOrd}`],
  ];
  return (
    <Card title="공고 정보">
      {/* 두 칸은 넓은 화면(xl)에서만 — lg(1024~1279)에선 칸이 좁아 날짜·공고번호가 글자 단위로 꺾였음 */}
      <dl className="grid xl:grid-cols-2 xl:gap-x-10">
        {rows.map(([k, v], i) => (
          <div key={i} className={`flex justify-between gap-4 border-b border-line py-3 text-[15px] last:border-0 xl:[&:nth-last-child(2)]:border-0`}>
            <dt className="shrink-0 text-mute">{k}</dt>
            <dd className="min-w-0 break-words text-right font-medium [word-break:keep-all]">{v}</dd>
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
      onClick={(e) => {
        // 데스크탑은 팝업 창으로 (나라장터는 화면 안 삽입을 막아 팝업이 최선). 모바일·팝업 차단 시에는 새 탭
        if (!window.matchMedia('(min-width: 1024px)').matches) return;
        const w = Math.min(1280, window.screen.availWidth - 80), h = Math.min(960, window.screen.availHeight - 80);
        const left = Math.round((window.screen.availWidth - w) / 2), top = Math.round((window.screen.availHeight - h) / 2);
        const pop = window.open(n.url!, 'g2b-notice', `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`);
        if (pop) { e.preventDefault(); pop.focus(); }
      }}
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
      <p className="mt-1 text-[13px] leading-relaxed text-mute">팝업으로 열려요. 첨부파일은 원문에서 받으세요.</p>
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
  if (items && !items.length) return null; // 관련 있는 지난 계약이 없으면 카드 자체를 숨김

  return (
    <Card title={<span className="flex items-center gap-1">지난 계약<Tip title="지난 계약">{COPY.pastContracts}. 공고명의 핵심 낱말이 겹치는 계약만 보여드려요.</Tip></span>} aside={items?.length ? <span className="text-[14px] text-mute">{items.length}건</span> : null}>
      {!items && <div className="h-16 animate-pulse rounded-2xl bg-fill" />}
      {items && items.length > 0 && (
        <>
          {/* 모바일·좁은 데스크탑 — 표는 칸이 충분한 xl부터 (lg에선 계약명 칸이 0이 되어 넘쳤음) */}
          <ul className="xl:hidden">
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
            <button type="button" onClick={() => setAll(!all)} className="mt-1 flex w-full items-center justify-center gap-1 py-2 text-[14px] font-medium text-sub xl:hidden">
              {all ? '접기' : `${items.length - 3}건 더 보기`}<ChevronDown className={`h-4 w-4 transition ${all ? 'rotate-180' : ''}`} />
            </button>
          )}
          {/* 데스크탑 */}
          <table className="hidden w-full table-fixed text-[14px] xl:table">
            <colgroup><col className="w-[92px]" /><col /><col className="w-[120px]" /><col className="w-[72px]" /><col className="w-[118px]" /></colgroup>
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
                  <td className="truncate py-3 pr-4 font-medium" title={c.title}>{c.title}</td>
                  <td className="truncate py-3 pr-3 text-sub" title={corp(c) ?? undefined}>{corp(c)}</td>
                  <td className="truncate py-3 pr-3 text-sub">{c.method ?? '–'}</td>
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
