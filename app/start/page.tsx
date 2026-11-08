'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Compass } from 'lucide-react';
import { ChoiceChips, IndustrySearch } from '@/components/inputs';
import { BTN_PRIMARY } from '@/components/ui';
import { REGIONS } from '@/lib/data';
import { useStore } from '@/lib/store';

/** S1. 간편 시작 — 업종·지역 2개만 받고 바로 추천 화면으로 (F1-1) */
export default function StartPage() {
  const router = useRouter();
  const { loaded, profile, updateProfile } = useStore();
  const [industry, setIndustry] = useState<{ big: string; mid: string } | null>(null);
  const [location, setLocation] = useState<string | null>(null);

  // 이미 입력한 값이 있으면 채워 둠
  useEffect(() => {
    if (!loaded) return;
    if (profile.industry) setIndustry({ big: profile.industry.big, mid: profile.industry.mid });
    if (profile.location) setLocation(profile.location);
  }, [loaded, profile.industry, profile.location]);

  const ready = !!(industry && location);
  const go = () => {
    if (!industry || !location) return;
    const sameMid = profile.industry?.mid === industry.mid;
    updateProfile({ industry: { ...industry, leaf: sameMid ? profile.industry!.leaf : null }, location });
    router.push('/recommend');
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-slate-50 px-5 md:border-x md:border-slate-200 md:shadow-md">
      <section className="pb-8 pt-14">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-md">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold leading-snug tracking-tight">
          업종과 지역만 알려주세요.
          <br />
          <span className="text-primary">참여할 수 있는 공고</span>를 골라 드릴게요.
        </h1>
        <p className="mt-2 text-sm text-slate-500">가입 없이 바로 볼 수 있어요. 무료입니다.</p>
      </section>

      <div className="space-y-7">
        <section>
          <h2 className="mb-2.5 text-sm font-bold text-slate-700">
            <span className="mr-1.5 text-primary">1</span>어떤 업종인가요?
          </h2>
          <IndustrySearch value={industry} onChange={setIndustry} />
        </section>

        <section>
          <h2 className="mb-2.5 text-sm font-bold text-slate-700">
            <span className="mr-1.5 text-primary">2</span>사업장은 어느 지역에 있나요?
          </h2>
          <ChoiceChips label="사업장 소재지" options={REGIONS} value={location} onChange={setLocation} />
          <p className="mt-2 text-xs text-slate-400">지역제한 공고의 참여 가능 여부를 판정할 때 사용합니다.</p>
        </section>
      </div>

      <div className="sticky bottom-0 -mx-5 mt-8 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 px-5 pb-6 pt-4">
        <button type="button" disabled={!ready} onClick={go} className={BTN_PRIMARY}>
          내 공고 보기<ArrowRight className="h-5 w-5" />
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          이미 가입하셨나요?
          <Link href="/login" className="ml-1 font-bold text-primary hover:underline">로그인</Link>
        </p>
      </div>
    </div>
  );
}
