import type { Notice } from './data';
import { words } from './notices';
import { getSupabase } from './supabase';

/* =========================================================
 * 「이 공고 브리핑」 — 공고 원본 일정·조건 + 비슷한 과거 개찰 결과 요약
 * 개찰 결과는 참고 정보 (예측 아님). 비교 대상이 적으면 숫자를 보여주지 않는다.
 * ========================================================= */

export interface NoticeExtra {
  qualifyBy: string | null;   // 입찰참가자격 등록 마감
  bidBegin: string | null;    // 투찰 시작
  openAt: string | null;      // 개찰
  joint: string | null;       // 공동수급
  reNotice: boolean;          // 재공고
  reserveTotal: number | null;  // 복수예가 수
  reserveDraw: number | null;   // 추첨 수
  delivery: string | null;    // 납품조건
}

export interface PastStats {
  basis: 'org' | 'title';     // 같은 기관 / 비슷한 공고명
  count: number;              // 비교한 개찰 건수
  avgParticipants: number | null;
  rateLow: number | null;     // 낙찰률 중간 50% 범위
  rateHigh: number | null;
  rateCount: number;
}

const MIN_SAMPLE = 3;

export async function fetchNoticeExtra(id: number): Promise<NoticeExtra | null> {
  const { data, error } = await getSupabase()
    .from('notices')
    .select('q:raw->>bidQlfctRgstDt, b:raw->>bidBeginDt, o:raw->>opengDt, j:raw->>cmmnSpldmdMethdNm, r:raw->>reNtceYn, t:raw->>totPrdprcNum, d:raw->>drwtPrdprcNum, v:raw->>dlvryCndtnNm')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const x = data as Record<string, string | null>;
  const int = (s: string | null) => (s && /^\d+$/.test(s) ? Number(s) : null);
  return {
    qualifyBy: x.q || null, bidBegin: x.b || null, openAt: x.o || null,
    joint: x.j ? x.j.replace(/^\(없음\)/, '') : null,
    reNotice: x.r === 'Y',
    reserveTotal: int(x.t), reserveDraw: int(x.d),
    delivery: x.v || null,
  };
}

type Row = { participants: number | null; winner_rate: number | null };

function summarize(rows: Row[], basis: PastStats['basis']): PastStats {
  const parts = rows.map((r) => r.participants).filter((v): v is number => v !== null && v > 0);
  const rates = rows.map((r) => Number(r.winner_rate)).filter((v) => v > 0 && v < 100).sort((a, b) => a - b);
  const q = (p: number) => rates[Math.min(rates.length - 1, Math.floor(p * (rates.length - 1) + 0.5))];
  return {
    basis,
    count: rows.length,
    avgParticipants: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null,
    rateLow: rates.length >= MIN_SAMPLE ? q(0.25) : null,
    rateHigh: rates.length >= MIN_SAMPLE ? q(0.75) : null,
    rateCount: rates.length,
  };
}

const quote = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** 비슷한 과거 개찰 — 같은 기관·같은 유형 우선, 부족하면 같은 유형·공고명 핵심어 */
export async function fetchPastStats(n: Notice): Promise<PastStats | null> {
  const sb = getSupabase();
  const since = new Date(Date.now() - 3 * 365 * 86400e3).toISOString();
  // 조달청은 여러 기관 대신 공고하므로 기관 비교는 수요기관으로만
  const central = /조달청/.test(n.org);
  const orgs = [...(central ? [] : [`org.eq.${quote(n.org)}`]), ...(n.demandOrg ? [`demand_org.eq.${quote(n.demandOrg)}`] : [])].join(',');
  // 1개사만 들어온 개찰(수의 견적 등)은 경쟁·낙찰률 비교에서 제외
  const byOrg = orgs
    ? await sb.from('openings').select('participants, winner_rate')
      .eq('bid_type', n.type).gte('opened_at', since).gte('participants', 2).or(orgs).limit(200)
    : { data: [], error: null };
  if (byOrg.error) throw byOrg.error;
  if ((byOrg.data?.length ?? 0) >= MIN_SAMPLE) return summarize(byOrg.data as Row[], 'org');

  const kw = [...words(n.title)].sort((a, b) => b.length - a.length)[0];
  if (!kw) return null;
  const byTitle = await sb.from('openings').select('participants, winner_rate')
    .eq('bid_type', n.type).gte('opened_at', since).gte('participants', 2).ilike('title', `%${kw}%`).limit(200);
  if (byTitle.error) throw byTitle.error;
  return (byTitle.data?.length ?? 0) >= MIN_SAMPLE ? summarize(byTitle.data as Row[], 'title') : null;
}
