import type { BidType } from './data';
import { getSupabase } from './supabase';

/* =========================================================
 * 사정률 분포 (F4-1 확장 · F7-6/F7-10)
 * 사정률 = 예정가격 ÷ 기초금액 × 100
 * 예정가격은 복수예비가격(보통 15개) 중 많이 추첨된 4개의 평균이라 100% 근처에 몰린다.
 * 이번 공고의 사정률은 추첨으로 정해지므로 '예측'이 아니라 '과거 분포' 참고 정보로만 쓴다.
 * ========================================================= */

export interface SajeongPoint { rate: number; sameOrg: boolean }
export interface SajeongDist {
  points: SajeongPoint[];
  sorted: number[];   // 전체 사정률 오름차순
}

const PAGE = 1000;
const PAGES = 5;

export async function fetchSajeongDist(type: BidType, org?: string | null, demandOrg?: string | null): Promise<SajeongDist> {
  const sb = getSupabase();
  const since = new Date(Date.now() - 3 * 365 * 86400e3).toISOString();
  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      sb.from('openings').select('planned_price, base_amount, org, demand_org')
        .eq('bid_type', type).not('planned_price', 'is', null).gt('base_amount', 0).gte('opened_at', since)
        .order('opened_at', { ascending: false }).range(i * PAGE, i * PAGE + PAGE - 1)),
  );
  const err = pages.find((p) => p.error)?.error;
  if (err) throw err;
  const central = !!org && /조달청/.test(org);
  const points: SajeongPoint[] = [];
  for (const p of pages) {
    for (const r of p.data ?? []) {
      const rate = (Number(r.planned_price) / Number(r.base_amount)) * 100;
      if (!(rate > 90 && rate < 110)) continue; // 단가·분할 등 비교가 안 되는 값 제외
      const sameOrg = (!!org && !central && r.org === org) || (!!demandOrg && r.demand_org === demandOrg);
      points.push({ rate, sameOrg });
    }
  }
  return { points, sorted: points.map((p) => p.rate).sort((a, b) => a - b) };
}

/** 사정률 s 이하로 정해진 비율 (= 이 사정률로 썼을 때 하한 이상이었을 비율) */
export function cdf(sorted: number[], s: number): number {
  if (!sorted.length) return 0;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= s) lo = m + 1; else hi = m; }
  return lo / sorted.length;
}

export const quantile = (sorted: number[], q: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : 100;

/* ---------- 되돌려보기: 과거 개찰에 이 사정률로 썼다면 (Supabase 함수, 006) ---------- */
export interface Backtest { n: number; below: number; first: number; top3: number }

export async function fetchBacktest(type: BidType, sajeong: number, floor: number): Promise<Backtest | null> {
  const { data, error } = await getSupabase().rpc('bid_backtest', { p_type: type, p_sajeong: sajeong, p_floor: floor });
  if (error) return null; // 006 실행 전이거나 오류 — 화면에서 숨김
  return data as Backtest;
}
