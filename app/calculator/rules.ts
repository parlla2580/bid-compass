import type { BidType } from '@/lib/data';

/*
 * 적격심사 도구 계산 규칙 (기획서 v2 5.3, 5.4)
 * 아래 기본값은 '예시값'입니다. 실제 값은 공고의 적격심사 세부기준표로 확인해야 하며,
 * 화면에서는 사용자가 대조를 확인하기 전까지 '예시 계산' 라벨을 붙입니다.
 */

/** 예비가격 범위 예시값 (±, 비율) */
export const EXAMPLE_RESERVE_RANGE = 0.02;

/**
 * 낙찰하한율 예시값 (%) — 마감 전 복수예가 공고에서 가장 흔한 값 (2026-11-17 실측 14,292건)
 * 공사 89.745%(2,985건 중 2,480건, 2%p 상향 반영), 물품 88%(718건), 용역 88%(651건)
 */
export const EXAMPLE_FLOOR_RATE: Record<BidType, number> = { '물품': 88, '용역': 88, '공사': 89.745 };

/** 낙찰기준점 일반 기준 (5.4) — 공고별로 다르므로 수정 가능 */
export const DEFAULT_PASS: Record<BidType, number> = { '물품': 85, '용역': 85, '공사': 95 };

/** 공사 하한 체크 비율 — (재료비+노무비+경비+부가가치세) × 98% */
export const CONSTRUCTION_FLOOR = 0.98;

/** 부가가치세 자동 계산 비율 (공고 내역서 값이 다르면 직접 입력) */
export const VAT_RATE = 0.1;

/**
 * 투찰 하한 금액 — A값 대상 공사는 (예정가격 − A) × 낙찰하한율 + A, 아니면 예정가격 × 낙찰하한율
 * 원 단위 올림 (내림하면 하한보다 1원 모자랄 수 있음)
 * 근거: 시설공사 적격심사 A값 산식 안내 (인포21C·비드큐), 026
 */
export function floorAmount(plan: number, floorRate: number, a = 0) {
  return Math.ceil((plan - a) * (floorRate / 100) + a - 1e-6); // 부동소수점 오차로 1원 올라가지 않게
}

/** 사정률 s(%)로 정한 투찰금액 — 기초금액 × 사정률을 예정가격으로 보고 하한 금액 */
export function bidAmount(base: number, sajeong: number, floorRate: number, a = 0) {
  return floorAmount(base * (sajeong / 100), floorRate, a);
}

export function calcBid(base: number, reserveRange: number, floorRate: number, a = 0) {
  const plan = [base * (1 - reserveRange), base * (1 + reserveRange)] as const;
  const floor = [floorAmount(plan[0], floorRate, a), floorAmount(plan[1], floorRate, a)] as const;
  return { plan, floor };
}

export type BidCheck = { level: 'ok' | 'warn' | 'danger'; text: string };

/** 내 투찰금액이 예정가격 범위·투찰 하한 구간과 어떤 관계인지 */
export function checkBid(bid: number, r: ReturnType<typeof calcBid>): BidCheck[] {
  const out: BidCheck[] = [];
  if (bid < r.floor[0]) out.push({ level: 'danger', text: '예정가격이 범위 하단으로 정해져도 낙찰하한 미만입니다' });
  else if (bid < r.floor[1]) out.push({ level: 'warn', text: '예정가격이 높게 정해지면 낙찰하한 미만이 될 수 있습니다' });
  else out.push({ level: 'ok', text: '예정가격이 범위 안 어디로 정해져도 낙찰하한 이상입니다' });

  if (bid > r.plan[1]) out.push({ level: 'danger', text: '예정가격 범위 상단보다 높습니다' });
  else if (bid > r.plan[0]) out.push({ level: 'warn', text: '예정가격이 낮게 정해지면 예정가격을 넘을 수 있습니다' });
  return out;
}

/* ---------- 점수 계산기 (5.4) ---------- */
export const SCORE_ITEMS = [
  { key: 'price', label: '가격점수', max: 60, value: 55 },
  { key: 'mgmt', label: '경영상태 점수', max: 14, value: 10 },
  { key: 'record', label: '수행실적 점수', max: 20, value: 15 },
] as const;

export type ScoreKey = (typeof SCORE_ITEMS)[number]['key'];
