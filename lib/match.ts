import type { Notice, Product, Profile } from './data';
import type { Judgment } from './judge';
import type { Similarity } from './analysis';
import { words } from './notices';

/* =========================================================
 * 맞춤 공고 — 관련성 ('우리 일인가')
 * 판정(자격)을 통과한 공고 중 우리 회사 일과 관련 있는 공고만 '맞춤 공고'로 보여주고,
 * 나머지는 '다른 참여 가능 공고'로 접는다 (기획 12.10).
 *
 * 품목 유사도 — 품명번호는 분류 계층(앞자리가 같을수록 가까운 품목)이라 앞자리 일치 길이로 계산
 *   10자리 같음 1.0 / 8자리 0.8 / 6자리 0.5 / 4자리 0.25
 *   (물품 세부품명 10자리와 용역 공공조달분류 8자리는 앞 8자리가 같은 체계)
 * 품명번호가 안 맞으면 품명 핵심어 겹침으로 보조 (0.6)
 * ========================================================= */

export interface ProductMatch {
  sim: number;
  /** 가장 가까운 회사 품목과 공고 품목 */
  mine: Product;
  theirs: Product;
}

function prefixSim(a: string, b: string): number {
  if (a.length >= 10 && b.length >= 10 && a.slice(0, 10) === b.slice(0, 10)) return 1;
  if (a.slice(0, 8) === b.slice(0, 8)) return a.length === 8 && b.length === 8 ? 1 : 0.8;
  if (a.slice(0, 6) === b.slice(0, 6)) return 0.5;
  if (a.slice(0, 4) === b.slice(0, 4)) return 0.25;
  return 0;
}

export function productMatch(n: Notice, mine: Product[] | null): ProductMatch | null {
  if (!mine?.length) return null;
  let best: ProductMatch | null = null;
  const title = words(`${n.title} ${n.products.map((p) => p.name).join(' ')}`);
  for (const m of mine) {
    for (const t of n.products) {
      const sim = prefixSim(m.code, t.code);
      if (sim > (best?.sim ?? 0)) best = { sim, mine: m, theirs: t };
    }
    // 품명 핵심어가 공고명·품명에 들어 있으면 보조 인정
    if ((best?.sim ?? 0) < 0.6 && [...words(m.name)].some((w) => w.length >= 2 && title.has(w))) {
      best = { sim: 0.6, mine: m, theirs: n.products[0] ?? { code: '', name: n.title } };
    }
  }
  return best && best.sim > 0 ? best : null;
}

export type RelevanceReason = 'product' | 'license' | 'history' | 'unknown' | 'none';

/**
 * 관련성 판단
 * - 품목이 맞음(0.5 이상) / 내 면허·업종을 요구하는 공고 / 과거 이력과 비슷함 → 관련 있음
 * - 회사 품목도 이력도 없으면 판단할 근거가 없음 → 'unknown' (걸러내지 않고 품목 입력을 안내)
 */
export function relevanceOf(n: Notice, p: Profile, j: Judgment, pm: ProductMatch | null, similar: Similarity | null): RelevanceReason {
  if (pm && pm.sim >= 0.5) return 'product';
  const ind = j.reasons.find((r) => r.rule === 'industry');
  if (n.licenseLimits && ind?.result === 'pass') return 'license';
  if ((similar?.score ?? 0) >= 1.5) return 'history';
  if (!p.products?.length && !similar) return 'unknown';
  return 'none';
}

export const isRelevant = (r: RelevanceReason) => r !== 'none';

/** 추천 품목 칩 — 회사 업종명의 핵심어가 들어간 공고 품목 중 자주 나온 것 */
export function suggestProducts(notices: Notice[] | null, industries: { name: string }[] | null, have: Product[] = []): Product[] {
  // '소프트웨어사업자(패키지소프트웨어개발.공급사업)' → 소프트웨어, 패키지소프트웨어개발, 공급 …
  const keys = new Set((industries ?? []).flatMap((i) =>
    i.name.split(/[().,·ㆍ\s]+/)
      .map((w) => w.replace(/(사업자|사업|업체|공사업|제조업|판매업|용역업|업)$/, ''))
      .filter((w) => w.length >= 2 && !/^(일반|기타|종합|전문|공급|개발)$/.test(w))));
  if (!keys.size || !notices) return [];
  const own = new Set(have.map((p) => p.code));
  const count = new Map<string, { p: Product; n: number }>();
  for (const n of notices) {
    for (const p of n.products) {
      if (own.has(p.code) || ![...keys].some((k) => p.name.includes(k))) continue;
      const c = count.get(p.code);
      count.set(p.code, { p, n: (c?.n ?? 0) + 1 });
    }
  }
  return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((x) => x.p);
}
