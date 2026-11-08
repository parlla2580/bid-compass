import type { Notice } from './data';
import { words } from './notices';
import { getSupabase } from './supabase';

/* =========================================================
 * F7 입찰 분석 — 회사 확인을 마친 회원 본인의 개찰 이력 (Supabase 함수)
 * ========================================================= */

export interface NearMiss {
  id: number;
  title: string;
  org: string | null;
  opened_at: string;
  rank: number;
  rate: number;
  first_rate: number;
  gap: number;
  participants: number | null;
}

export interface BidReport {
  verified: boolean;
  years?: number;
  total?: number;
  won?: number;
  below_floor?: number;
  avg_rate?: number | null;
  avg_participants?: number | null;
  near_misses?: NearMiss[];
  below_floor_list?: { id: number; title: string; org: string | null; opened_at: string; rate: number }[];
  by_type?: Record<string, { total: number; won: number }>;
  top_orgs?: { org: string; total: number; won: number }[];
}

export async function fetchMyReport(years = 3): Promise<BidReport> {
  const { data, error } = await getSupabase().rpc('my_bid_report', { p_years: years });
  if (error) throw error;
  return (data ?? { verified: false }) as BidReport;
}

export interface HistoryItem {
  title: string;
  org: string | null;
  demand_org: string | null;
  bid_type: string;
  opened_at: string;
  amount: number | null;
  won: boolean;
  rank: number | null;
}

export async function fetchMyHistory(): Promise<HistoryItem[]> {
  const { data, error } = await getSupabase().rpc('my_bid_history', { p_years: 3, p_limit: 300 });
  if (error) throw error;
  return (data ?? []) as HistoryItem[];
}

/* ---------- F7-4 이력 기반 유사도 ----------
 * 공고명 핵심어 겹침 + 같은 기관 + 같은 사업유형 + 비슷한 금액대.
 * 낙찰한 이력은 1.5배, 최근 1년은 1.5배 가중 (최근일수록 정확하다는 기획 원칙)
 */
export interface Similarity {
  score: number;
  /** 가장 비슷한 과거 공고 */
  best: HistoryItem | null;
}

export function prepareHistory(items: HistoryItem[]) {
  const now = Date.now();
  return items.map((h) => ({
    h,
    w: words(h.title),
    weight: (h.won ? 1.5 : 1) * (now - new Date(h.opened_at).getTime() < 365 * 86400e3 ? 1.5 : 1),
  }));
}

export function similarity(n: Notice, hist: ReturnType<typeof prepareHistory>): Similarity {
  if (!hist.length) return { score: 0, best: null };
  const target = words(`${n.title} ${n.productName ?? ''}`);
  let best: HistoryItem | null = null, bestScore = 0;
  for (const { h, w, weight } of hist) {
    let s = 0;
    for (const x of w) if (target.has(x)) s += 1;
    if (s === 0) continue;
    if (h.org && (h.org === n.org || h.demand_org === n.demandOrg)) s += 1;
    if (h.bid_type === n.type) s += 0.5;
    if (h.amount && n.estPrice && Math.abs(Math.log10(h.amount / n.estPrice)) < 0.3) s += 0.5;
    s *= weight;
    if (s > bestScore) { bestScore = s; best = h; }
  }
  return { score: bestScore, best };
}
