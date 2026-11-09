import type { Notice, Profile } from './data';
import type { Judgment } from './judge';
import type { HistoryItem, Similarity } from './analysis';
import type { ProductMatch } from './match';
import { words, type Competition } from './notices';
import { keywordHit } from './data';

/* =========================================================
 * 맞춤 점수 v2 — '우리 회사와 맞는 정도' (판정과 별개, 낙찰 확률 아님)
 *
 * v1 문제: 요소 값이 1 / 0.5처럼 몇 단계뿐이라 같은 점수(77, 58…)가 무더기로 나오고,
 *          기본값(관심 유형 3개 모두 선택 등)이 점수를 부풀려 차별성이 없었다.
 *
 * v2 구조: 점수 = 핵심 관련도(0~1) × 보정(0.75~1.1)
 *  ① 핵심 관련도 — '우리 일인가'. 아래 중 가장 높은 값 + 여러 근거가 겹치면 가산
 *     - 품목: 품명번호 앞자리 일치(10자리 1.0 / 8 0.85 / 6 0.6 / 4 0.35), 공고 품목 중 맞는 비율로 세분
 *     - 핵심어: 회사 품목·업종 이름의 핵심어가 공고명·품명에 얼마나 들어 있나 (연속값)
 *     - 이력: 과거 참여·낙찰 공고와의 유사도 (연속값)
 *     - 면허: 우리 업종을 요구하는 공고 0.7 (면허만으로는 '우리 일'이라 단정하기 어려움)
 *  ② 보정 — 금액대(로그 거리, 연속), 마감 여유, 지역 범위, 거래 경험 기관, 관심 유형(직접 좁힌 경우만)
 * ========================================================= */

export type FitMark = 'good' | 'mid' | 'low';
export interface FitFactor { key: string; label: string; mark: FitMark; text: string; weight: number; value: number }
export interface Fit { score: number; factors: FitFactor[] }

/** 과거 투찰 금액 중간 80% 범위 */
function amountBand(hist: HistoryItem[]): [number, number] | null {
  const a = hist.map((h) => h.amount).filter((x): x is number => !!x && x > 0).sort((x, y) => x - y);
  if (a.length < 3) return null;
  return [a[Math.floor(a.length * 0.1)], a[Math.min(a.length - 1, Math.ceil(a.length * 0.9) - 1)]];
}

const short = (n: number) => (n >= 1e8 ? `${Math.round(n / 1e7) / 10}억` : `${Math.round(n / 1e4).toLocaleString()}만`);
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

/** 업종 이름 → 핵심어 ('소프트웨어사업자(컴퓨터관련서비스사업)' → 소프트웨어, 컴퓨터관련서비스) */
function industryWords(names: string[]): Set<string> {
  return new Set(names.flatMap((n) => n.split(/[().,·ㆍ\s]+/)
    .map((w) => w.replace(/(사업자|사업|업체|공사업|제조업|판매업|용역업|업)$/, ''))
    .filter((w) => w.length >= 2 && !/^(일반|기타|종합|전문|공급|개발|관련|서비스)$/.test(w))));
}

/** 핵심어가 공고 글에 들어 있는 정도 — 부분 문자열 포함까지 인정, 많이 맞을수록 높게(0~1) */
function keywordScore(keys: Set<string>, text: string): { v: number; hit: string[] } {
  if (!keys.size) return { v: 0, hit: [] };
  const hit = [...keys].filter((k) => text.includes(k));
  if (!hit.length) return { v: 0, hit };
  // 1개 0.45, 2개 0.65, 3개 이상 0.8 + 긴 핵심어(구체적인 말) 가산
  const base = hit.length >= 3 ? 0.8 : hit.length === 2 ? 0.65 : 0.45;
  const specific = Math.min(0.15, hit.reduce((s, w) => s + Math.max(0, w.length - 3) * 0.03, 0));
  return { v: clamp(base + specific), hit };
}

