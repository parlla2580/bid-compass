'use client';

import { useState } from 'react';
import { Sheet, useToast } from './feedback';
import { BTN_PRIMARY, INPUT_CLS } from './ui';
import { useStore } from '@/lib/store';

/**
 * 이메일 가입 (F1-1) — 공고 저장·알림을 쓸 때 요청합니다.
 * 프로토타입: 실제 계정을 만들지 않고 이메일만 브라우저에 기록합니다 (Supabase 연동 단계에서 교체).
 */
export function SignupSheet({ open, onClose, onDone, reason }: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
  reason: string;
}) {
  const { setAccount } = useStore();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('이메일 주소를 확인해주세요');
    if (pw.length < 8) return toast('비밀번호는 8자 이상 입력해주세요');
    setAccount({ email });
    onDone?.();
  };

  return (
    <Sheet title="이메일로 가입하기" open={open} onClose={onClose}
      footer={<button type="button" onClick={submit} className={BTN_PRIMARY}>가입하고 계속하기</button>}>
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
        <p className="text-xs text-slate-400">지금 입력한 업종·지역 정보는 가입 후에도 그대로 유지됩니다.</p>
        <button type="submit" hidden />
      </form>
    </Sheet>
  );
}
