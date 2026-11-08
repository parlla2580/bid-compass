'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';

/** 견본 진입 — 기초금액·하한율이 있는 마감 전 공고 하나로 이동 */
export default function PreviewIndex() {
  const { notices } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (!notices?.length) return;
    const pick = notices.find((n) => n.d >= 2 && n.basePrice && n.floorRate && n.estPrice) ?? notices[0];
    router.replace(`/preview/bids/${pick.id}`);
  }, [notices, router]);
  return <p className="p-10 text-center text-sm text-slate-500">견본 공고를 고르는 중…</p>;
}
