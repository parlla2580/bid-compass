import type { Notice, Profile } from './data';
import type { Judgment } from './judge';
import type { HistoryItem, Similarity } from './analysis';
import type { ProductMatch } from './match';
import { words, type Competition } from './notices';
import { keywordHit } from './data';
import { licCode, specificity, titleDf, type Stats } from './stats';

/* =========================================================
 * 맞춤 점수 v4 — '우리 회사와 맞는 정도' (판정과 별개, 낙찰 확률 아님)
 *
 * v3 문제: 흔한 품목·업종도 드문 것과 같은 배점 → 솔트룩스형 회사 맞춤 1,871건, 80점대 893건
 * v4 (2026-11-12): 근거마다 '얼마나 드문가'(특이도, lib/stats)로 배점 차등 + 이력 유사 공고 강하게
 *
 * 점수 = 20 + 관련도 55 × R + 이력 30 × H + 조건(금액·지역·경쟁·기관·마감·유형)
 *  R = 가장 강한 근거 + 나머지는 남은 거리의 35%씩 (상관된 근거를 할인한 noisy-OR)
 *    - 품목  v = 계층 일치(1/0.85/0.6/0.35) × 공고 내 비중 × (0.4 + 0.6 × 특이도)
 *    - 단어  v = 1 − Π(1 − 0.6 × 특이도_w)  공고명에 나온 회사 핵심어 (품명에만 있으면 절반, 품목 근거와 겹치면 절반)
 *    - 면허  v = 0.15 + 0.45 × 특이도 × 좁힘(허용 업종이 적을수록)
 *    - 꼭 볼 단어 0.9
 *  H = 이력 유사도(TF-IDF, lib/analysis) — 따로 30점까지 더해 가장 강하게
 * 관문(맞춤 공고): R ≥ 0.7 (품목 없는 회사 0.4) 또는 H ≥ 0.3 또는 꼭 볼 단어 — 못 넘으면 '다른 참여 가능'으로 접음
 * ========================================================= */

export type FitMark = 'good' | 'mid' | 'low';
export interface FitFactor { key: string; label: string; mark: FitMark; text: string; weight: number; value: number }
export interface Fit {
  score: number;
  factors: FitFactor[];
  /** 관련도 R(0~1)과 이력 H(0~1) */
  rel: number;
  hist: number;
  /** 맞춤 공고 관문 통과 */
  gate: boolean;
}

/** 맞춤 공고 관문 */
export const GATE = { rel: 0.7, relNoProduct: 0.4, hist: 0.3 };
/** '이력과 비슷한 공고' 묶음 기준 — 맞춤 관문(0.3)보다 높게 (관문과 같으면 맞춤 공고 거의 전부가 들어감) */
export const HIST_STRONG = 0.6;

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

