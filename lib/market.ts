/*
 * 공개 업종 시장 리포트 (052) — 서버에서 읽기만 (공개 키 · 1시간 캐시)
 */
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export interface MarketRange { n: number; p25: number | null; p50: number | null; p75: number | null }
export interface MarketData {
  notices: number; open_now: number; from: string | null; to: string | null;
  months: { ym: string; n: number }[];
  price: MarketRange | null; openings: number; participants: number | null; win_rate: MarketRange | null;
  orgs: { org: string; n: number }[];
}
export interface MarketPage { slug: string; type: string; name: string; rank: number; data: MarketData; at: string }

async function rest<T>(path: string): Promise<T | null> {
  if (!URL_ || !KEY) return null;
  try {
    const res = await fetch(`${URL_}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch { return null; }
}

export async function fetchMarketList(): Promise<MarketPage[]> {
  return (await rest<MarketPage[]>('market_pages?select=slug,type,name,rank,data,at&order=type.asc,rank.asc')) ?? [];
}
export async function fetchMarketPage(slug: string): Promise<MarketPage | null> {
  if (!/^[a-z][\w-]{1,40}$/.test(slug)) return null;
  const r = await rest<MarketPage[]>(`market_pages?select=slug,type,name,rank,data,at&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  return r?.[0] ?? null;
}

export const TYPE_ORDER = ['물품', '용역', '공사'] as const;
/** 1.2억 · 3,400만 */
export const mMoney = (v: number | null | undefined) => (!v ? '–' : v >= 1e8 ? `${(Math.round(v / 1e7) / 10).toLocaleString('ko-KR')}억` : `${Math.round(v / 1e4).toLocaleString('ko-KR')}만`);
