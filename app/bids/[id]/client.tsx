'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BookOpen, Bookmark, Calculator, ExternalLink, FileSearch, FileText, History, Info, Lock, ShieldCheck } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { IndustryPicker, LocationPicker } from '@/components/inputs';
import { SignupSheet } from '@/components/signup-sheet';
import { Term } from '@/components/term';
import { BTN_OUTLINE, BTN_PRIMARY, DdayBadge, NewBadge, ResultIcon, STATUS_STYLE, StatusBadge, TypeTag } from '@/components/ui';
import type { Industry, Notice } from '@/lib/data';
import { fmtDate, fmtDateTime, fmtShort, fmtWon } from '@/lib/format';
import { MANUAL_CHECKS, awardInfo, eligibilitySummary, explain, judge, type ProfileNeed } from '@/lib/judge';
import { fetchNotice, fetchSimilarContracts, type SimilarContract } from '@/lib/notices';
import { useStore } from '@/lib/store';
import type { TermKey } from '@/lib/terms';

const CONTRACT_TERMS = ['일반경쟁', '제한경쟁', '지명경쟁', '수의계약'];

export default function NoticeDetail({ id }: { id: number }) {
  const { notices, loaded, account } = useStore();
  const [signup, setSignup] = useState(false);
  const cached = notices?.find((n) => n.id === id) ?? null;
  const [notice, setNotice] = useState<Notice | null>(cached);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>(cached ? 'ok' : 'loading');

  useEffect(() => {
    if (cached) return;
    fetchNotice(id)
      .then((n) => { setNotice(n); setState(n ? 'ok' : 'missing'); })
      .catch(() => setState('error'));
  }, [id, cached]);

  if (state === 'loading' || !loaded) return <main className="space-y-3 px-4 pt-4">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-card bg-white" />)}</main>;
  if (state !== 'ok' || !notice) {
    return (
      <main className="px-4 pt-10 text-center">
        <p className="text-sm text-slate-600">{state === 'missing' ? '공고를 찾을 수 없습니다. 삭제됐거나 주소가 잘못됐을 수 있어요.' : '공고를 불러오지 못했습니다.'}</p>
        <Link href="/bids" className="mt-3 inline-block text-sm font-bold text-primary">공고 리스트로</Link>
      </main>
    );
  }

  const n = notice;
  const ex = explain(n);
  const closed = n.d < 0;
  const a = awardInfo(n.award);
  // 가입 전에는 상세를 흐리게 보여주고 가입을 안내 (기획 v2.2)
  const gated = loaded && !account;
  const rows: [React.ReactNode, React.ReactNode][] = [
    ['공고번호', `${n.bidNo}-${n.bidOrd}`],
    ['공고기관', n.org],
    ...(n.demandOrg && n.demandOrg !== n.org ? [['수요기관', n.demandOrg] as [string, string]] : []),
    ['계약방식', CONTRACT_TERMS.includes(n.contract) ? <Term key="c" k={n.contract as TermKey} /> : n.contract],
    ['낙찰방식', n.award],
    ['참가자격', eligibilitySummary(n)],
    [<Term key="e" k="추정가격" />, n.estPrice ? <b key="p">{fmtWon(n.estPrice)}</b> : '미공개'],
    [<Term key="b" k="기초금액" />, n.basePrice ? fmtWon(n.basePrice) : '아직 공개되지 않음'],
    ...(n.floorRate ? [[<Term key="f" k="낙찰하한율" />, `${n.floorRate}%`] as [React.ReactNode, string]] : []),
    ...(n.productName ? [['세부품명', n.productName] as [string, string]] : []),
    ['입찰마감', (
      <>
        {fmtDateTime(n.closesAt)}{' '}
        {!closed && <span className={`font-bold ${n.d <= 3 ? 'text-red-500' : 'text-primary'}`}>(D-{n.d})</span>}
      </>
    )],
  ];

  return (
    <main className="space-y-4 px-4 pb-28 pt-4">
      <section>
        <div className="flex items-center gap-1.5">
          <TypeTag type={n.type} />
          <DdayBadge d={n.d} />
          {n.isNew && <NewBadge />}
        </div>
        <h1 className="mt-2 text-xl font-bold leading-snug">{n.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{n.org}{n.demandOrg && n.demandOrg !== n.org ? ` · 수요기관 ${n.demandOrg}` : ''}</p>
      </section>

      {gated && <SignupGate onSignup={() => setSignup(true)} />}
      <div className={gated ? 'pointer-events-none max-h-[70vh] select-none overflow-hidden blur-[6px]' : 'space-y-4'} aria-hidden={gated || undefined}>
      <div className="space-y-4">

      {closed && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-200 px-3.5 py-3 text-sm font-medium text-slate-600">
          <Info className="h-4 w-4 shrink-0" />마감된 공고입니다. 참여 가능 판정과 추천에서 제외됩니다.
        </p>
      )}

      {/* 공고 해설 카드 (F2-3) */}
      <section className="rounded-card border border-blue-100 bg-blue-50/70 p-4">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-primary"><BookOpen className="h-4 w-4" />공고 해설</h2>
        <dl className="space-y-2.5 text-sm">
          <div><dt className="text-xs font-semibold text-slate-500">누가 참여하나</dt><dd className="mt-0.5 font-medium">{ex.who}</dd></div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">어떻게 뽑나</dt>
            <dd className="mt-0.5 font-medium">{a.label === '적격심사' ? <><Term k="적격심사" />{a.desc ? ` — ${a.desc}` : ''}</> : ex.how}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-slate-500">어떤 법이 적용되나</dt>
            <dd className="mt-0.5 font-medium">
              {ex.law ?? '발주기관 유형으로 추정할 수 없어 공고문에서 확인 필요'}
              {ex.law && <span className="ml-1.5 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">추정</span>}
            </dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-blue-100 pt-3 text-xs leading-relaxed text-slate-600">
          계약방식과 낙찰방식은 별개입니다. 제한경쟁이라고 모두 적격심사는 아닙니다.
        </p>
      </section>

      {!closed && <JudgmentCard notice={n} />}

      <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold">공고 정보</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {rows.map(([k, v], i) => (
              <tr key={i}>
                <th scope="row" className="w-28 bg-slate-50 px-4 py-3 text-left align-top font-medium text-slate-500">{k}</th>
                <td className="break-all px-4 py-3 text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-slate-100 p-4">
          {n.url ? (
            gated ? (
              <button type="button" onClick={() => setSignup(true)} className={BTN_OUTLINE}>
                <FileText className="h-5 w-5" />나라장터 공고 원문 보기
              </button>
            ) : (
              <a href={n.url} target="_blank" rel="noopener noreferrer" className={BTN_OUTLINE}>
                <FileText className="h-5 w-5" />나라장터 공고 원문 보기<ExternalLink className="h-4 w-4" />
              </a>
            )
          ) : (
            <p className="text-center text-sm text-slate-400">원문 링크가 없는 공고입니다</p>
          )}
          {n.url && (
            <p className="mt-2 text-center text-xs text-slate-400">
              새 창으로 열려요. 원문 창을 닫으면 지금 이 화면으로 그대로 돌아옵니다.
            </p>
          )}
        </div>
      </section>

      {gated ? <SimilarContractsPlaceholder /> : <SimilarContracts notice={n} />}

      {!gated && <DetailActions notice={n} />}
      </div>
      </div>
      <SignupSheet open={signup} onClose={() => setSignup(false)}
        reason="가입하면 이 공고의 해설, 참여 가능 판정 근거, 유사 계약 이력을 바로 볼 수 있어요."
        onDone={() => setSignup(false)} />
    </main>
  );
}

