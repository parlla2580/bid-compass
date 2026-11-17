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
  /** 참가업체 수 중앙값 — 평균은 소수의 대량 참여 공고에 끌려가서 쓰지 않음 */
  medianParticipants: number | null;
  minParticipants: number | null;
  maxParticipants: number | null;
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

/** 나라장터 일시 문자열('2026-11-23 18:00' 등, 한국시간) → Date */
export function kstDate(s: string | null | undefined): Date | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00+09:00`) : null;
}

/**
 * 여러 공고의 입찰참가자격 등록 마감 — 알림함용 (저장 공고만, 많지 않음)
 * 실측(2026-11-17, 마감 전 1,000건): 84%가 입찰 마감 전날 18:00로 입찰 마감보다 먼저 끝남
 */
export async function fetchQualifyBy(ids: number[]): Promise<Map<number, Date>> {
  const out = new Map<number, Date>();
  if (!ids.length) return out;
  const { data, error } = await getSupabase().from('notices').select('id, q:raw->>bidQlfctRgstDt').in('id', ids.slice(0, 200));
  if (error) throw error;
  for (const r of (data ?? []) as { id: number; q: string | null }[]) { const d = kstDate(r.q); if (d) out.set(r.id, d); }
  return out;
}

type Row = { participants: number | null; winner_rate: number | null };

function summarize(rows: Row[], basis: PastStats['basis']): PastStats {
  const parts = rows.map((r) => r.participants).filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b);
  const rates = rows.map((r) => Number(r.winner_rate)).filter((v) => v > 0 && v < 100).sort((a, b) => a - b);
  const q = (p: number) => rates[Math.min(rates.length - 1, Math.floor(p * (rates.length - 1) + 0.5))];
  return {
    basis,
    count: rows.length,
    medianParticipants: parts.length ? (parts.length % 2 ? parts[(parts.length - 1) / 2] : Math.round((parts[parts.length / 2 - 1] + parts[parts.length / 2]) / 2)) : null,
    minParticipants: parts[0] ?? null,
    maxParticipants: parts[parts.length - 1] ?? null,
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