export function fitScore(n: Notice, p: Profile, j: Judgment, similar: Similarity | null, hist: HistoryItem[], pm: ProductMatch | null = null, comp: Competition | null = null, stats: Stats | null = null): Fit | null {
  if (j.status === 'ineligible') return null;
  const f: FitFactor[] = [];
  const mark = (v: number): FitMark => (v >= 0.75 ? 'good' : v >= 0.45 ? 'mid' : 'low');
  const push = (key: string, label: string, value: number, text: string, weight = 1) => f.push({ key, label, value, text, weight, mark: mark(value) });
  const spec = (df: number | undefined) => (stats ? specificity(stats, df ?? 0) : 0.6);
  const rarity = (sp: number, df?: number) => (!stats || df === undefined ? '' : sp >= 0.75 ? ' · 드문 일치' : sp < 0.4 ? ` · 흔한 품목(공고 ${df.toLocaleString()}건)` : '');

  /* ---------- ① 관련도 R — 근거별 특이도로 차등 ---------- */
  const ev: number[] = [];

  // 품목 — 계층 일치 × 공고 내 비중 × 특이도
  let prodV = 0;
  if (p.products?.length && n.products.length) {
    const level = (a: string, b: string): [number, number] =>
      a.length >= 10 && b.length >= 10 && a.slice(0, 10) === b.slice(0, 10) ? [1, 10]
        : a.slice(0, 8) === b.slice(0, 8) ? [a.length === 8 && b.length === 8 ? 1 : 0.85, 8]
          : a.slice(0, 6) === b.slice(0, 6) ? [0.6, 6] : a.slice(0, 4) === b.slice(0, 4) ? [0.35, 4] : [0, 0];
    let best = 0, bestLen = 0, bestCode = '';
    const per = n.products.map((t) => {
      let m = 0;
      for (const mine of p.products!) {
        const [v, len] = level(mine.code, t.code);
        if (v > m) m = v;
        if (v > best) { best = v; bestLen = len; bestCode = t.code; }
      }
      return m;
    });
    const share = per.filter((v) => v >= 0.6).length / per.length;
    const df = bestLen ? stats?.prod.get(bestCode.slice(0, bestLen)) : undefined;
    const sp = spec(df);
    prodV = best > 0 ? clamp(best * (0.85 + 0.15 * share) * (0.4 + 0.6 * sp)) : 0;
    if (prodV > 0) ev.push(prodV);
    push('product', '품목', prodV, pm && prodV > 0
      ? `주요 품목 '${pm.mine.name}'${best >= 1 ? '과 같은 품목' : best >= 0.85 ? '과 같은 품명' : '과 비슷한 분류'}${per.length > 1 ? ` (공고 품목 ${per.length}개 중 ${per.filter((x) => x >= 0.6).length}개)` : ''}${rarity(sp, df)}`
      : '주요 품목과 다른 품목', 3);
  }

  // 단어 — 회사 품목명·업종명 핵심어. 낱말마다 특이도로 가중 (흔한 'AI'·'소프트웨어'는 작게)
  const off = new Set((p.muted ?? []).filter((m) => m.kind === 'industry').map((m) => m.code));
  const activeInd = (p.industries ?? []).filter((i) => !off.has(i.code));
  // 품목을 넣은 회사는 품목명 낱말만 — 업종명 낱말('연구용역' 등)은 너무 넓음. 품목이 없을 때만 업종명 사용
  const keys = [...new Set(p.products?.length ? p.products.flatMap((x) => [...words(x.name)]) : [...industryWords(activeInd.map((i) => i.name))])];
  const names = n.products.map((x) => x.name).join(' ');
  let kwMiss = 1;
  const hits: { w: string; sp: number }[] = [];
  for (const w of keys) {
    const inTitle = n.title.includes(w);
    if (!inTitle && !names.includes(w)) continue;
    const sp = stats ? specificity(stats, titleDf(stats, w)) : 0.6;
    kwMiss *= 1 - 0.6 * sp * (inTitle ? 1 : 0.5);
    hits.push({ w, sp });
  }
  // 품목 근거와 같은 이야기를 반복하는 경우가 많아, 품목이 맞았으면 절반만
  const kwV = (1 - kwMiss) * (prodV > 0 ? 0.5 : 1);
  if (kwV > 0.02) {
    ev.push(kwV);
    const top = hits.sort((a, b) => b.sp - a.sp).slice(0, 3);
    push('keyword', '핵심어', kwV, `공고에 '${top.map((h) => h.w).join("', '")}' 포함${top.every((h) => h.sp < 0.4) ? ' · 흔한 낱말' : ''}`, 2);
  }

  // 꼭 볼 단어 — 사용자가 직접 지정한 단어는 강한 근거
  const plus = keywordHit(n, p.keywords?.plus);
  if (plus) { ev.push(0.9); push('plus', '꼭 볼 단어', 0.9, `'${plus}'이(가) 들어간 공고`, 3); }

  // 면허 — 우리(켜 둔) 업종을 요구. 흔한 업종(소프트웨어사업자 등)일수록, 허용 업종이 많을수록 약함
  const ind = j.reasons.find((r) => r.rule === 'industry');
  if (n.licenseLimits && ind?.result === 'pass') {
    const codes = new Set(activeInd.map((i) => i.code));
    const mine = new Set<string>();
    for (const l of n.licenseLimits) { if (l.code && codes.has(l.code)) mine.add(l.code); l.allowed.forEach((a) => { const c = licCode(a); if (codes.has(c)) mine.add(c); }); }
    if (mine.size) {
      const options = n.licenseLimits.length + n.licenseLimits.reduce((x, l) => x + l.allowed.length, 0);
      const df = Math.min(...[...mine].map((c) => stats?.lic.get(c) ?? 0));
      const sp = spec(stats ? df : undefined);
      let v = 0.15 + 0.45 * sp * (0.5 + 0.5 / Math.sqrt(Math.max(1, options)));
      // 우리 지역으로 제한된 공고면 '면허 + 지역'이 함께 좁혀 줌 (공사업처럼 품목이 없는 업종의 핵심 근거)
      const reg = j.reasons.find((r) => r.rule === 'region');
      if (n.regionLimit && reg?.result === 'pass') v += (1 - v) * (n.regionLimit.every((r) => r.trim().includes(' ')) ? 0.5 : 0.3);
      ev.push(v);
      push('license', '면허', v, `${options <= 1 ? '우리 업종만 요구' : `우리 업종 포함 ${options}개 업종 허용`}${stats && sp < 0.4 ? ` · 흔한 업종(공고 ${df.toLocaleString()}건)` : ''}`, 2);
    }
  }

  // 결합 — 가장 강한 근거 + 나머지는 남은 거리의 35%씩 (품목·업종·낱말은 같은 사실을 반복하는 경우가 많아 독립으로 보지 않음)
  const R = ev.sort((a, b) => b - a).reduce((x, v, i) => (i === 0 ? v : x + (1 - x) * 0.35 * v), 0);

  // 이력 — 가장 강한 근거, 따로 더함
  const H = hist.length ? clamp(similar?.score ?? 0) : 0;
  if (hist.length) {
    push('history', '참여 이력', H, similar?.best && H > 0.05
      ? `${similar.best.won ? '낙찰했던' : '참여했던'} '${similar.best.title.slice(0, 18)}${similar.best.title.length > 18 ? '…' : ''}'와 비슷`
      : '비슷한 참여 이력 없음', H > 0.05 ? 4 : 0.5);
  }

  // 근거가 하나도 없는 회사(품목·이력 모두 없음)는 판단 정보 부족 → 중간 아래
  const relPts = 55 * (ev.length ? R : p.products?.length || hist.length ? 0.1 : 0.3) + 30 * H;
  // 품목·이력이 없는 회사(공사업 등)는 면허가 핵심 근거라 관문을 낮춤
  const gate = R >= (p.products?.length ? GATE.rel : GATE.relNoProduct) || H >= GATE.hist || !!plus;

  /* ---------- ② 조건 점수 (더하고 빼기) ---------- */
  let cond = 0;

  // 금액대 — 평소 투찰 금액대(이력) 또는 선호 범위. 모르면 중간값(+4)
  const range = amountBand(hist) ?? p.priceRange;
  if (n.estPrice > 0 && range) {
    const [lo, hi] = range;
    const dist = n.estPrice < lo ? Math.log10(lo / n.estPrice) : n.estPrice > hi ? Math.log10(n.estPrice / hi) : 0;
    cond += dist === 0 ? 10 : Math.max(-10, 6 - dist * 20);
    push('price', '금액대', dist === 0 ? 1 : clamp(1 - dist * 0.5), `${amountBand(hist) ? '평소 투찰' : '선호'} 금액대(${short(lo)}~${short(hi)}원) ${dist === 0 ? '안' : '밖'}`);
  } else cond += 4;

  // 마감 여유 — 오늘·내일 마감은 준비가 빠듯
  if (n.d >= 0 && n.d <= 1) { cond -= 10; push('deadline', '마감', 0.3, n.d === 0 ? '오늘 마감 — 준비가 빠듯해요' : '내일 마감 — 준비가 빠듯해요'); }
  else if (n.d === 2) cond -= 4;
  else if (n.d > 30) cond -= 2;

  // 지역 — 우리 지역으로 제한된 공고는 경쟁 범위가 좁음
  const reg = j.reasons.find((r) => r.rule === 'region');
  if (n.regionLimit && reg?.result === 'pass') {
    const narrow = n.regionLimit.every((r) => r.trim().includes(' ')); // 시군구 단위 제한
    cond += narrow ? 8 : 4;
    push('region', '지역', 1, narrow ? '우리 시군구 업체만 참여' : '우리 시도 업체만 참여');
  }

  // 기업규모 — 소기업·소상공인(또는 중소기업)끼리만 겨루는 공고로 추정되고 우리가 해당하면 경쟁 범위가 좁음
  const sz = j.reasons.find((r) => r.rule === 'size');
  if (sz?.result === 'pass' && p.size) { cond += 4; push('size', '기업규모', 0.9, sz.text); }

  // 경쟁 강도 — 이 기관의 같은 유형 공고에 보통 몇 곳이 들어오나 (최근 1년, 3건 이상일 때만, 참고)
  const org = n.demandOrg ?? n.org;
  const c = comp?.byOrg.get(`${org}|${n.type}`) ?? comp?.byOrg.get(`${n.org}|${n.type}`);
  const typical = comp?.byType.get(n.type);
  if (c && typical) {
    const ratio = c.median / typical;
    if (ratio <= 0.5) { cond += 6; push('competition', '경쟁', 1, `경쟁이 적은 편이에요 (보통 ${c.median}곳, 참고)`); }
    else if (ratio <= 0.8) { cond += 3; push('competition', '경쟁', 0.8, `경쟁이 조금 적은 편이에요 (보통 ${c.median}곳, 참고)`); }
    else if (ratio >= 2) { cond -= 4; push('competition', '경쟁', 0.3, `경쟁이 많은 편이에요 (보통 ${c.median}곳, 참고)`); }
  }

  // 기관 — 선호하거나 참여해 본 기관
  const orgHit = p.preferredOrgs.some((o) => n.org.includes(o) || n.demandOrg?.includes(o))
    || hist.some((h) => h.org === n.org || (!!n.demandOrg && h.demand_org === n.demandOrg));
  if (orgHit) { cond += 6; push('org', '기관', 1, '참여해 봤거나 선호하는 기관'); }

  // 관심 유형 — 사용자가 직접 좁힌 경우에만 반영 (기본값 '전체'는 점수에 영향 없음)
  if (p.types.length && p.types.length < 3 && !p.types.includes(n.type)) { cond -= 15; push('type', '사업유형', 0.2, `관심 유형 아님(${n.type})`); }

  // 최종 = 기본 20 + 관련도(≤55) + 이력(≤30) + 조건(대략 -25~+40)
  const score = Math.round(clamp(20 + relPts + cond, 5, 99));
  return { score, rel: R, hist: H, gate, factors: f.sort((a, b) => b.weight - a.weight || b.value - a.value) };
}