/** 가입 전: 상세 위에 띄우는 가입 안내 */
function SignupGate({ onSignup }: { onSignup: () => void }) {
  return (
    <section className="relative z-10 rounded-card border border-blue-200 bg-white p-5 text-center shadow-md">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-primary"><Lock className="h-5 w-5" /></span>
      <h2 className="mt-3 text-base font-bold">가입하고 이 공고를 자세히 보세요</h2>
      <ul className="mx-auto mt-3 max-w-[280px] space-y-1 text-left text-sm text-slate-600">
        <li>· 누가 참여할 수 있고 어떻게 뽑는지 <b>공고 해설</b></li>
        <li>· 우리 회사가 <b>왜 참여할 수 있는지</b> 판정 근거</li>
        <li>· 같은 기관의 <b>유사 계약 이력</b>과 투찰금액 계산</li>
      </ul>
      <button type="button" onClick={onSignup} className={BTN_PRIMARY + ' mt-4'}>1분 만에 가입하기</button>
      <Link href="/login" className="mt-3 inline-block text-sm font-medium text-slate-500">이미 가입했어요 · 로그인</Link>
    </section>
  );
}

function SimilarContractsPlaceholder() {
  return (
    <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><History className="h-4 w-4 text-primary" />유사 계약 이력</h2>
      <div className="h-16 rounded-lg bg-slate-100" />
    </section>
  );
}

