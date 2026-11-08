'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Bookmark, Check, ChevronDown, ChevronRight, CircleAlert, X } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { CTA_PRIMARY, CTA_SOFT, Card, Frame } from '@/components/frame';
import { IndustryPicker, LocationPicker } from '@/components/inputs';
import { SignupSheet } from '@/components/signup-sheet';
import { Term } from '@/components/term';
import type { Industry, Notice } from '@/lib/data';
import { fmtDate, fmtDateTime, fmtShort, fmtWon } from '@/lib/format';
import { MANUAL_CHECKS, awardInfo, eligibilitySummary, judge, lawGuess, type ProfileNeed, type Reason, type Status } from '@/lib/judge';
import { fetchNotice, fetchSimilarContracts, type SimilarContract } from '@/lib/notices';
import { useStore } from '@/lib/store';
import type { TermKey } from '@/lib/terms';

/*
 * v3 견본 — 공고 상세 (모바일·데스크탑 투트랙)
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

export default function PreviewDetail({ id }: { id: number }) {
  const { notices, loaded } = useStore();
  const cached = notices?.find((n) => n.id === id) ?? null;
  const [notice, setNotice] = useState<Notice | null>(cached);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>(cached ? 'ok' : 'loading');

  useEffect(() => {
    if (cached) { setNotice(cached); setState('ok'); return; }
    fetchNotice(id).then((n) => { setNotice(n); setState(n ? 'ok' : 'missing'); }).catch(() => setState('missing'));
  }, [id, cached]);

  return (
    <Frame title="">
      {state === 'loading' || !loaded ? <Skeleton /> : !notice ? (
        <p className="px-5 pt-16 text-center text-[15px] text-sub">공고를 찾을 수 없어요</p>
      ) : <Detail n={notice} />}
    </Frame>
  );
}

function Detail({ n }: { n: Notice }) {
  const { profile, saved, toggleSaved, account } = useStore();
  const toast = useToast();
  const [signup, setSignup] = useState(false);
  const j = judge(n, profile);
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
    <main className="mx-auto max-w-[1200px] px-5 pb-32 lg:px-10 lg:pb-16 lg:pt-10">
      {/* 데스크탑 경로 표시 */}
      <p className="mb-4 hidden items-center gap-1 text-sm text-mute lg:flex">
        <Link href="/bids" className="hover:text-sub">공고</Link><ChevronRight className="h-4 w-4" />상세
      </p>

      <Hero n={n} />

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        <div className="space-y-3 lg:space-y-4">
          {!closed && <Judgment reasons={j.reasons} status={j.status} />}
          <Explain n={n} />
          <Info n={n} />
          <Similar n={n} />
        </div>

        {/* 데스크탑 오른쪽 고정 패널 */}
        <aside className="sticky top-10 hidden space-y-3 lg:block">
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
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-5 pb-[calc(12px+env(safe-area-inset-bottom))] pt-6 lg:hidden">
        <button type="button" onClick={onSave} aria-pressed={on} aria-label={on ? '저장됨' : '저장하기'}
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-cta bg-white text-sub active:scale-[.98]">
          <Bookmark className={`h-6 w-6 ${on ? 'fill-brand text-brand' : ''}`} />
        </button>
        <Link href={calc} className={CTA_PRIMARY}>투찰금액 계산하기</Link>
      </div>

      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="공고를 저장하려면 가입이 필요해요."
        onDone={() => { setSignup(false); save(); }} />
    </main>
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
function Judgment({ status, reasons }: { status: Status; reasons: Reason[] }) {
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

/* ---------- 공고 정보: 모바일 5줄 + 펼치기 / 데스크탑 2열 전체 ---------- */
function Info({ n }: { n: Notice }) {
  const [all, setAll] = useState(false);
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
          <div key={i} className={`flex justify-between gap-4 border-b border-line py-3 text-[15px] last:border-0 lg:[&:nth-last-child(2)]:border-0 ${i >= 5 && !all ? 'hidden lg:flex' : ''}`}>
            <dt className="shrink-0 text-mute">{k}</dt>
            <dd className="break-all text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      {rows.length > 5 && (
        <button type="button" onClick={() => setAll(!all)} className="mt-2 flex w-full items-center justify-center gap-1 py-2 text-[14px] font-medium text-sub lg:hidden">
          {all ? '접기' : `${rows.length - 5}개 더 보기`}<ChevronDown className={`h-4 w-4 transition ${all ? 'rotate-180' : ''}`} />
        </button>
      )}
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
    <Card title="이 기관의 비슷한 계약" aside={items?.length ? <span className="text-[14px] text-mute">{items.length}건</span> : null}>
      {!items && <div className="h-16 animate-pulse rounded-2xl bg-fill" />}
      {items && !items.length && <p className="text-[15px] text-mute">아직 찾은 계약이 없어요. 계약 정보가 쌓이면 보여드릴게요.</p>}
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
    <main className="mx-auto max-w-[1200px] space-y-3 px-5 pt-4 lg:px-10 lg:pt-10">
      <div className="h-8 w-2/3 animate-pulse rounded-xl bg-white" />
      {[0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-box bg-white" />)}
    </main>
  );
}
