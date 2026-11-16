'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Sheet } from './feedback';
import { BTN_PRIMARY, INPUT_CLS } from './ui';
import { maskBizNo } from '@/lib/format';
import { useStore } from '@/lib/store';

/**
 * 회원가입 — 이메일(아이디)·비밀번호·약관 동의만 (2026-11-16 초심자 점검: 대표자명 필수가 가장 큰 이탈 지점)
 * 사업자번호는 선택(간편 시작 값 미리 채움). 회사 확인(대표자명 대조)은 입찰 분석을 쓸 때 VerifyBox에서.
 * 입력한 정보는 계정으로 옮겨져요.
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
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (digits.length > 0 && digits.length !== 10) return setError('사업자등록번호 10자리를 확인해 주세요 (비워 둬도 돼요)');
    if (!agreeTerms || !agreePrivacy) return setError('필수 약관에 동의해 주세요');

    setBusy(true);
    try {
      // 계정 생성 (가입 전 정보는 이 단계에서 서버로 옮겨짐)
      const r = await signUp(email, pw);
      if (r.error) throw new Error(r.error);
      // 사업자번호가 바뀌었으면 반영 — 업체명은 회사 확인 후에만 저장 (입찰 분석은 서버 확인 기록으로만 열림)
      if (digits && digits !== (profile.bizno ?? '').replace(/\D/g, '')) updateProfile({ bizno: digits, corpName: null });
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
          {busy && <Loader2 className="h-5 w-5 animate-spin" />}{busy ? '가입하는 중…' : '가입하고 계속 보기'}
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
          <input id="su-bizno" inputMode="numeric" maxLength={12} value={bizno} onChange={(e) => setBizno(maskBizNo(e.target.value))} placeholder="000-00-00000 (선택)" className={INPUT_CLS} />,
          '우리 회사 입찰 분석은 가입 뒤 회사 확인(대표자명)을 하면 열려요.')}

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
