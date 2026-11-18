'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useToast } from './feedback';
import { INPUT_CLS } from './ui';
import { clearMyVerification, fetchMyVerification, verifyCompany, type MyVerification } from '@/lib/verify-client';

/**
 * 회사 확인 상태 — 서버 기록(입찰 분석이 열리는 기준)을 그대로 보여 줌 (2026-11-18)
 *  예전엔 이 기기의 업체명으로 판단해, 서버는 확인됨인데 마이페이지는 '회사 확인하기'를 보여 주는 일이 있었음
 *  확인됨이면 업체명·확인일 + '확인 해제'(029), 아니면 대표자명 입력
 */
export function VerifyStatus({ bizno, corpName, onVerified, onCleared }: {
  bizno: string;
  /** 지금 회사 정보의 업체명 — 서버는 확인됨인데 비어 있으면 채움 */
  corpName?: string | null;
  onVerified: (corpName: string) => void; onCleared?: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<MyVerification | null | undefined>(undefined);
  useEffect(() => { fetchMyVerification().then(setV).catch(() => setV(null)); }, [bizno]);
  const same = !!v && v.bizno.replace(/\D/g, '') === bizno.replace(/\D/g, '');
  // 서버 확인 기록이 있는데 업체명이 비어 있으면 채움 (예: 다른 기기에서 확인, 2026-11-18 '확인했는데 업체명이 비어 있음')
  useEffect(() => { if (same && v && !corpName) onVerified(v.corpName); }, [same, v, corpName]); // eslint-disable-line react-hooks/exhaustive-deps
  if (v === undefined) return null;
  if (!same) return <VerifyBox bizno={bizno} onVerified={(c) => { onVerified(c); fetchMyVerification().then(setV).catch(() => {}); }} />;
  const clear = async () => {
    if (!window.confirm('회사 확인을 해제할까요? 입찰 분석을 보려면 대표자명으로 다시 확인해야 해요.')) return;
    if (await clearMyVerification()) { setV(null); onCleared?.(); toast('회사 확인을 해제했어요'); }
    else toast('해제하지 못했어요. 잠시 뒤 다시 해 주세요');
  };
  return (
    <div className="mt-4 flex items-start gap-3 rounded-2xl bg-fill p-4 text-[14px]">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-ok" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">회사 확인됨 · {v!.corpName}</p>
        <p className="mt-0.5 text-[13px] text-mute">{new Date(v!.verifiedAt).toLocaleDateString('ko-KR')} 확인 · 이 회사의 입찰 기록으로 분석해요</p>
      </div>
      <button type="button" onClick={clear} className="shrink-0 text-[13px] font-medium text-sub underline underline-offset-2">확인 해제</button>
    </div>
  );
}

/**
 * 회사 확인하기 — 대표자명을 나라장터와 대조, 서버가 확인을 기록해야 입찰 분석이 열림 (016)
 * 가입에는 대표자명이 필요 없고(2026-11-16 초심자 점검), 입찰 분석을 쓸 때 여기서 확인
 */
export function VerifyBox({ bizno, onVerified, title = '회사 확인하기', className = 'mt-4' }: {
  bizno: string; onVerified: (corpName: string) => void; title?: string; className?: string;
}) {
  const toast = useToast();
  const [ceo, setCeo] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setHint(null);
    try {
      const v = await verifyCompany(bizno.replace(/\D/g, ''), ceo);
      // 화면에 남는 안내 — 테스트에서 7곳 중 2곳이 나라장터 등록 대표자와 달랐음 (2026-11-16)
      if (v.status === 'mismatch') return setHint('mismatch');
      if (v.status === 'unregistered') return setHint('unregistered');
      if (v.corpName) onVerified(v.corpName);
      toast(v.stored ? '회사를 확인했어요. 입찰 분석을 볼 수 있어요' : '회사를 확인했어요');
    } catch (e) {
      setHint((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`rounded-2xl bg-brand-soft p-4 text-left ${className}`}>
      <p className="text-[14px] font-semibold">{title}</p>
      <p className="mt-0.5 text-[13px] text-sub">사업자등록증의 대표자명을 나라장터 정보와 맞춰 보면 우리 회사 입찰 기록을 찾아 드려요. 대표자명은 저장하지 않아요.</p>
      <div className="mt-2.5 flex gap-2">
        <input value={ceo} onChange={(e) => setCeo(e.target.value)} placeholder="대표자명" aria-label="대표자명" className={`${INPUT_CLS} flex-1`} />
        <button type="button" onClick={run} disabled={busy || ceo.trim().length < 2}
          className="shrink-0 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white disabled:bg-line disabled:text-mute">{busy ? '확인 중' : '확인'}</button>
      </div>
      {hint && (
        <div role="alert" className="mt-2.5 rounded-xl bg-white px-3.5 py-3 text-[13px] leading-relaxed text-sub">
          {hint === 'mismatch' ? (
            <>
              <b className="font-semibold text-bad">나라장터에 등록된 대표자명과 달라요.</b>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>사업자등록증에 적힌 대표자 성명을 띄어쓰기 없이 넣어 주세요.</li>
                <li>공동대표라면 한 분의 이름만 넣어도 돼요.</li>
                <li>최근 대표자가 바뀌었다면 나라장터 업체정보(입찰참가자격 등록)가 아직 예전 대표자로 되어 있을 수 있어요. 나라장터에서 등록 정보를 바꾼 뒤 다시 확인해 주세요.</li>
              </ul>
            </>
          ) : hint === 'unregistered' ? (
            <>나라장터에 입찰참가자격이 등록되지 않은 사업자번호라 확인할 수 없어요. 사업자번호가 맞는지 마이페이지에서 확인해 주세요.</>
          ) : hint}
        </div>
      )}
    </div>
  );
}
