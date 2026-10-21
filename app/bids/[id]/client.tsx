'use client';

import { Bookmark, ExternalLink, ShieldCheck } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { BTN_OUTLINE } from '@/components/ui';
import type { Bid } from '@/lib/data';
import { useProfile, useSaved } from '@/lib/store';

type Status = 'ok' | 'warn' | 'no';
const ICON: Record<Status, string> = { ok: '✅', warn: '⚠️', no: '❌' };
const TONE: Record<Status, string> = { ok: 'text-slate-800', warn: 'text-amber-700', no: 'text-red-600' };

/** 나의 자격 매칭 — 회원 프로필 기준으로 판정 */
export function QualificationCard({ bid: b }: { bid: Bid }) {
  const [profile] = useProfile();
  const has = (r: Bid['reasons'][number]) => b.reasons.includes(r);
  const indPath = profile.industry.slice(0, 2).join(' > ');
  const regionOk = !b.regionLimit || profile.regions.includes(b.regionLimit);
  const licenseOk = !b.license || profile.licenses.includes(b.license);

  const checks: [string, Status, string][] = [
    ['업종 일치', has('업종 일치') ? 'ok' : 'warn', has('업종 일치') ? `일치 (${indPath})` : '업종 확인 필요'],
    ['지역 제한', regionOk ? 'ok' : 'no', !b.regionLimit ? '제한 없음' : regionOk ? `충족 (${b.regionLimit})` : `미충족 (${b.regionLimit} 소재 업체 한정)`],
    ['실적 요건', has('실적 충족') ? 'ok' : 'warn', has('실적 충족') ? '유사실적 충족' : '유사실적 확인 필요'],
    ['면허 요건', licenseOk ? 'ok' : 'warn', !b.license ? '해당 없음' : licenseOk ? `보유 (${b.license})` : `${b.license} 확인 필요`],
  ];

  return (
    <section className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-primary" />나의 자격 매칭</h2>
      <ul className="space-y-2.5 text-sm">
        {checks.map(([k, s, v]) => (
          <li key={k} className="flex items-start justify-between gap-3">
            <span className="shrink-0 text-slate-500">{k}</span>
            <span className={`text-right font-medium ${TONE[s]}`}>{ICON[s]} {v}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-amber-50 px-3.5 py-3">
        <span className="text-sm font-semibold text-amber-800">총 매칭율</span>
        <span className="text-2xl font-extrabold text-amber-600">{b.match}%</span>
      </div>
    </section>
  );
}

/** 공고 저장 · 원문 보기 */
export function DetailActions({ bidId }: { bidId: number }) {
  const toast = useToast();
  const [saved, setSaved] = useSaved();
  const on = saved.includes(bidId);

  return (
    <>
      <button type="button" aria-pressed={on} className={BTN_OUTLINE}
        onClick={() => {
          setSaved(on ? saved.filter((x) => x !== bidId) : [...saved, bidId]);
          toast(on ? '저장이 해제되었습니다' : '공고가 저장되었습니다');
        }}>
        <Bookmark className={`h-5 w-5 ${on ? 'fill-blue-600' : ''}`} />
        {on ? '저장됨' : '공고 저장'}
      </button>
      {/* 2단계에서 나라장터 공고 원문 URL로 교체 */}
      <button type="button" onClick={() => toast('프로토타입: 나라장터 원문 링크는 더미입니다')}
        className="flex w-full items-center justify-center gap-1 py-2 text-sm font-medium text-slate-500 hover:text-primary">
        나라장터 원문 보기<ExternalLink className="h-4 w-4" />
      </button>
    </>
  );
}
