import type { MetadataRoute } from 'next';
import { fetchMarketList } from '@/lib/market';

/** 검색 등록용 주소 목록 — 공개 페이지만 (2026-11-24 업종별 시장 리포트 추가) */
export const revalidate = 86400;
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bid-compass-gamma.vercel.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const list = await fetchMarketList();
  return [
    { url: `${BASE}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE}/bids`, changeFrequency: 'hourly', priority: 0.8 },
    { url: `${BASE}/market`, changeFrequency: 'daily', priority: 0.8 },
    ...list.map((m) => ({ url: `${BASE}/market/${m.slug}`, lastModified: new Date(m.at), changeFrequency: 'daily' as const, priority: 0.7 })),
  ];
}
