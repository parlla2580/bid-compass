'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, Calculator, ExternalLink, ShieldCheck } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { SignupSheet } from '@/components/signup-sheet';
import { BTN_OUTLINE, BTN_PRIMARY, INPUT_CLS, ResultIcon, STATUS_STYLE, StatusBadge, chipClass } from '@/components/ui';
import { INDUSTRY, INDUSTRY_OPTIONS, REGIONS, SIZES, type Notice } from '@/lib/data';
import { judge, type ProfileNeed } from '@/lib/judge';
import { useStore } from '@/lib/store';

/** 판정 결과 + 규칙별 사유 + '확인 필요' 인라인 입력 (F3-1, F3-2, F1-2) */
export function JudgmentCard({ notice }: { notice: Notice }) {
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
            {r.result === 'check' && r.need && <InlineInput need={r.need} notice={notice} />}
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
        최종 자격은 공고문 원문으로 확인하세요. 판정은 입력하신 정보와 공고 데이터를 비교한 결과입니다.
      </p>
    </section>
  );
}

/** '확인 필요' 항목을 그 자리에서 입력 → 판정 즉시 재계산 */
function InlineInput({ need, notice }: { need: ProfileNeed; notice: Notice }) {
  const { profile, updateProfile } = useStore();
  const toast = useToast();
  const [text, setText] = useState('');
  const done = () => toast('입력한 정보로 판정을 다시 계산했습니다');
  const box = 'ml-6 mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5';
  const select = INPUT_CLS + ' py-2 text-sm';

  if (need === 'location') {
    return (
      <div className={box}>
        <select aria-label="사업장 소재지" defaultValue="" className={select}
          onChange={(e) => { updateProfile({ location: e.target.value }); done(); }}>
          <option value="" disabled>소재지 선택</option>
          {REGIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
    );
  }
  if (need === 'industry') {
    return (
      <div className={box}>
        <select aria-label="업종" defaultValue="" className={select}
          onChange={(e) => { const o = INDUSTRY_OPTIONS[+e.target.value]; updateProfile({ industry: { big: o.big, mid: o.mid, leaf: null } }); done(); }}>
          <option value="" disabled>업종 선택</option>
          {INDUSTRY_OPTIONS.map((o, i) => <option key={o.label} value={i}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  if (need === 'industryLeaf' && profile.industry) {
    const ind = profile.industry;
    return (
      <div className={box}>
        <select aria-label="업종 세분류" defaultValue="" className={select}
          onChange={(e) => { updateProfile({ industry: { ...ind, leaf: e.target.value } }); done(); }}>
          <option value="" disabled>{ind.mid} 세분류 선택</option>
          {INDUSTRY[ind.big][ind.mid].map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
    );
  }
  if (need === 'size') {
    return (
      <div className={`${box} flex gap-1.5`}>
        {SIZES.map((s) => (
          <button key={s} type="button" onClick={() => { updateProfile({ size: s }); done(); }}
            className={`flex-1 rounded-full border py-1.5 text-sm font-medium ${chipClass(false)}`}>{s}</button>
        ))}
      </div>
    );
  }
  if (need === 'directProducts' || need === 'licenses') {
    const target = need === 'directProducts' ? notice.directProduct! : notice.license!;
    const label = need === 'directProducts' ? '직접생산확인 품목' : '면허';
    const current = profile[need] ?? [];
    const add = (items: string[]) => { updateProfile({ [need]: [...new Set([...current, ...items])] }); done(); };
    return (
      <div className={`${box} space-y-2`}>
        <button type="button" onClick={() => add([target])}
          className="w-full rounded-btn bg-white py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
          {target} 보유
        </button>
        <div className="flex gap-1.5">
          <input aria-label={`보유 ${label} 직접 입력`} value={text} onChange={(e) => setText(e.target.value)} placeholder={`다른 ${label} 입력`}
            className={select + ' flex-1'} />
          <button type="button" disabled={!text.trim()} onClick={() => { add([text.trim()]); setText(''); }}
            className="shrink-0 rounded-btn bg-slate-800 px-3 text-sm font-bold text-white disabled:bg-slate-300">추가</button>
        </div>
        <button type="button" onClick={() => { updateProfile({ [need]: current }); done(); }}
          className="w-full text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
          보유한 {label} 없음
        </button>
      </div>
    );
  }
  return null;
}

/** 투찰금액 계산 · 공고 저장 · 원문 보기 */
export function DetailActions({ notice: n }: { notice: Notice }) {
  const { saved, toggleSaved, account } = useStore();
  const toast = useToast();
  const [signup, setSignup] = useState(false);
  const on = saved.includes(n.id);

  const save = () => {
    const nowOn = toggleSaved(n.id);
    toast(nowOn ? '공고를 저장했습니다. 마이페이지에서 마감일을 확인하세요' : '저장을 해제했습니다');
  };

  const calcHref = `/calculator?base=${n.basePrice}&type=${encodeURIComponent(n.type)}&from=${n.id}`;

  return (
    <section className="space-y-2.5 pt-1">
      <Link href={calcHref} className={BTN_PRIMARY}><Calculator className="h-5 w-5" />투찰금액 계산</Link>
      <button type="button" aria-pressed={on} className={BTN_OUTLINE} onClick={() => (account ? save() : setSignup(true))}>
        <Bookmark className={`h-5 w-5 ${on ? 'fill-blue-600' : ''}`} />
        {on ? '저장됨' : '공고 저장'}
      </button>
      {/* 나라장터 원문 URL은 API 연동 단계에서 채움 */}
      <button type="button" onClick={() => toast('프로토타입: 나라장터 원문 링크는 API 연동 후 연결됩니다')}
        className="flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-slate-500 hover:text-primary">
        나라장터 원문 보기<ExternalLink className="h-4 w-4" />
      </button>
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="공고를 저장하고 마감 알림을 받으려면 이메일 가입이 필요해요."
        onDone={() => { setSignup(false); save(); }} />
    </section>
  );
}
