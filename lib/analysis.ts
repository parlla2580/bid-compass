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
  /** 050: 개찰 60일 지났는데 낙찰자·우리 순위 정보 없음 (결과 없음) */
  unknown?: number;
  /** 038: 1곳 참가(수의·견적·단가계약) 투찰 건수와 그중 낙찰 — 위 값들에서는 빠져 있음 */
  single?: number;
  single_won?: number;
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
export interface MarketCompetitor { bizno: number; name: string; shared: number; their_total: number; sim: number; wins: number; win_amount: number; last_met?: string }
export interface MarketSeg { key: string; name: string; type: string; openings: number }

export interface MyMarket {
  verified: boolean;
  years?: number;
  /** 시장 나누기 (023) — 우리 투찰을 품목·분류·면허로 나눈 목록 */
  markets?: MarketSeg[];
  market_key?: string | null;
  my_openings?: number;
  competitors?: MarketCompetitor[];
  market?: { openings_with_winner: number; total_amount: number; mine: number; leaders: { name: string; amount: number; wins: number; me: boolean }[] };
  other_markets?: { org: string; type: string; firms: number; openings: number }[];
  newcomers?: { name: string; shared: number; first_seen: string }[];
}

export interface RivalWin { id: number; title: string; org: string | null; type: string; opened_at: string; amount: number | null }

/** 자주 만나는 회사가 이 시장(우리 투찰 개찰)에서 낙찰한 공고 (025). 실행 전이면 null */
export async function fetchRivalWins(bizno: number, years = 3, market: string | null = null): Promise<RivalWin[] | null> {
  const r = await getSupabase().rpc('rival_wins', { p_bizno: bizno, p_years: years, p_market: market });
  if (r.error || !r.data?.verified) return null;
  return (r.data.wins ?? []) as RivalWin[];
}

export async function fetchMyMarket(years = 3, market: string | null = null): Promise<MyMarket | null> {
  const sb = getSupabase();
  // 023: 시장 나누기 — 실행 전이면 예전 함수(전체 시장)로
  const r = await sb.rpc('my_market', { p_years: years, p_market: market });
  if (!r.error) return r.data as MyMarket;
  if (market) return null;
  const old = await sb.rpc('my_market', { p_years: years });
  if (old.error) return null; // 010 실행 전이면 숨김
  return old.data as MyMarket;
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
  const old = now - new Date(i.opened_at).getTime() > 60 * 86400e3;
  // 050: 개찰 60일 지났고 우리 순위가 2위 이하면 탈락이 확실 — 순위도 낙찰자도 없을 때만 '결과 없음'
  if (old && (i.rank ?? 0) >= 2) return 'lost';
  return old ? 'unknown' : 'pending';
}

export const outcomeLabel = (i: MyBidItem, o = bidOutcome(i)) =>
  o === 'won' ? '낙찰' : o === 'below' ? '하한 미달' : o === 'pending' ? (i.rank === 1 ? '1위 · 심사 중' : i.rank ? `${i.rank}위 · 결정 전` : '결정 전')
    : o === 'unknown' ? '결과 없음' : i.rank ? `${i.rank}위` : '탈락';

