'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Compass, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { BTN_PRIMARY, INPUT_CLS } from '@/components/ui';
import { maskBizNo } from '@/lib/format';

export default function LoginPage() {
  const router = useRouter();
  const toast = useToast();
  const [bizNo, setBizNo] = useState('');
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-slate-50 px-6 md:border-x md:border-slate-200 md:shadow-md">
      <section className="flex flex-col items-center pb-10 pt-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-white shadow-md">
          <Compass className="h-9 w-9" />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight">입찰나침반</h1>
        <p className="mt-1.5 text-sm text-slate-500">우리 회사에 맞는 공공조달 입찰, 무료로 찾아보세요</p>
      </section>

      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          router.push('/');
        }}
      >
        <div>
          <label htmlFor="bizno" className="mb-1.5 block text-sm font-semibold text-slate-700">사업자등록번호</label>
          <input id="bizno" inputMode="numeric" autoComplete="username" placeholder="000-00-00000" maxLength={12}
            value={bizNo} onChange={(e) => setBizNo(maskBizNo(e.target.value))} className={INPUT_CLS} />
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
        <div className="flex items-center justify-between pt-1 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-blue-600" defaultChecked /> 로그인 유지
          </label>
          <button type="button" onClick={() => toast('프로토타입: 비밀번호 찾기는 준비 중입니다')} className="text-slate-500 hover:text-slate-700">
            비밀번호 찾기
          </button>
        </div>
        <button type="submit" className={BTN_PRIMARY + ' mt-2'}>로그인</button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        아직 회원이 아니신가요?
        <Link href="/signup" className="ml-1 font-bold text-primary hover:underline">회원가입</Link>
      </p>

      <p className="mt-auto pb-8 pt-12 text-center text-[11px] leading-relaxed text-slate-400">
        프로토타입 화면입니다. 아무 값이나 입력해도 로그인됩니다.
      </p>
    </div>
  );
}
