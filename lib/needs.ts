import type { Judged } from './store';
import type { ProfileNeed } from './judge';

export const NEED_LABEL: Record<ProfileNeed, string> = {
  location: '소재지',
  industry: '업종',
  industryLeaf: '업종 세분류',
  size: '기업규모',
  directProducts: '직접생산확인 품목',
  licenses: '보유 면허',
};

/** 프로필 보완 배너용 — 입력하면 판정되는 '확인 필요' 공고가 가장 많은 항목 */
export function topNeed(items: Judged[]): { need: ProfileNeed; count: number } | null {
  const counts = new Map<ProfileNeed, number>();
  for (const { judgment } of items) {
    if (judgment.status !== 'check') continue;
    const needs = new Set(judgment.reasons.flatMap((r) => (r.result === 'check' && r.need ? [r.need] : [])));
    needs.forEach((n) => counts.set(n, (counts.get(n) ?? 0) + 1));
  }
  let best: { need: ProfileNeed; count: number } | null = null;
  counts.forEach((count, need) => {
    if (!best || count > best.count) best = { need, count };
  });
  return best;
}