/** 판정 결과 + 규칙별 사유 + '확인 필요' 인라인 입력 + 원문 확인 항목 */
function JudgmentCard({ notice }: { notice: Notice }) {
  const { profile } = useStore();
  const { status, reasons } = judge(notice, profile);
  return (
    <section className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" />참여 가능 판정</h2>
        <StatusBadge status={status} size="lg" />
      </div>
      <ul className="space-y-3 text-sm">
        {reasons.map((r) => (
          <li key={r.rule}>
            <div className="flex items-start gap-2">
              <ResultIcon result={r.result} />
              <span className={r.result === 'pass' ? 'text-slate-700' : `font-medium ${STATUS_STYLE[r.result === 'fail' ? 'ineligible' : 'check'].text}`}>{r.text}</span>
            </div>
            {r.result === 'check' && r.need && <InlineInput need={r.need} />}
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
        <p className="mb-1 flex items-center gap-1 font-semibold text-slate-700"><FileSearch className="h-3.5 w-3.5" />원문에서 확인할 항목</p>
        {MANUAL_CHECKS.join(' · ')}
        <p className="mt-1.5 text-slate-500">판정은 지역·업종 조건만 비교한 결과입니다. 최종 자격은 공고문 원문으로 확인하세요.</p>
      </div>
    </section>
  );
}

function InlineInput({ need }: { need: ProfileNeed }) {
  const { profile, updateProfile } = useStore();
  const toast = useToast();
  const [ind, setInd] = useState<Industry[]>(profile.industries ?? []);
  const box = 'ml-6 mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5';

  if (need === 'location' || need === 'sigungu') {
    return (
      <div className={box}>
        <LocationPicker value={profile.location}
          onChange={(v) => { updateProfile({ location: v }); if (v?.includes(' ')) toast('입력한 소재지로 판정을 다시 계산했습니다'); }} />
      </div>
    );
  }
  return (
    <div className={`${box} space-y-2`}>
      <IndustryPicker value={ind} onChange={setInd} />
      <button type="button" disabled={!ind.length} onClick={() => { updateProfile({ industries: ind }); toast('입력한 업종으로 판정을 다시 계산했습니다'); }}
        className="w-full rounded-btn bg-slate-800 py-2 text-sm font-bold text-white disabled:bg-slate-300">업종 저장하고 다시 판정</button>
    </div>
  );
}

/** 유사 계약 이력 — 같은 기관이 비슷한 이름으로 맺은 과거 계약 (수집된 계약 기준) */
function SimilarContracts({ notice }: { notice: Notice }) {
  const [items, setItems] = useState<SimilarContract[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetchSimilarContracts(notice).then(setItems).catch(() => setFailed(true));
  }, [notice]);

  return (
    <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold"><History className="h-4 w-4 text-primary" />유사 계약 이력</h2>
      <p className="mb-3 text-xs text-slate-500">같은 기관이 비슷한 이름으로 맺은 계약입니다.</p>
      {failed && <p className="text-sm text-red-500">계약 이력을 불러오지 못했습니다.</p>}
      {!failed && !items && <div className="h-14 animate-pulse rounded-lg bg-slate-100" />}
      {items && !items.length && (
        <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
          아직 찾은 계약이 없습니다. 계약 정보는 2026년 11월부터 쌓이고 있어, 시간이 지나면 더 많이 보입니다.
        </p>
      )}
      {items && items.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id} className="py-2.5 text-sm">
              <p className="font-medium">{c.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {c.contractDate ? fmtDate(new Date(c.contractDate)) : '날짜 미상'} · {c.method ?? '계약방법 미상'}
                {c.amount ? ` · ${fmtShort(c.amount)}원` : ''}
              </p>
              <p className="mt-0.5 text-xs text-slate-600">계약업체: {c.corps.map((x) => x.name).filter(Boolean).join(', ') || '미상'}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 투찰금액 계산 · 공고 저장 */
function DetailActions({ notice: n }: { notice: Notice }) {
  const { saved, toggleSaved, account } = useStore();
  const toast = useToast();
  const [signup, setSignup] = useState(false);
  const on = saved.includes(n.id);

  const save = () => {
    const nowOn = toggleSaved(n.id);
    toast(nowOn ? '공고를 저장했습니다. 마이페이지에서 마감일을 확인하세요' : '저장을 해제했습니다');
  };

  const q = new URLSearchParams({ type: n.type, from: String(n.id) });
  if (n.basePrice) q.set('base', String(n.basePrice));
  if (n.reserveMax !== null) q.set('range', String(Math.abs(n.reserveMax)));
  if (n.floorRate !== null) q.set('rate', String(n.floorRate));

  return (
    <section className="space-y-2.5 pt-1">
      <Link href={`/calculator?${q}`} className={BTN_PRIMARY}><Calculator className="h-5 w-5" />투찰금액 계산</Link>
      <button type="button" aria-pressed={on} className={BTN_OUTLINE} onClick={() => (account ? save() : setSignup(true))}>
        <Bookmark className={`h-5 w-5 ${on ? 'fill-blue-600' : ''}`} />
        {on ? '저장됨' : '공고 저장'}
      </button>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="공고를 저장하고 마감 알림을 받으려면 이메일 가입이 필요해요."
        onDone={() => { setSignup(false); save(); }} />
    </section>
  );
}
