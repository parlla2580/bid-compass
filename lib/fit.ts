import type { Notice, Profile } from './data';
import type { Judgment } from './judge';
import type { HistoryItem, Similarity } from './analysis';
import type { ProductMatch } from './match';

/* =========================================================
 * 적합도 — '우리 회사와 맞는 정도' (판정과 별개, 낙찰 확률 아님)
 * 판정(참여 가능 여부)을 먼저 적용하고, 참여 불가 공고에는 점수를 매기지 않는다.
 * 데이터가 있는 요소만 가중 평균한다 → 정보가 적은 회사도 점수는 나오되, 근거 수가 적다.
 * 가중치는 초기값. '추천 공고에 실제 투찰했는지'로 운영하며 조정 (기획 12.3)
 * ========================================================= */

export type FitMark = 'good' | 'mid' | 'low';
export interface FitFactor { key: string; label: string; mark: FitMark; text: string; weight: number; value: number }
export interface Fit { score: number; factors: FitFactor[] }

const W = { product: 35, industry: 25, history: 25, price: 15, region: 10, type: 5, org: 5 };

/** 과거 투찰 금액 중간 80% 범위 */
function amountBand(hist: HistoryItem[]): [number, number] | null {
  const a = hist.map((h) => h.amount).filter((x): x is number => !!x && x > 0).sort((x, y) => x - y);
  if (a.length < 3) return null;
  return [a[Math.floor(a.length * 0.1)], a[Math.min(a.length - 1, Math.ceil(a.length * 0.9) - 1)]];
}

const short = (n: number) => (n >= 1e8 ? `${Math.round(n / 1e7) / 10}억` : `${Math.round(n / 1e4).toLocaleString()}만`);

export function fitScore(n: Notice, p: Profile, j: Judgment, similar: Similarity | null, hist: HistoryItem[], pm: ProductMatch | null = null): Fit | null {
  if (j.status === 'ineligible') return null;
  const f: FitFactor[] = [];
  const add = (key: keyof typeof W, label: string, value: number, text: string) =>
    f.push({ key, label, weight: W[key], value, text, mark: value >= 0.8 ? 'good' : value >= 0.45 ? 'mid' : 'low' });

  // 0) 품목 — 회사 주요 품목과 공고 품목 (물품·용역 공고에 품목이 있을 때)
  if (p.products?.length && n.products.length) {
    add('product', '품목', pm?.sim ?? 0, pm ? `주요 품목 '${pm.mine.name}'${pm.sim >= 1 ? '과 같은 품목' : pm.sim >= 0.8 ? '과 같은 품명' : '과 비슷한 품목'}` : '주요 품목과 다른 품목');
  }

  // 1) 업종 — 내 업종을 요구하는 공고가 가장 잘 맞음
  const ind = j.reasons.find((r) => r.rule === 'industry');
  if (n.licenseLimits && ind?.result === 'pass') add('industry', '업종', 1, '우리 업종을 요구하는 공고');
  else if (!n.licenseLimits && p.industries?.length) add('industry', '업종', 0.5, '업종 제한 없음 (누구나 참여)');

  // 2) 이력 유사도 — 과거 참여·낙찰 공고와 닮은 정도
  if (hist.length) {
    const s = similar?.score ?? 0;
    const v = Math.min(1, s / 4);
    add('history', '참여 이력', v, similar?.best
      ? `${similar.best.won ? '낙찰했던' : '참여했던'} '${similar.best.title.slice(0, 18)}${similar.best.title.length > 18 ? '…' : ''}'와 비슷`
      : '비슷한 참여 이력 없음');
  }

  // 3) 금액대 — 이력이 있으면 실제 투찰 금액대, 없으면 선호 금액 범위
  if (n.estPrice > 0) {
    const band = amountBand(hist);
    const range = band ?? p.priceRange;
    if (range) {
      const [lo, hi] = range;
      const inside = n.estPrice >= lo * 0.8 && n.estPrice <= hi * 1.2;
      const ratio = n.estPrice < lo ? n.estPrice / lo : n.estPrice / hi;
      const v = inside ? 1 : Math.max(0, 1 - Math.abs(Math.log10(ratio)));
      add('price', '금액대', v, `${band ? '평소 투찰' : '선호'} 금액대 ${short(lo)}~${short(hi)}원 ${inside ? '안' : '밖'}`);
    }
  }

  // 4) 지역 — 우리 지역 업체만 들어오는 공고는 경쟁이 좁음
  const reg = j.reasons.find((r) => r.rule === 'region');
  if (n.regionLimit && reg?.result === 'pass') add('region', '지역', 1, '우리 지역 업체로 제한 (경쟁 범위 좁음)');
  else if (!n.regionLimit && p.location) add('region', '지역', 0.5, '전국 업체가 참여 가능');

  // 5) 관심 사업유형
  if (p.types.length) add('type', '사업유형', p.types.includes(n.type) ? 1 : 0.2, p.types.includes(n.type) ? `관심 유형(${n.type})` : `관심 유형 아님(${n.type})`);

  // 6) 기관 — 선호 기관이거나 거래(참여) 이력이 있는 기관
  const orgHit = p.preferredOrgs.some((o) => n.org.includes(o) || n.demandOrg?.includes(o))
    || hist.some((h) => h.org === n.org || (!!n.demandOrg && h.demand_org === n.demandOrg));
  if (orgHit) add('org', '기관', 1, '선호하거나 참여해 본 기관');
  else if (hist.length || p.preferredOrgs.length) add('org', '기관', 0.3, '처음 보는 기관');

  if (!f.length) return null;
  const total = f.reduce((s, x) => s + x.weight, 0);
  const score = Math.round((f.reduce((s, x) => s + x.weight * x.value, 0) / total) * 100);
  return { score, factors: f.sort((a, b) => b.weight - a.weight) };
}
