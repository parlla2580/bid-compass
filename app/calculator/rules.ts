import type { BidType } from '@/lib/data';

/*
 * 프로토타입 가정값입니다. 실제 적격심사 세부기준(발주기관·추정가격 구간별)으로
 * 검증한 뒤 교체해야 합니다 (4단계).
 */

export type LawKey = 'national' | 'local';

/** band = 복수예비가격(A값) 범위, floor = 낙찰하한율(%) */
export const RULES: Record<LawKey, Record<BidType, { band: number; floor: number }>> = {
  national: { '물품': { band: 0.02, floor: 87.745 }, '용역': { band: 0.02, floor: 87.745 }, '공사': { band: 0.02, floor: 86.745 } },
  local: { '물품': { band: 0.03, floor: 87.745 }, '용역': { band: 0.03, floor: 87.745 }, '공사': { band: 0.03, floor: 86.745 } },
};

/** 예정가격 범위: 추정가격 ±10% */
export const PLAN_BAND = 0.1;

export function calcPrice(price: number, type: BidType, law: LawKey) {
  const { band, floor } = RULES[law][type];
  return {
    band,
    floor,
    plan: [price * (1 - PLAN_BAND), price * (1 + PLAN_BAND)] as const,
    a: [price * (1 - band), price * (1 + band)] as const,
    bid: [(price * floor) / 100, price] as const,
  };
}

/** 낙찰기준점 (물품·용역 기준) */
export const PASS = 85;

export const SLIDERS = [
  { key: 'price', label: '가격점수', short: '가격점수', sub: '사정율 기반', max: 60, value: 55 },
  { key: 'mgmt', label: '경영상태 점수', short: '경영상태', sub: '신용평가등급 기반', max: 14, value: 10 },
  { key: 'record', label: '수행실적 점수', short: '수행실적', sub: '유사실적 기반', max: 20, value: 15 },
] as const;

export type SliderKey = (typeof SLIDERS)[number]['key'];

export const BONUS = [
  { key: 'local', label: '지역업체', pts: 2 },
  { key: 'sme', label: '중소기업', pts: 1 },
  { key: 'social', label: '사회적기업', pts: 0.5 },
] as const;

export type BonusKey = (typeof BONUS)[number]['key'];

export const BONUS_MAX = BONUS.reduce((a, b) => a + b.pts, 0);
