import type { Notice } from './data';
import { GENERIC, words } from './notices';
import { idf, type Stats } from './stats';
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
  /** 투찰 순위까지 받은 건수 (나머지는 낙찰 결과만) */
  detailed?: number;
  /** 투찰 순위를 받은 개찰 중 낙찰 수 (012) */
  won_detailed?: number;
  /** 낙찰자 결정 전 건수 (017) */
  pending?: number;
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

/* ---------- F7-4 이력 기반 유사도 (v2, 2026-11-12) ----------
 * 공고명 낱말의 TF-IDF 코사인 유사도 — 드문 낱말이 겹칠수록 높게 (입찰 일반어 제외, 정보량 낮은 낱말은 경사로 감쇠)
 *   + 같은 기관이면 남은 거리의 30%를 더 가깝게, 다른 사업유형이면 ×0.8, 비슷한 금액대(±2배)면 남은 거리의 10%
 *   + 낙찰 이력 ×1.3, 최근 1년 ×1.2 (상한 1)
 * H = 가장 비슷한 1건 + 둘째 건은 남은 거리의 25% (0~1). 같은 기관 가산은 내용 유사도 0.15 이상일 때만
 */
export interface Similarity {
  /** 0~1 */
  score: number;
  /** 가장 비슷한 과거 공고 */
  best: HistoryItem | null;
}

export function prepareHistory(items: HistoryItem[]) {
  const now = Date.now();
  return items.map((h) => ({
    h,
    w: words(h.title),
    weight: (h.won ? 1.3 : 1) * (now - new Date(h.opened_at).getTime() < 365 * 86400e3 ? 1.2 : 1),
  }));
}

export function similarity(n: Notice, hist: ReturnType<typeof prepareHistory>, stats: Stats | null = null): Similarity {
  if (!hist.length) return { score: 0, best: null };
  const target = words(`${n.title} ${n.productName ?? ''}`);
  // 낱말 가중치 = idf² × 정보량 경사(idf 3.5 이하 0 → 5.5 이상 1). 입찰 일반어는 0
  const weightOf = (w: string) => {
    if (GENERIC.test(w)) return 0;
    const v = idf(stats, w);
    return stats ? v * v * Math.max(0, Math.min(1, (v - 3.5) / 2)) : 1;
  };
  const norm = (ws: Set<string>) => Math.sqrt([...ws].reduce((x, w) => x + weightOf(w), 0));
  const tNorm = norm(target);
  if (!tNorm) return { score: 0, best: null };
  const top: { s: number; h: HistoryItem }[] = [];
  for (const { h, w, weight } of hist) {
    let dot = 0;
    for (const x of w) if (target.has(x)) dot += weightOf(x);
    if (!dot) continue;
    let s = dot / (tNorm * norm(w));
    // 같은 기관 가산은 내용도 어느 정도 겹칠 때만 (기관만 같고 내용이 다른 공고가 높게 나오던 문제)
    if (s >= 0.15 && h.org && (h.org === n.org || (!!n.demandOrg && h.demand_org === n.demandOrg))) s += 0.3 * (1 - s);
    if (h.bid_type !== n.type) s *= 0.8;
    if (h.amount && n.estPrice && Math.abs(Math.log10(h.amount / n.estPrice)) < 0.3) s += 0.1 * (1 - s);
    top.push({ s: Math.min(1, s * weight), h });
  }
  if (!top.length) return { score: 0, best: null };
  top.sort((a, b) => b.s - a.s);
  // 가장 비슷한 1건 + 둘째는 남은 거리의 25%만 (이력이 많은 회사에서 점수가 부풀던 문제)
  const score = top[0].s + (1 - top[0].s) * 0.25 * (top[1]?.s ?? 0);
  return { score, best: top[0].h };
}

/* ---------- 우리 시장 (010) ---------- */
export interface MarketCompetitor { bizno: number; name: string; shared: number; their_total: number; sim: number; wins: number; win_amount: number }
export interface MyMarket {
  verified: boolean;
  years?: number;
  my_openings?: number;
  competitors?: MarketCompetitor[];
  market?: { openings_with_winner: number; total_amount: number; mine: number; leaders: { name: string; amount: number; wins: number; me: boolean }[] };
  other_markets?: { org: string; type: string; firms: number; openings: number }[];
  newcomers?: { name: string; shared: number; first_seen: string }[];
}

export async function fetchMyMarket(years = 3): Promise<MyMarket | null> {
  const { data, error } = await getSupabase().rpc('my_market', { p_years: years });
  if (error) return null; // 010 실행 전이면 숨김
  return data as MyMarket;
}

/* ---------- 입찰 이력 목록과 개찰 1건 요약 (011) ---------- */
export interface MyBidItem {
  id: number; title: string; org: string | null; type: string; opened_at: string; participants: number | null;
  rank: number | null; rate: number | null; amount: number | null; note: number | null; won: boolean; winner: string | null;
  /** 최종낙찰자 결정 여부 (017). 없으면 화면에서 추정 */
  decided?: boolean;
}

export type BidOutcome = 'won' | 'below' | 'pending' | 'lost' | 'unknown';

/** 투찰 결과 분류 — 낙찰 / 하한 미달 / 결정 전(적격심사·PQ 중) / 탈락 / 결과 없음(오래도록 낙찰자 없음: 유찰 등) */
export function bidOutcome(i: MyBidItem, now = Date.now()): BidOutcome {
  if (i.won) return 'won';
  if (i.note === 1) return 'below';
  const decided = i.decided ?? !!i.winner; // 017 실행 전: 낙찰자 이름이 있으면 결정된 것으로
  if (decided) return 'lost';
  return now - new Date(i.opened_at).getTime() > 60 * 86400e3 ? 'unknown' : 'pending';
}

export const outcomeLabel = (i: MyBidItem, o = bidOutcome(i)) =>
  o === 'won' ? '낙찰' : o === 'below' ? '하한 미달' : o === 'pending' ? (i.rank === 1 ? '1위 · 심사 중' : i.rank ? `${i.rank}위 · 결정 전` : '결정 전')
    : o === 'unknown' ? '결과 없음' : i.rank ? `${i.rank}위` : '탈락';

export async function fetchMyBidList(): Promise<MyBidItem[] | null> {
  const { data, error } = await getSupabase().rpc('my_bid_list', { p_years: 3, p_limit: 500 });
  if (error || !data?.verified) return null;
  return data.items as MyBidItem[];
}

export interface OpeningBidder { rank: number | null; rate: number | null; amount: number | null; note: number | null; name: string; me: boolean; winner: boolean }
export interface OpeningDetail {
  verified: boolean;
  found?: boolean;
  opening?: {
    id: number; bid_no: string; bid_ord: string; title: string; org: string | null; demand_org: string | null; type: string;
    opened_at: string; participants: number | null; base_amount: number | null; planned_price: number | null;
    sajeong: number | null; floor_rate: number | null; winner: string | null; winner_is_me: boolean;
    winner_amount: number | null; winner_rate: number | null; details_fetched: boolean;
  };
  bidders?: OpeningBidder[];
}

export async function fetchOpeningDetail(id: number): Promise<OpeningDetail | null> {
  const { data, error } = await getSupabase().rpc('my_opening_detail', { p_id: id });
  if (error) return null;
  return data as OpeningDetail;
}
