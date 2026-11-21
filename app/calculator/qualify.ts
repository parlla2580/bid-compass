/*
 * 공사 적격심사 — 가격점수 계산과 '우리 회사가 통과하려면 몇 %로 써야 하나' 역산
 *
 * 근거 (원문 확인, 2026-11-17)
 *  · 행정안전부 예규 제325호 「지방자치단체 입찰시 낙찰자 결정기준」 [시행 2025.7.1]
 *    제2장의1 시설공사 적격심사 세부기준 [별표 2]~[별표 7], 제6절(적격통과점수)
 *  · 가격 평점 = 배점 − 계수 × |90/100 − (입찰가격−A)/(예정가격−A)| × 100
 *      (입찰가격−A)/(예정가격−A)는 소수점 다섯째 자리에서 반올림
 *      (입찰가격−A)이 (예정가격−A) 이하이면서 그 '특례율' 이상이면 고정 평점
 *      최저평점 2점
 *  · 적격통과점수: 추정가격 100억 원 미만 95점
 *  · 경영상태 신용평가방법 점수표 (회사채·기업어음·기업신용평가등급)
 *  검증: 비가격 만점 회사가 고정 평점을 받는 가장 낮은 비율이 공고 낙찰하한율과 같음
 *        (10억 미만 89.745%, 10억~50억 88.745%, 50억~100억 87.495% — 마감 전 공고 실측과 일치)
 *
 * 조달청(국가기관) 시설공사 기준표는 아직 원문(별표)을 확인하지 못함 → 화면에서 '확인 전' 표시
 */

export interface Tier {
  key: string;
  label: string;
  /** 추정가격 범위 (원) — [이상, 미만) */
  min: number;
  max: number;
  /** 별표 번호 (행안부) */
  table: number;
  /** 가격 배점·계수·기준율·특례율·고정 평점 */
  price: { max: number; k: number; c: number; t: number; fixed: number; min: number };
  /** 가격 외 만점 — 수행능력 등 (가점 제외) */
  nonPrice: number;
  /** 가격 외 항목 설명 */
  items: { label: string; max: number }[];
  /** 경영상태 — 신용평가등급별 점수 (CREDIT 순서) */
  credit: number[];
  pass: number;
}

/** 신용평가등급 묶음 — 회사채 / 기업어음 / 기업신용평가등급(①에 준하는 등급)
 *  표기·묶음·점수는 행안부 예규 제325호(2025.7.1 시행) 시설공사 적격심사 세부기준 [별표 2]~[별표 7] 원문과 대조 (2026-11-22, W15)
 *  '°'는 예규 원문 표기(BB° = BB 플랫)를 그대로 씀 */
export const CREDIT = [
  { key: 'BBplus', label: 'BB° 이상', hint: '회사채·기업신용평가 AAA~BB° · 기업어음 A1~B+' },
  { key: 'BBminus', label: 'BB-', hint: '회사채·기업신용평가 BB- · 기업어음 B°' },
  { key: 'B', label: 'B+ ~ B-', hint: '회사채·기업신용평가 B+~B- · 기업어음 B-' },
  { key: 'CCC', label: 'CCC+ 이하', hint: '회사채·기업신용평가 CCC+ 이하 · 기업어음 C 이하' },
] as const;

const r10 = [10, 9.8, 9.6, 6.0];
const scale = (list: number[], f: number) => list.map((v) => Math.round(v * f * 1000) / 1000);

