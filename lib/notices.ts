import { NOTICE_COLUMNS, toNotice, type Industry, type Notice, type NoticeRow } from './data';
import { getSupabase } from './supabase';

/* =========================================================
 * Supabase 읽기 — 공고·계약·업종 (공개 데이터, publishable 키로 읽기)
 * ========================================================= */

const PAGE = 1000; // Supabase 기본 최대 행 수

/** 마감 전 공고 전체 — 판정·추천은 화면에서 계산 (판정 엔진 서버 이전 전까지) */
export async function fetchOpenNotices(): Promise<Notice[]> {
  const sb = getSupabase();
  const now = new Date();
  const rows: NoticeRow[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await sb
      .from('notices')
      .select(NOTICE_COLUMNS)
      .eq('source', 'api')
      .gte('closes_at', now.toISOString())
      .order('closes_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as NoticeRow[]));
    if (!data || data.length < PAGE) break;
  }
  return rows.map((r) => toNotice(r, now));
}

export async function fetchNotice(id: number): Promise<Notice | null> {
  const { data, error } = await getSupabase().from('notices').select(NOTICE_COLUMNS).eq('id', id).maybeSingle<NoticeRow>();
  if (error) throw error;
  return data ? toNotice(data) : null;
}

export async function fetchNoticesByIds(ids: number[]): Promise<Notice[]> {
  if (!ids.length) return [];
  const { data, error } = await getSupabase().from('notices').select(NOTICE_COLUMNS).in('id', ids);
  if (error) throw error;
  return ((data ?? []) as NoticeRow[]).map((r) => toNotice(r));
}

/* ---------- 유사 계약 이력 (같은 기관 · 비슷한 계약명) ---------- */
export interface SimilarContract {
  id: string;
  title: string;
  org: string | null;
  method: string | null;
  amount: number | null;
  contractDate: string | null;
  corps: { name: string | null; share: number | null }[];
  detailUrl: string | null;
}

/** 공고명 핵심어 (유사도 비교용) */
export const words = (s: string) =>
  new Set(
    s.replace(/[()[\]{}·,.\-_/]/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !/^(구매|구입|납품|용역|공사|사업|입찰|공고|계약|정정|긴급|20\d\d년?)$/.test(w)),
  );

export async function fetchSimilarContracts(n: Notice): Promise<SimilarContract[]> {
  const orgs = [...new Set([n.org, n.demandOrg].filter(Boolean))] as string[];
  const { data, error } = await getSupabase()
    .from('contracts')
    .select('id,title,org,method,amount,contract_date,corps,detail_url')
    .in('org', orgs)
    .order('contract_date', { ascending: false })
    .limit(50);
  if (error) throw error;
  const target = words(`${n.title} ${n.productName ?? ''}`);
  // 같은 계약이 통합계약번호만 다르게 두 번 등록되는 경우가 있어(계약번호 동일) 계약번호로 한 건만 남김
  const seen = new Set<string>();
  const unique = (data ?? []).filter((c) => {
    const no = /ctrtNo=([^&]+)/.exec(c.detail_url ?? '')?.[1];
    const k = no ?? `${c.title}|${c.amount}|${c.contract_date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return unique
    .map((c) => ({ c, score: [...words(c.title)].filter((w) => target.has(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ c }) => ({
      id: c.id,
      title: c.title,
      org: c.org,
      method: c.method,
      amount: c.amount === null ? null : Number(c.amount),
      contractDate: c.contract_date,
      corps: (c.corps ?? []).map((x: { name: string | null; share: number | null }) => ({ name: x.name, share: x.share })),
      detailUrl: c.detail_url,
    }));
}

/* ---------- 나라장터 업종 검색 ---------- */
export async function searchIndustries(q: string): Promise<Industry[]> {
  const s = q.trim();
  if (!s) return [];
  const { data, error } = await getSupabase()
    .from('industries')
    .select('code,name')
    .ilike('name', `%${s.replace(/[%_]/g, '')}%`)
    .order('name')
    .limit(30);
  if (error) throw error;
  return (data ?? []) as Industry[];
}
