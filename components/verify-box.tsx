'use client';

import { useState } from 'react';
import { useToast } from './feedback';
import { INPUT_CLS } from './ui';
import { verifyCompany } from '@/lib/verify-client';

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
  const run = async () => {
    setBusy(true);
    try {
      const v = await verifyCompany(bizno.replace(/\D/g, ''), ceo);
      if (v.status === 'mismatch') return toast('대표자명이 나라장터에 등록된 정보와 달라요. 사업자등록증의 대표자명을 확인해 주세요');
      if (v.status === 'unregistered') return toast('나라장터에 등록되지 않은 번호라 확인할 수 없어요');
      if (v.corpName) onVerified(v.corpName);
      toast(v.stored ? '회사를 확인했어요. 입찰 분석을 볼 수 있어요' : '회사를 확인했어요');
    } catch (e) {
      toast((e as Error).message);
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
    </div>
  );
}
