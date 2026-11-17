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

/** 신용평가등급 묶음 — 회사채 / 기업어음 / 기업신용평가등급(①에 준하는 등급) */
export const CREDIT = [
  { key: 'BBplus', label: 'BB° 이상', hint: '회사채 AAA~BB° · 기업어음 A1~B+' },
  { key: 'BBminus', label: 'BB-', hint: '기업어음 B°' },
  { key: 'B', label: 'B+ ~ B-', hint: '기업어음 B-' },
  { key: 'CCC', label: 'CCC+ 이하', hint: '기업어음 C 이하' },
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

/** 비가격 만점일 때 고정 평점을 받는 가장 낮은 비율 = 낙찰하한율 (검증용, %) */
export function impliedFloor(tier: Tier): number {
  const p = tier.price;
  const low = p.c - (p.max - p.fixed) / (p.k * 100); // 반올림 후 이 값 이상
  return Math.round((low - 0.00005) * 1e6) / 1e4; // %로, 반올림해서 low가 되는 가장 작은 값
}

export interface PassRange {
  /** 필요한 가격 평점 */
  need: number;
  /** 통과 가능한 (입찰가격−A)/(예정가격−A) 범위 (%, 반올림 전 값 기준) — 없으면 null */
  low: number | null;
  high: number | null;
  /** 특례(고정 평점) 구간까지 통과하는지 */
  wide: boolean;
}

/**
 * 통과에 필요한 투찰 비율 범위
 * nonPrice: 가격 외 점수 합 (가점·감점 반영)
 */
export function passRange(tier: Tier, nonPrice: number): PassRange {
  const p = tier.price;
  const need = Math.round((tier.pass - nonPrice) * 1000) / 1000;
  if (need > p.max) return { need, low: null, high: null, wide: false };
  const d = Math.max(0, (p.max - need) / (p.k * 100)); // 기준율에서 벗어나도 되는 폭
  const lowR = p.c - d;
  const pct = (v: number) => Math.round(v * 1e6) / 1e4;
  if (need <= p.fixed) return { need, low: pct(lowR - 0.00005), high: 100, wide: true };
  return { need, low: pct(lowR - 0.00005), high: pct(p.c + d + 0.000049), wide: false };
}

/** 비율(%) → 투찰금액 (원 올림) */
export function amountAt(plan: number, ratioPct: number, a = 0) {
  return Math.ceil((plan - a) * (ratioPct / 100) + a - 1e-6);
}
