import type { Judged } from './store';
import type { ProfileNeed } from './judge';

export const NEED_LABEL: Record<ProfileNeed, string> = {
  location: '소재지',
  sigungu: '시군구',
  industries: '업종',
};

/** 프로필 보완 배너용 — 입력하면 판정되는 '확인 필요' 공고가 가장 많은 항목 */
export function topNeed(items: Judged[] | null): { need: ProfileNeed; count: number } | null {
  const counts = new Map<ProfileNeed, number>();
  for (const { judgment } of items ?? []) {
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
