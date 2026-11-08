'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sheet } from './feedback';
import { BTN_PRIMARY, INPUT_CLS } from './ui';
import { useStore } from '@/lib/store';

/**
 * 이메일 가입 (F1-1) — 공고 저장·알림을 쓸 때 요청합니다.
 * 가입하면 그동안 브라우저에 입력한 업종·지역·기업 정보와 저장 공고를 서버로 옮깁니다.
 */
export function SignupSheet({ open, onClose, onDone, reason }: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  reason: string;
}) {
  const { signUp } = useStore();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('이메일 주소를 확인해 주세요');
    if (pw.length < 8) return setError('비밀번호는 8자 이상 입력해 주세요');
    setBusy(true);
    setError(null);
    const r = await signUp(email, pw);
    setBusy(false);
    if (r.error) setError(r.error);
    else onDone?.();
  };

  return (
    <Sheet title="이메일로 가입하기" open={open} onClose={onClose}
      footer={<button type="button" onClick={submit} disabled={busy} className={BTN_PRIMARY}>{busy ? '가입하는 중…' : '가입하고 계속하기'}</button>}>
      <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-800">{reason}</p>
        <div>
          <label htmlFor="su-email" className="mb-1.5 block text-sm font-semibold text-slate-700">이메일</label>
          <input id="su-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.co.kr" className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="su-pw" className="mb-1.5 block text-sm font-semibold text-slate-700">비밀번호</label>
          <input id="su-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
            placeholder="8자 이상" className={INPUT_CLS} />
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>}
        <p className="text-xs text-slate-400">
          지금까지 입력한 업종·지역·기업 정보는 가입 후에도 그대로 유지됩니다. 이미 가입하셨다면{' '}
          <Link href="/login" className="font-semibold text-primary">로그인</Link>해 주세요.
        </p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
