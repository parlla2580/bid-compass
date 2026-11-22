import { bidOutcome, type MyBidItem } from './analysis';

/*
 * 강점 구간(구 우리가 이기는 판) — 내 투찰 기록을 조건별로 나눠 낙찰률 비교 (2026-11-18 시장 분석 개편 Q1)
 *  · 결과가 난 투찰만 (낙찰·탈락·하한 미달). 결정 전·결과 없음 제외
 *  · 구간마다 5건 미만은 숨김 — 우연을 인사이트로 보이지 않게
 *  · 한 줄 요약은 같은 조건 안 두 구간의 차이가 통계적으로 뚜렷할 때만(두 비율 차이 z ≥ 2, 각 8건 이상)
 *  · 금액대·기관·유형은 공고 목록 필터로 바로 이어짐. 참가 업체 수는 마감 전엔 몰라 링크 없음
 */

export interface Bucket { label: string; n: number; won: number; rate: number; href?: string }
export interface Dim { key: string; title: string; buckets: Bucket[] }
export interface Headline { key: string; dim: string; hi: Bucket; lo: Bucket }
export interface WinPattern { n: number; won: number; rate: number; dims: Dim[]; headline: Headline | null }

const MIN = 5;

function bucketize(items: MyBidItem[], keyOf: (i: MyBidItem) => string | null, order?: string[], href?: (k: string) => string | undefined): Bucket[] {
  const m = new Map<string, { n: number; won: number }>();
  for (const i of items) {
    const k = keyOf(i);
    if (!k) continue;
    const v = m.get(k) ?? { n: 0, won: 0 };
    v.n++; if (i.won) v.won++;
    m.set(k, v);
  }
  const list = [...m.entries()].filter(([, v]) => v.n >= MIN).map(([label, v]) => ({ label, n: v.n, won: v.won, rate: v.won / v.n, href: href?.(label) }));
  return order ? list.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : list.sort((a, b) => b.n - a.n);
}

const PART = ['10곳 미만', '10~29곳', '30~99곳', '100곳 이상'];
const partOf = (p: number | null) => (p == null || p <= 0 ? null : p < 10 ? PART[0] : p < 30 ? PART[1] : p < 100 ? PART[2] : PART[3]);
const PRICE = ['1억 미만', '1억~5억', '5억 이상'];
const priceOf = (a: number | null) => (a == null || a <= 0 ? null : a < 1e8 ? PRICE[0] : a < 5e8 ? PRICE[1] : PRICE[2]);

function z(a: Bucket, b: Bucket) {
  const p = (a.won + b.won) / (a.n + b.n);
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
  return se > 0 ? Math.abs(a.rate - b.rate) / se : 0;
}

export function winPattern(all: MyBidItem[]): WinPattern | null {
  const items = all.filter((i) => { const o = bidOutcome(i); return o === 'won' || o === 'lost' || o === 'below'; });
  if (items.length < 10) return null;
  const won = items.filter((i) => i.won).length;
  const dims: Dim[] = [
    { key: 'part', title: '참가 업체 수', buckets: bucketize(items, (i) => partOf(i.participants), PART) },
    { key: 'price', title: '금액대', buckets: bucketize(items, (i) => priceOf(i.amount), PRICE, (k) => `/bids?tab=all&price=${encodeURIComponent(k)}`) },
    { key: 'org', title: '기관', buckets: bucketize(items, (i) => i.org, undefined, (k) => `/bids?tab=all&org=${encodeURIComponent(k)}`).slice(0, 4) },
    { key: 'type', title: '유형', buckets: bucketize(items, (i) => i.type, ['물품', '용역', '공사'], (k) => `/bids?tab=all&type=${encodeURIComponent(k)}`) },
  ].filter((d) => d.buckets.length >= 2);

  let headline: Headline | null = null;
  let best = 0;
  for (const d of dims) {
    const ok = d.buckets.filter((b) => b.n >= 8);
    for (const a of ok) for (const b of ok) {
      if (a.rate <= b.rate || z(a, b) < 2) continue;
      const gap = a.rate - b.rate;
      if (gap > best) { best = gap; headline = { key: d.key, dim: d.title, hi: a, lo: b }; }
    }
  }
  return { n: items.length, won, rate: won / items.length, dims, headline };
}

/** 한 줄 요약에 쓰는 구간 이름 — '참가 10곳 미만', '1억 미만', '서울대학교' */
export const bucketPhrase = (key: string, label: string) => (key === 'part' ? `참가 ${label}` : label);