export const TIERS: Tier[] = [
  {
    key: 't2', label: '50억~100억 원', min: 50e8, max: 100e8, table: 2,
    price: { max: 50, k: 2, c: 0.9, t: 0.925, fixed: 45, min: 2 },
    nonPrice: 50,
    items: [{ label: '수행능력', max: 30 }, { label: '직접시공·하도급관리계획', max: 10 }, { label: '자재·인력조달가격', max: 10 }],
    credit: scale([21, 20, 19, 16], 15 / 21), pass: 95,
  },
  {
    key: 't3', label: '30억~50억 원', min: 30e8, max: 50e8, table: 3,
    price: { max: 70, k: 4, c: 0.9, t: 0.9125, fixed: 65, min: 2 },
    nonPrice: 30,
    items: [{ label: '수행능력', max: 25 }, { label: '직접시공·하도급관리계획', max: 5 }],
    credit: scale([15, 14, 13, 10], 10 / 15), pass: 95,
  },
  {
    key: 't4', label: '10억~30억 원', min: 10e8, max: 30e8, table: 4,
    price: { max: 70, k: 4, c: 0.9, t: 0.9125, fixed: 65, min: 2 },
    nonPrice: 30, items: [{ label: '수행능력 (시공경험 15 + 경영상태 15)', max: 30 }],
    credit: [15, 14, 13, 10], pass: 95,
  },
  {
    key: 't5', label: '4억~10억 원', min: 4e8, max: 10e8, table: 5,
    price: { max: 80, k: 20, c: 0.9, t: 0.9025, fixed: 75, min: 2 },
    nonPrice: 20, items: [{ label: '수행능력 (시공경험 10 + 경영상태 10)', max: 20 }],
    credit: r10, pass: 95,
  },
  {
    key: 't6', label: '2억~4억 원', min: 2e8, max: 4e8, table: 6,
    price: { max: 90, k: 20, c: 0.9, t: 0.9025, fixed: 85, min: 2 },
    nonPrice: 10, items: [{ label: '수행능력 (시공경험 4.8~5 + 경영상태 5)', max: 10 }],
    credit: scale(r10, 0.5), pass: 95,
  },
  {
    key: 't7', label: '2억 원 미만', min: 0, max: 2e8, table: 7,
    price: { max: 90, k: 20, c: 0.9, t: 0.9025, fixed: 85, min: 2 },
    nonPrice: 10, items: [{ label: '수행능력 (시공경험 4 + 경영상태 5 + 접근성 1)', max: 10 }],
    credit: scale(r10, 0.5), pass: 95,
  },
];

export const tierOf = (est: number | null | undefined): Tier | null =>
  est && est > 0 ? TIERS.find((t) => est >= t.min && est < t.max) ?? null : null;

/** (입찰가격−A)/(예정가격−A) — 소수점 다섯째 자리에서 반올림 (넷째 자리까지) */
export const roundRatio = (x: number) => Math.round(x * 10000 + 1e-9) / 10000;

/** 가격 평점 — ratio는 반올림 전 비율 */
export function priceScore(tier: Tier, ratio: number): number {
  const r = roundRatio(ratio);
  const p = tier.price;
  if (r <= 1 && r >= p.t) return p.fixed;
  const s = p.max - p.k * Math.abs(p.c - r) * 100;
  return Math.max(p.min, Math.round(s * 1000) / 1000);
}

/*
 * 평가 비율은 소수점 넷째 자리(0.0001 단위)로 반올림된 값으로 점수를 매김
 *  → 통과하는 '반올림된 비율'의 최소·최대를 0.0001 단위로 구한 뒤,
 *    실제로 써도 되는 비율은 [최소 − 0.00005, 최대 + 0.00005) (반올림 경계)
 */
const U = 10000;
const C4 = (t: Tier) => Math.round(t.price.c * U);
/** 기준율에서 벗어나도 되는 폭 (0.0001 단위) */
const slack = (t: Tier, need: number) => ((t.price.max - need) * 100) / t.price.k;
const pct6 = (units: number) => Math.round(units * 10) / 1000; // 0.0001 단위 → % (예: 8974.5 → 89.745)

/** 비가격 만점일 때 고정 평점을 받는 가장 낮은 비율 = 낙찰하한율 (검증용, %) */
export function impliedFloor(tier: Tier): number {
  const rMin = Math.ceil(C4(tier) - slack(tier, tier.price.fixed) - 1e-9);
  return pct6(rMin - 0.5);
}

