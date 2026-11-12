import type { Notice } from './data';
import { words } from './notices';

/* =========================================================
 * 공고 말뭉치 통계 — '이 근거가 얼마나 드문가' (정보량, IDF)
 *
 * 같은 '일치'라도 흔한 품목·업종·단어의 일치는 정보가 적다.
 *   예) '정보시스템유지관리서비스'는 마감 전 공고 852건에 나옴 → 이것만 맞아도 맞춤이면 수백 건
 *       '정보검색소프트웨어'는 4건 → 맞으면 거의 확실히 우리 일
 * 특이도 s = ln((N+1)/(df+1)) / ln(N/5)   (0~1, df ≤ 약 5건이면 1)
 *   N = 마감 전 공고 수, df = 그 품목·업종·단어가 나오는 공고 수
 * ========================================================= */

export interface Stats {
  n: number;
  /** 품명번호 앞자리(4·6·8·10) → 공고 수 */
  prod: Map<string, number>;
  /** 업종(면허) 코드 → 그 업종을 요구·허용하는 공고 수 */
  lic: Map<string, number>;
  /** 공고명 낱말(정확히 일치) → 공고 수 — 이력 유사도용 */
  token: Map<string, number>;
  /** 공고명 목록 (부분 문자열 빈도 계산용) */
  titles: string[];
  /** 부분 문자열 빈도 캐시 */
  sub: Map<string, number>;
}

export const licCode = (allowed: string) => /\/(\w+)$/.exec(allowed)?.[1] ?? '';

export function buildStats(notices: Notice[]): Stats {
  const prod = new Map<string, number>(), lic = new Map<string, number>(), token = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const n of notices) {
    const pre = new Set<string>();
    for (const p of n.products) for (const len of [4, 6, 8, 10]) if (p.code.length >= len) pre.add(p.code.slice(0, len));
    pre.forEach((k) => inc(prod, k));
    const codes = new Set<string>();
    for (const l of n.licenseLimits ?? []) { if (l.code) codes.add(l.code); l.allowed.forEach((a) => { const c = licCode(a); if (c) codes.add(c); }); }
    codes.forEach((k) => inc(lic, k));
    words(n.title).forEach((w) => inc(token, w));
  }
  return { n: Math.max(1, notices.length), prod, lic, token, titles: notices.map((n) => n.title), sub: new Map() };
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));

/** 특이도 0~1 — 드물수록 1 */
export const specificity = (s: Stats, df: number) => clamp(Math.log((s.n + 1) / (df + 1)) / Math.log(Math.max(2, s.n / 5)));

/** 정보량(IDF) — 이력 유사도 가중치 */
export const idf = (s: Stats | null, w: string) => (s ? Math.log((s.n + 1) / ((s.token.get(w) ?? 0) + 1)) : 1);

/** 공고명에 이 글자가 들어간 공고 수 (회사 핵심어처럼 몇십 개만 계산하므로 캐시) */
export function titleDf(s: Stats, w: string) {
  let v = s.sub.get(w);
  if (v === undefined) { v = 0; for (const t of s.titles) if (t.includes(w)) v++; s.sub.set(w, v); }
  return v;
}