export function fitScore(n: Notice, p: Profile, j: Judgment, similar: Similarity | null, hist: HistoryItem[], pm: ProductMatch | null = null, comp: Competition | null = null): Fit | null {
  if (j.status === 'ineligible') return null;
  const f: FitFactor[] = [];
  const mark = (v: number): FitMark => (v >= 0.75 ? 'good' : v >= 0.45 ? 'mid' : 'low');
  const push = (key: string, label: string, value: number, text: string, weight = 1) => f.push({ key, label, value, text, weight, mark: mark(value) });

  /* ---------- ① 핵심 관련도 ---------- */
  const cores: number[] = [];
  const text = `${n.title} ${n.products.map((x) => x.name).join(' ')}`;

  // 품목 — 계층 일치 + 공고 품목 중 맞는 비율
  if (p.products?.length && n.products.length) {
    const level = (a: string, b: string) =>
      a.slice(0, 10) === b.slice(0, 10) && a.length >= 10 && b.length >= 10 ? 1
        : a.slice(0, 8) === b.slice(0, 8) ? (a.length === 8 && b.length === 8 ? 1 : 0.85)
          : a.slice(0, 6) === b.slice(0, 6) ? 0.6 : a.slice(0, 4) === b.slice(0, 4) ? 0.35 : 0;
    const per = n.products.map((t) => Math.max(...p.products!.map((m) => level(m.code, t.code))));
    const best = Math.max(...per);
    const share = per.filter((v) => v >= 0.6).length / per.length; // 여러 품목 공고에서 우리 품목 비중
    const v = best > 0 ? clamp(best * (0.85 + 0.15 * share)) : 0;
    if (v > 0) cores.push(v);
    push('product', '품목', v, pm && v > 0
      ? `주요 품목 '${pm.mine.name}'${best >= 1 ? '과 같은 품목' : best >= 0.85 ? '과 같은 품명' : '과 비슷한 분류'}${per.length > 1 ? ` (공고 품목 ${per.length}개 중 ${per.filter((x) => x >= 0.6).length}개)` : ''}`
      : '주요 품목과 다른 품목', 3);
  }

  // 핵심어 — 회사 품목명·업종명
  const off = new Set((p.muted ?? []).filter((m) => m.kind === 'industry').map((m) => m.code));
  const activeInd = (p.industries ?? []).filter((i) => !off.has(i.code));
  const keys = new Set([...industryWords(activeInd.map((i) => i.name)), ...(p.products ?? []).flatMap((x) => [...words(x.name)])]);
  const kw = keywordScore(keys, text);
  if (kw.v > 0) { cores.push(kw.v); push('keyword', '핵심어', kw.v, `공고에 '${kw.hit.slice(0, 3).join("', '")}' 포함`, 2); }

  // 꼭 볼 단어 — 사용자가 직접 지정한 단어는 강한 근거
  const plus = keywordHit(n, p.keywords?.plus);
  if (plus) { cores.push(0.9); push('plus', '꼭 볼 단어', 0.9, `'${plus}'이(가) 들어간 공고`, 3); }

  // 이력
  if (hist.length) {
    const v = clamp((similar?.score ?? 0) / 4);
    if (v > 0) cores.push(v);
    push('history', '참여 이력', v, similar?.best
      ? `${similar.best.won ? '낙찰했던' : '참여했던'} '${similar.best.title.slice(0, 18)}${similar.best.title.length > 18 ? '…' : ''}'와 비슷`
      : '비슷한 참여 이력 없음', 2);
  }

  // 면허 — 우리(켜 둔) 업종을 요구
  const ind = j.reasons.find((r) => r.rule === 'industry');
  if (n.licenseLimits && ind?.result === 'pass') {
    const codes = new Set(activeInd.map((i) => i.code));
    const mine = n.licenseLimits.some((l) => (l.code && codes.has(l.code)) || l.allowed.some((a) => codes.has(/\/(\w+)$/.exec(a)?.[1] ?? '')));
    if (mine) {
      // 면허만 맞는 건 약한 근거 — 허용 업종이 적을수록(우리 업종만 콕 집은 공고일수록) 높게: 0.45 ~ 0.65
      const options = n.licenseLimits.length + n.licenseLimits.reduce((x, l) => x + l.allowed.length, 0);
      const v = 0.45 + 0.2 / Math.sqrt(Math.max(1, options));
      cores.push(v);
      push('license', '면허', v, options <= 1 ? '우리 업종만 콕 집어 요구하는 공고' : `우리 업종을 포함해 ${options}개 업종을 허용하는 공고`, 2);
    }
  }

  if (!cores.length) {
    // 근거가 하나도 없으면 낮은 기본값 (판단 정보가 없는 회사는 0.35)
    cores.push(p.products?.length || hist.length ? 0.15 : 0.35);
  }
  const sorted = cores.sort((a, b) => b - a);
  // 가장 강한 근거 + 다른 근거가 겹칠수록 더 (둘째 ×0.25, 셋째 ×0.1)
  const core = clamp(sorted[0] + (sorted[1] ?? 0) * 0.25 + (sorted[2] ?? 0) * 0.1, 0, 1);

  /* ---------- ② 보정 ---------- */
  let mod = 1;

  // 금액대 — 평소 투찰 금액대(이력) 또는 선호 범위에서 로그 거리로 멀어질수록 감점
  if (n.estPrice > 0) {
    const range = amountBand(hist) ?? p.priceRange;
    if (range) {
      const [lo, hi] = range;
      const dist = n.estPrice < lo ? Math.log10(lo / n.estPrice) : n.estPrice > hi ? Math.log10(n.estPrice / hi) : 0;
      const m = dist === 0 ? 1.05 : clamp(1 - dist * 0.25, 0.75, 1);
      mod *= m;
      push('price', '금액대', dist === 0 ? 1 : clamp(1 - dist * 0.5), `${amountBand(hist) ? '평소 투찰' : '선호'} 금액대 ${short(lo)}~${short(hi)}원 ${dist === 0 ? '안' : '밖'}`);
    }
  }

  // 마감 여유 — 오늘·내일 마감은 준비가 빠듯, 3~14일이 적당
  if (n.d >= 0 && n.d <= 1) { mod *= 0.88; push('deadline', '마감', 0.3, n.d === 0 ? '오늘 마감이라 준비가 빠듯해요' : '내일 마감이라 준비가 빠듯해요'); }
  else if (n.d === 2) mod *= 0.95;
  else if (n.d > 30) mod *= 0.97;

  // 지역 — 우리 지역으로 제한된 공고는 경쟁 범위가 좁음
  const reg = j.reasons.find((r) => r.rule === 'region');
  if (n.regionLimit && reg?.result === 'pass') {
    const narrow = n.regionLimit.every((r) => r.trim().includes(' ')); // 시군구 단위 제한
    mod *= narrow ? 1.08 : 1.04;
    push('region', '지역', 1, narrow ? '우리 시군구 업체로 제한 (경쟁 범위 매우 좁음)' : '우리 시도 업체로 제한 (경쟁 범위 좁음)');
  }

  // 경쟁 강도 — 이 기관의 같은 유형 공고에 보통 몇 곳이 들어오나 (최근 1년, 3건 이상일 때만, 참고)
  const org = n.demandOrg ?? n.org;
  const c = comp?.byOrg.get(`${org}|${n.type}`) ?? comp?.byOrg.get(`${n.org}|${n.type}`);
  const typical = comp?.byType.get(n.type);
  if (c && typical) {
    const ratio = c.median / typical;
    if (ratio <= 0.5) { mod *= 1.06; push('competition', '경쟁', 1, `경쟁이 적은 편이에요 (보통 ${c.median}곳, 참고)`); }
    else if (ratio <= 0.8) { mod *= 1.03; push('competition', '경쟁', 0.8, `경쟁이 조금 적은 편이에요 (보통 ${c.median}곳, 참고)`); }
    else if (ratio >= 2) { mod *= 0.95; push('competition', '경쟁', 0.3, `경쟁이 많은 편이에요 (보통 ${c.median}곳, 참고)`); }
  }

  // 기관 — 선호하거나 참여해 본 기관
  const orgHit = p.preferredOrgs.some((o) => n.org.includes(o) || n.demandOrg?.includes(o))
    || hist.some((h) => h.org === n.org || (!!n.demandOrg && h.demand_org === n.demandOrg));
  if (orgHit) { mod *= 1.05; push('org', '기관', 1, '선호하거나 참여해 본 기관'); }

  // 관심 유형 — 사용자가 직접 좁힌 경우에만 반영 (기본값 '전체'는 점수에 영향 없음)
  if (p.types.length && p.types.length < 3 && !p.types.includes(n.type)) { mod *= 0.8; push('type', '사업유형', 0.2, `관심 유형 아님(${n.type})`); }

  const score = Math.round(clamp(core * mod, 0.05, 0.99) * 100);
  return { score, factors: f.sort((a, b) => b.weight - a.weight || b.value - a.value) };
}