export interface PassRange {
  /** 필요한 가격 평점 */
  need: number;
  /** 통과하는 투찰 비율 (%) — low 이상, high 미만. 없으면 null */
  low: number | null;
  high: number | null;
  /** 특례(고정 평점) 구간까지 통과하는지 (high = 100%) */
  wide: boolean;
}

/** 통과에 필요한 투찰 비율 범위 — nonPrice: 가격 외 점수 합 (가점·감점 반영) */
export function passRange(tier: Tier, nonPrice: number): PassRange {
  const p = tier.price;
  const need = Math.round((tier.pass - nonPrice) * 1000) / 1000;
  if (need > p.max) return { need, low: null, high: null, wide: false };
  const d = Math.max(0, slack(tier, need));
  const rMin = Math.ceil(C4(tier) - d - 1e-9);
  if (need <= p.fixed) return { need, low: pct6(rMin - 0.5), high: 100, wide: true };
  const rMax = Math.floor(C4(tier) + d + 1e-9);
  if (rMax < rMin) return { need, low: null, high: null, wide: false };
  return { need, low: pct6(rMin - 0.5), high: pct6(rMax + 0.5), wide: false };
}

/** 비율(%) → 투찰금액 (원 올림) */
export function amountAt(plan: number, ratioPct: number, a = 0) {
  return Math.ceil((plan - a) * (ratioPct / 100) + a - 1e-6);
}

/* ---------- 공고마다 '우리 회사 통과선' (로드맵 2, 2026-11-21) ---------- */

/** 지자체 공고로 보이는 기관 (행안부 기준표 적용) */
// '경기도 양평군 양서면'처럼 읍·면·동으로 끝나는 지자체 기관도 (2026-11-21)
export const LOCAL_ORG = /(특별시|광역시|특별자치|도청|시청|군청|구청|교육청|교육지원청|[시군구도]$|[시군구]의회|도의회|\S[시군구]\s\S+[읍면동]$|^(경기|강원|충청북|충청남|전라북|전라남|경상북|경상남)도\s)/;

/** 저장한 점수 프로필로 이 구간의 가격 외 점수 */
export function nonPriceOf(tier: Tier, q: { credit: number; otherRatio: number; adj: number }) {
  const otherMax = tier.nonPrice - tier.credit[0];
  const c = tier.credit[Math.min(Math.max(q.credit, 0), tier.credit.length - 1)];
  return Math.round((c + otherMax * Math.min(Math.max(q.otherRatio, 0), 1) + q.adj) * 1000) / 1000;
}

export type PassStatus = 'floor' | 'above' | 'fail';
export interface NoticePass {
  tier: Tier; nonPrice: number; range: PassRange; floor: number;
  /** 하한율보다 더 써야 하는 폭 (%p) */
  gap: number | null; status: PassStatus; local: boolean;
}

/** 공사 적격심사 공고 + 저장한 점수 → 통과 투찰 비율. 대상이 아니면 null */
export function noticePass(
  n: { type: string; award: string | null; estPrice: number; floorRate: number | null; org: string; demandOrg: string | null },
  q: { credit: number; otherRatio: number; adj: number } | null | undefined,
): NoticePass | null {
  if (!q || n.type !== '공사' || !/적격심사/.test(n.award ?? '')) return null;
  const tier = tierOf(n.estPrice);
  if (!tier) return null;
  const nonPrice = nonPriceOf(tier, q);
  const range = passRange(tier, nonPrice);
  const floor = n.floorRate ?? impliedFloor(tier);
  const gap = range.low !== null ? Math.round((range.low - floor) * 1000) / 1000 : null;
  const status: PassStatus = range.low === null ? 'fail' : gap !== null && gap > 0 ? 'above' : 'floor';
  return { tier, nonPrice, range, floor, gap, status, local: LOCAL_ORG.test(n.demandOrg ?? n.org ?? '') };
}
