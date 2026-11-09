import { NOTICE_COLUMNS, toNotice, type Industry, type Notice, type NoticeRow, type Product } from './data';
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
  return latestOnly(rows.map((r) => toNotice(r, now)));
}

/**
 * 같은 공고번호는 마지막 차수만 남김 (변경공고가 나오면 이전 차수는 낡은 정보)
 * 마지막 차수가 취소공고면 그 공고는 통째로 뺌
 */
export function latestOnly(list: Notice[]): Notice[] {
  const last = new Map<string, Notice>();
  for (const n of list) {
    const cur = last.get(n.bidNo);
    if (!cur || n.bidOrd > cur.bidOrd) last.set(n.bidNo, n);
  }
  const keep = new Set([...last.values()].filter((n) => !/취소/.test(n.kind ?? '')).map((n) => n.id));
  return list.filter((n) => keep.has(n.id));
}

/** 같은 공고번호의 마지막 차수 — 상세 화면에서 취소·변경 여부 안내용 */
export async function fetchLatestOrder(bidNo: string): Promise<{ id: number; bidOrd: string; kind: string | null } | null> {
  const { data } = await getSupabase().from('notices').select('id,bid_ord,kind:raw->>ntceKindNm')
    .eq('bid_no', bidNo).order('bid_ord', { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, bidOrd: data.bid_ord, kind: data.kind ?? null } : null;
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

/** 품목 검색 — 수집된 공고의 품명(물품 세부품명·용역 공공조달분류)에서 찾음.
 *  물품목록정보서비스(공식 분류 목록) 연결 전까지 쓰는 방식 */
export async function searchProducts(q: string): Promise<Product[]> {
  const s = q.trim().replace(/[%_,()*"]/g, '');
  if (!s) return [];
  const { data, error } = await getSupabase()
    .from('notices')
    .select('product_name, p_code:raw->>dtilPrdctClsfcNo, p_list:raw->>purchsObjPrdctList, s_code:raw->>pubPrcrmntClsfcNo, s_name:raw->>pubPrcrmntClsfcNm')
    .or(`product_name.ilike.*${s}*,raw->>pubPrcrmntClsfcNm.ilike.*${s}*,raw->>purchsObjPrdctList.ilike.*${s}*`)
    .order('id', { ascending: false })
    .limit(300);
  if (error) throw error;
  const out = new Map<string, Product & { n: number }>();
  const add = (code: string | null | undefined, name: string | null | undefined) => {
    if (!code || !name || !/^\d{8,10}$/.test(code) || !name.includes(s)) return;
    const cur = out.get(code);
    out.set(code, { code, name: name.trim(), n: (cur?.n ?? 0) + 1 });
  };
  for (const r of data ?? []) {
    for (const m of (r.p_list ?? '').matchAll(/\^(\d{8,10})\^([^\],]+)/g)) add(m[1], m[2]);
    add(r.p_code, r.product_name);
    add(r.s_code, r.s_name);
  }
  // 공고에 자주 나온 품목부터
  return [...out.values()].sort((a, b) => b.n - a.n).slice(0, 30).map(({ code, name }) => ({ code, name }));
}

/** 기관·유형별 경쟁 강도 (013 org_competition) — 키: '기관|유형' */
export interface Competition { byOrg: Map<string, { median: number; n: number }>; byType: Map<string, number> }

export async function fetchCompetition(): Promise<Competition | null> {
  const sb = getSupabase();
  const rows: { org: string; bid_type: string; openings: number; median_participants: number }[] = [];
  for (let from = 0; from < 20 * PAGE; from += PAGE) {
    const { data, error } = await sb.from('org_competition').select('org,bid_type,openings,median_participants').range(from, from + PAGE - 1);
    if (error) return null; // 013 실행 전
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const byOrg = new Map(rows.map((r) => [`${r.org}|${r.bid_type}`, { median: r.median_participants, n: r.openings }]));
  const byType = new Map<string, number>();
  for (const t of ['물품', '용역', '공사']) {
    const v = rows.filter((r) => r.bid_type === t).map((r) => r.median_participants).sort((a, b) => a - b);
    if (v.length) byType.set(t, v[Math.floor(v.length / 2)]);
  }
  return { byOrg, byType };
}
