/*
 * 공유 미리보기(카톡·문자 링크 카드)용 공고 요약 — 서버에서 공개 정보만 (2026-11-23 오픈 전 아하 포인트 ②)
 *  · 회원별 정보(적합도·참여 판정)는 넣지 않음 — 링크를 받은 사람마다 다르고, 공유하면 남에게 보이기 때문
 *  · Supabase 공개 키로 읽기 (회원 세션 없음) · 1시간 캐시
 */
import { noticeAward } from './award';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export interface OgNotice {
  id: number; title: string; type: string; org: string; estPrice: number | null; closesAt: string | null;
  award: string | null; participants: number | null;
}

async function rest<T>(path: string): Promise<T | null> {
  if (!URL_ || !KEY) return null;
  try {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export async function fetchOgNotice(id: number): Promise<OgNotice | null> {
  if (!Number.isFinite(id)) return null;
  const rows = await rest<{ id: number; title: string; bid_type: string; org: string; demand_org: string | null; est_price: number | null; closes_at: string | null; award: string | null }[]>(
    `notices?select=id,title,bid_type,org,demand_org,est_price,closes_at,award&id=eq.${id}&limit=1`);
  const n = rows?.[0];
  if (!n) return null;
  const org = n.demand_org && !/^각\s*수요기관/.test(n.demand_org) ? n.demand_org : n.org;
  // 보통 경쟁 — 이 기관의 같은 유형 지난 개찰 참가 업체 수 가운데 값 (5건 이상일 때만)
  const comp = await rest<{ openings: number; median_participants: number | null }[]>(
    `org_competition?select=openings,median_participants&org=eq.${encodeURIComponent(org)}&bid_type=eq.${encodeURIComponent(n.bid_type)}&limit=1`);
  const c = comp?.[0];
  const label = noticeAward({ award: n.award, demandOrg: n.demand_org })?.label ?? null;
  return {
    id: n.id, title: n.title, type: n.bid_type, org, estPrice: n.est_price, closesAt: n.closes_at, award: label,
    participants: c && c.openings >= 5 && c.median_participants ? Math.round(c.median_participants) : null,
  };
}

/** 6,080만 · 1.2억 */
export const ogMoney = (v: number | null) => (!v ? '미공개' : v >= 1e8 ? `${(Math.round(v / 1e7) / 10).toLocaleString('ko-KR')}억` : `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`);
/** 한국시간 마감 'MM.DD HH:mm' + D-day */
export function ogDeadline(closesAt: string | null): { text: string; d: number | null } {
  if (!closesAt) return { text: '–', d: null };
  const t = new Date(closesAt);
  const k = new Date(t.getTime() + 9 * 3600e3);
  const pad = (x: number) => String(x).padStart(2, '0');
  const today = new Date(Date.now() + 9 * 3600e3); today.setUTCHours(0, 0, 0, 0);
  const day = new Date(k); day.setUTCHours(0, 0, 0, 0);
  return { text: `${pad(k.getUTCMonth() + 1)}.${pad(k.getUTCDate())} ${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`, d: Math.round((day.getTime() - today.getTime()) / 86400e3) };
}
