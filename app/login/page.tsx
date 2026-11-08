'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { BTN_PRIMARY, INPUT_CLS } from '@/components/ui';
import { DEMO_PROFILE } from '@/lib/data';
import { useStore } from '@/lib/store';

/**
 * S1. 로그인 (이메일)
 * 프로토타입: 아무 값이나 입력하면 로그인되고, 저장된 프로필이 없으면 데모 프로필을 불러옵니다.
 */
export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const { started, setProfile, setAccount } = useStore();
  const [email, setEmail] = useState('');
  const [showPw, setShowPw] = useState(false);

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('이메일 주소를 확인해주세요');
    setAccount({ email });
    if (!started) setProfile(DEMO_PROFILE);
    router.push('/');
  };

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 px-5 md:border-x md:border-slate-200 md:shadow-md">
      <header className="flex h-14 items-center">
        <Link href="/start" aria-label="간편 시작으로" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
      </header>
      <h1 className="pt-4 text-2xl font-extrabold tracking-tight">로그인</h1>
      <p className="mt-1.5 text-sm text-slate-500">저장한 공고와 기업 정보를 이어서 볼 수 있어요.</p>

      <form className="mt-8 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">이메일</label>
          <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.co.kr" className={INPUT_CLS} />
        </div>
        <div>
          <label htmlFor="pw" className="mb-1.5 block text-sm font-semibold text-slate-700">비밀번호</label>
          <div className="relative">
            <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="비밀번호를 입력하세요"
              className={INPUT_CLS + ' pr-12'} />
            <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-600">
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>
        <button type="submit" className={BTN_PRIMARY + ' mt-2'}>로그인</button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        처음이신가요?
        <Link href="/start" className="ml-1 font-bold text-primary hover:underline">업종·지역만 넣고 시작하기</Link>
      </p>
      <p className="pb-8 pt-12 text-center text-[11px] text-slate-400">프로토타입 화면입니다. 아무 이메일이나 입력하면 로그인됩니다.</p>
    </div>
  );
}