/** 같은 화면의 여러 카드가 동시에 부르면 한 번만 조회 (2026-11-22 전체 테스트: 입찰 분석 첫 화면에서 5번 호출) — 30초 · 로그인 사용자별 */
let listCache: { key: string; at: number; p: Promise<MyBidItem[] | null> } | null = null;
export async function fetchMyBidList(): Promise<MyBidItem[] | null> {
  const sb = getSupabase();
  const key = (await sb.auth.getSession()).data.session?.user.id ?? '';
  if (listCache && listCache.key === key && Date.now() - listCache.at < 30_000) return listCache.p;
  const p = (async () => {
    const { data, error } = await sb.rpc('my_bid_list', { p_years: 3, p_limit: 500 });
    if (error || !data?.verified) return null;
    return data.items as MyBidItem[];
  })();
  listCache = { key, at: Date.now(), p };
  p.then((r) => { if (r === null && listCache?.p === p) listCache = null; }, () => { if (listCache?.p === p) listCache = null; });
  return p;
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

/* ---------- 시장 분석 개편 (030) ---------- */
export interface H2H { bizno: number; name: string; met: number; i_ahead: number; they_ahead: number; their_wins: number; my_wins: number }

/** 맞대결 전적 — 자주 만나는 회사(my_market 순위)마다. 030 실행 전이면 null */
export async function fetchH2H(bizs: number[], market: string | null = null): Promise<H2H[] | null> {
  if (!bizs.length) return [];
  const r = await getSupabase().rpc('my_h2h', { p_bizs: bizs.slice(0, 10), p_years: 3, p_market: market });
  if (r.error || !r.data?.verified) return null;
  return (r.data.rivals ?? []) as H2H[];
}

export interface Missed {
  days: number; total: number; joined: number; missed: number;
  missed_avg_participants: number | null; joined_avg_participants: number | null;
  missed_orgs: { org: string; n: number; avg_participants: number | null }[];
  recent: { opening_id: number; title: string; org: string; opened_at: string; participants: number | null; winner: string | null }[];
  open_now: number;
  open_list: { id: number; title: string; org: string; closes_at: string }[];
}

/** 우리 시장인데 안 들어간 공고 + 지금 열린 우리 시장 공고 (030). 실행 전이면 null */
export async function fetchMissed(market: string | null = null, days = 90): Promise<Missed | null> {
  const r = await getSupabase().rpc('my_missed', { p_days: days, p_market: market });
  if (r.error || !r.data?.verified) return null;
  return { missed_orgs: [], recent: [], open_list: [], open_now: 0, joined: 0, missed: 0, total: 0, days, missed_avg_participants: null, joined_avg_participants: null, ...r.data } as Missed;
}

/* ---------- 익명 업계 비교 (033) ---------- */
export interface Peers {
  verified: boolean; months: number; n: number; enough: boolean;
  me: { bids: number; settled: number; won: number; rate: number | null } | null;
  rate: { p25: number; p50: number; p75: number } | null;
  bids: { p25: number; p50: number; p75: number } | null;
  /** 우리보다 낙찰률이 낮은 경쟁사 비율 (0~1) */
  below: number | null;
  bids_below: number | null;
}

/** 033 실행 전이거나 회사 확인 전이면 null */
export async function fetchPeers(months = 12): Promise<Peers | null> {
  const r = await getSupabase().rpc('my_peers', { p_months: months });
  if (r.error || !r.data?.verified) return null;
  return r.data as Peers;
}

/* ---------- 발주기관 카드 (034) ---------- */
export interface OrgProfile {
  org: string; notices: number; openings: number; decided: number;
  /** 035: 통계에서 뺀 참가 1곳 이하 개찰(단가계약 등). 034만 실행했으면 없음 */
  single?: number;
  d_from: string | null; d_to: string | null;
  months: { ym: string; n: number }[];
  by_type: Record<string, { n: number; participants: number | null }>;
  sajeong: { n: number; p25: number; p50: number; p75: number } | null;
  win_rate: { n: number; p25: number; p50: number; p75: number } | null;
  winners: { name: string; wins: number }[];
}

/** 034 실행 전이면 null · 같은 기관은 5분 동안 다시 부르지 않음 (공고 상세 요약 카드 → 발주기관 화면) */
const orgCache = new Map<string, { at: number; p: Promise<OrgProfile | null> }>();
export function fetchOrgProfile(org: string, months = 12): Promise<OrgProfile | null> {
  const key = `${org}|${months}`;
  const hit = orgCache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
  const p = (async () => {
    const r = await getSupabase().rpc('org_profile', { p_org: org, p_months: months });
    if (r.error || !r.data) return null;
    return r.data as OrgProfile;
  })();
  p.catch(() => orgCache.delete(key));
  orgCache.set(key, { at: Date.now(), p });
  return p;
}

/** 발주 많은 달 — 월 평균의 1.5배 이상 · 3건 이상 ('3월' 형태) */
export function orgPeaks(months: OrgProfile['months']): string[] {
  const avg = months.length ? months.reduce((s, m) => s + m.n, 0) / months.length : 0;
  return months.filter((m) => m.n >= avg * 1.5 && m.n >= 3).map((m) => `${Number(m.ym.slice(5))}월`);
}

/** 최근 본 기관 (이 기기에만 · 최대 8곳) */
const RECENT_ORGS = 'bc.recentOrgs';
export function recentOrgs(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_ORGS) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 8) : []; } catch { return []; }
}
export function rememberOrg(org: string) {
  try { localStorage.setItem(RECENT_ORGS, JSON.stringify([org, ...recentOrgs().filter((o) => o !== org)].slice(0, 8))); } catch { /* 저장 못 해도 무시 */ }
}

/** 개찰 결과 해설 (051) — 최근 개찰마다 1순위 투찰률 · 사정률 · 하한율. 051 실행 전이면 빈 목록 */
export interface ResultNote { id: number; rank: number | null; rate: number | null; note: number | null; first_rate: number | null; sajeong: number | null; floor_rate: number | null }
export async function fetchResultNotes(days = 14): Promise<Map<number, ResultNote>> {
  const r = await getSupabase().rpc('my_result_notes', { p_days: days });
  const m = new Map<number, ResultNote>();
  if (r.error || !r.data?.verified) return m;
  for (const x of (r.data.items ?? []) as ResultNote[]) m.set(x.id, x);
  return m;
}

/**
 * 개찰 결과 한 줄 해설 — 이름표 + 숫자 (2026-11-24 아하 포인트 ③)
 *  낙찰: 투찰률 · 사정률 / 탈락: 1순위와 N%p · 사정률 / 하한 미달: 하한선까지 부족 N%p · 사정률
 */
export function resultLine(o: BidOutcome, b: { rank: number | null; rate: number | null }, n?: ResultNote): string | null {
  const rate = n?.rate ?? b.rate;
  const sj = n?.sajeong != null ? `사정률 ${Number(n.sajeong).toFixed(2)}%` : null;
  const parts: (string | null)[] = [];
  if (o === 'won') parts.push(rate != null ? `투찰률 ${Number(rate).toFixed(3)}%` : null, sj);
  else if (o === 'below') {
    const gap = rate != null && n?.floor_rate != null ? Number(n.floor_rate) - Number(rate) : null;
    parts.push(gap != null && gap > 0 ? `하한선까지 부족 ${gap.toFixed(3)}%p` : null, sj);
  } else if (o === 'lost') {
    const gap = rate != null && n?.first_rate != null ? Math.abs(Number(rate) - Number(n.first_rate)) : null;
    parts.push(gap != null && (b.rank ?? 0) > 1 ? `1순위와 ${gap.toFixed(3)}%p` : null, sj);
  }
  const s = parts.filter(Boolean).join(' · ');
  return s || null;
}
