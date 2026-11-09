'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet } from './feedback';
import { BTN_PRIMARY, INPUT_CLS } from './ui';
import type { Industry } from '@/lib/data';
import { maskBizNo } from '@/lib/format';
import { useStore } from '@/lib/store';

type Verify =
  | { status: 'verified'; corpName: string | null; location: string | null; industries: Industry[] }
  | { status: 'mismatch' }
  | { status: 'unregistered' };

/**
 * 회원가입 (v2.2) — 이메일(아이디)·비밀번호·사업자등록번호·대표자명·약관 동의를 한 화면에서
 * 사업자번호+대표자명은 나라장터 업체정보와 대조해 회사를 확인합니다 (대표자명은 저장하지 않음).
 * 가입 전 입력한 업종·소재지·저장 공고는 서버로 옮깁니다.
 */
export function SignupSheet({ open, onClose, onDone, reason }: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  reason: string;
}) {
  const { signUp, updateProfile, profile } = useStore();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [bizno, setBizno] = useState('');
  const [ceo, setCeo] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unregisteredOk, setUnregisteredOk] = useState(false);
  const [busy, setBusy] = useState(false);

  // 간편 시작에서 넣은 사업자번호는 미리 채움
  useEffect(() => {
    if (open && profile.bizno && !bizno) setBizno(maskBizNo(profile.bizno));
  }, [open, profile.bizno, bizno]);

  const digits = bizno.replace(/\D/g, '');

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('이메일 주소를 확인해 주세요');
    if (pw.length < 8) return setError('비밀번호는 8자 이상 입력해 주세요');
    if (pw !== pw2) return setError('비밀번호가 서로 다릅니다');
    if (digits.length !== 10) return setError('사업자등록번호 10자리를 입력해 주세요');
    if (ceo.trim().length < 2) return setError('대표자명을 입력해 주세요');
    if (!agreeTerms || !agreePrivacy) return setError('필수 약관에 동의해 주세요');

    setBusy(true);
    try {
      // 1) 회사 확인
      const res = await fetch('/api/company/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bizno: digits, ceo }),
      });
      const v = (await res.json()) as Verify & { error?: string };
      if (!res.ok) throw new Error(v.error ?? '회사 확인에 실패했습니다');
      if (v.status === 'mismatch') throw new Error('대표자명이 나라장터에 등록된 정보와 다릅니다. 사업자등록증의 대표자명을 확인해 주세요');
      if (v.status === 'unregistered' && !unregisteredOk) {
        setUnregisteredOk(true);
        throw new Error('나라장터에 없는 번호라 대표자명은 확인하지 않아요. 번호가 맞다면 한 번 더 눌러 주세요');
      }

      // 2) 계정 생성 (가입 전 정보는 이 단계에서 서버로 옮겨짐)
      const r = await signUp(email, pw);
      if (r.error) throw new Error(r.error);

      // 3) 회사 정보 반영 — 확인된 경우에만 업체명 저장. 업종·소재지는 비어 있을 때만 채움
      if (v.status === 'verified') {
        updateProfile({
          bizno: digits,
          naraRegistered: true,
          corpName: v.corpName,
          ...(profile.industries?.length ? {} : { industries: v.industries }),
          ...(profile.location ? {} : { location: v.location }),
        });
      } else {
        updateProfile({ bizno: digits, naraRegistered: false, corpName: null });
      }
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, input: React.ReactNode, hint?: string) => (
    <div>
      <label htmlFor={id} className="mb-2 block text-[14px] text-sub">{label}</label>
      {input}
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );

  return (
    <Sheet title="회원가입" open={open} onClose={onClose}
      footer={
        <button type="button" onClick={submit} disabled={busy} className={BTN_PRIMARY}>
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}{busy ? '확인하는 중…' : '가입하고 계속 보기'}
        </button>
      }>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="-mt-1 text-[15px] text-sub">{reason}</p>
        {field('su-email', '이메일 (아이디)', <input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.co.kr" className={INPUT_CLS} />)}
        <div className="grid grid-cols-2 gap-2">
          {field('su-pw', '비밀번호', <input id="su-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="8자 이상" className={INPUT_CLS} />)}
          {field('su-pw2', '비밀번호 확인', <input id="su-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="한 번 더" className={INPUT_CLS} />)}
        </div>
        {pw2 && pw !== pw2 && <p className="-mt-2 text-[13px] text-bad">비밀번호가 서로 달라요</p>}
        {field('su-bizno', '사업자등록번호',
          <input id="su-bizno" inputMode="numeric" maxLength={12} value={bizno} onChange={(e) => { setBizno(maskBizNo(e.target.value)); setUnregisteredOk(false); }} placeholder="000-00-00000" className={INPUT_CLS} />)}
        {field('su-ceo', '대표자명',
          <input id="su-ceo" autoComplete="off" value={ceo} onChange={(e) => setCeo(e.target.value)} placeholder="사업자등록증의 대표자 성명" className={INPUT_CLS} />,
          '나라장터 등록 정보와 대조해 회사를 확인합니다. 대표자명은 저장하지 않습니다.')}

        <div className="space-y-2 rounded-btn bg-fill p-4 text-[14px]">
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={agreeTerms && agreePrivacy}
              onChange={(e) => { setAgreeTerms(e.target.checked); setAgreePrivacy(e.target.checked); }} />
            전체 동의
          </label>
          <div className="space-y-1.5 border-t border-line pt-2 text-sub">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} />
              <span className="flex-1">[필수] 이용약관 동의</span>
              <Link href="/terms" target="_blank" className="text-xs text-mute underline">보기</Link>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)} />
              <span className="flex-1">[필수] 개인정보 수집·이용 동의</span>
              <Link href="/privacy" target="_blank" className="text-xs text-mute underline">보기</Link>
            </label>
          </div>
        </div>

        {error && <p role="alert" className="text-[14px] text-bad">{error}</p>}
        <p className="text-center text-xs text-mute">
          이미 가입하셨나요? <Link href="/login" className="font-semibold text-primary">로그인</Link>
        </p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
