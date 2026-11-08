'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { BTN_PRIMARY, INPUT_CLS } from '@/components/ui';
import { useStore } from '@/lib/store';

/** S1. 로그인 (이메일) */
export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useStore();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('이메일 주소를 확인해 주세요');
    if (!pw) return setError('비밀번호를 입력해 주세요');
    setBusy(true);
    setError(null);
    const r = await signIn(email, pw);
    setBusy(false);
    if (r.error) return setError(r.error);
    // 업종·지역이 없는 계정이면 간편 시작부터
    router.push(r.started ? '/' : '/start');
  };

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-canvas px-5 lg:pt-10">
      <header className="flex h-14 items-center">
        <Link href="/start" aria-label="간편 시작으로" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-sub hover:bg-fill">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </header>
      <h1 className="pt-4 text-[26px] font-bold tracking-tight">로그인</h1>
      <p className="mt-1.5 text-sm text-mute">저장한 공고와 기업 정보를 이어서 볼 수 있어요.</p>

      <form className="mt-8 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-sub">이메일</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.co.kr" className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="pw" className="mb-1.5 block text-sm font-semibold text-sub">비밀번호</label>
          <div className="relative">
            <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="비밀번호를 입력하세요" className={INPUT_CLS + ' pr-12'} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-mute hover:text-sub">
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="text-[14px] text-bad">{error}</p>}
        <button type="submit" disabled={busy} className={BTN_PRIMARY + ' mt-2'}>{busy ? '로그인하는 중…' : '로그인'}</button>
      </form>

      <p className="mt-8 pb-10 text-center text-sm text-mute">
        처음이신가요?
        <Link href="/start" className="ml-1 font-bold text-primary hover:underline">업종·지역만 넣고 시작하기</Link>
      </p>
    </div>
  );
}
