import { NOTICE_COLUMNS, NOTICE_COLUMNS_FAST, toNotice, type Industry, type Notice, type NoticeRow, type Product } from './data';
import { getSupabase } from './supabase';
import { cacheGet, cacheSet } from './cache';
import { fmtKorean } from './format';

/* =========================================================
 * Supabase 읽기 — 공고·계약·업종 (공개 데이터, publishable 키로 읽기)
 * ========================================================= */

const PAGE = 1000; // Supabase 기본 최대 행 수

/* ---------- 공고 읽기 열 — 014(미리 꺼낸 열) 실행 전이면 원본에서 꺼내는 방식으로 자동 전환 ---------- */
let fastCols: boolean | null = null;
type Res<T> = { data: T | null; error: { code?: string; message: string } | null; count?: number | null };
async function withCols<T>(run: (cols: string) => PromiseLike<Res<T>>): Promise<Res<T>> {
  if (fastCols !== false) {
    const r = await run(NOTICE_COLUMNS_FAST);
    if (!r.error) { fastCols = true; return r; }
    if (r.error.code !== '42703' && !/does not exist/.test(r.error.message)) return r;
    fastCols = false; // 014 실행 전
  }
  return run(NOTICE_COLUMNS);
}

const OPEN_KEY = 'open-notices-v1';
const CACHE_MAX_AGE = 12 * 3600e3;

/** 브라우저에 보관해 둔 마감 전 공고 — 화면을 바로 띄우는 데 씀 (그 사이 마감된 공고는 뺌) */
export async function cachedOpenNotices(): Promise<Notice[] | null> {
  const c = await cacheGet<NoticeRow[]>(OPEN_KEY);
  if (!c || Date.now() - c.at > CACHE_MAX_AGE || !Array.isArray(c.value)) return null;
  const now = new Date();
  return latestOnly(c.value.filter((r) => new Date(r.closes_at) >= now).map((r) => toNotice(r, now)));
}

/* ---------- 공고 목록 스냅샷 (018) — 수집기가 3시간마다 올리는 압축 파일을 CDN에서 받음 ---------- */
const SNAPSHOT_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-data/open-notices.json.gz`;
const SNAPSHOT_MAX_AGE = 6 * 3600e3; // 수집이 두 번 이상 밀리면 DB에서 직접

async function fetchSnapshot(): Promise<NoticeRow[] | null> {
  if (typeof DecompressionStream === 'undefined' || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-cache', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    // 저장소가 압축을 이미 풀어 보냈을 수도 있어 앞 2바이트(gzip 표시)로 판단
    const text = buf[0] === 0x1f && buf[1] === 0x8b
      ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(buf);
    const snap = JSON.parse(text) as { at?: string; rows?: NoticeRow[] };
    if (!snap.at || !Array.isArray(snap.rows) || Date.now() - new Date(snap.at).getTime() > SNAPSHOT_MAX_AGE) return null;
    return snap.rows;
  } catch {
    return null;
  }
}

/** 마감 전 공고 전체 — ① CDN 스냅샷 ② 014의 open_notices() ③ 예전처럼 1천 건씩 차례로 */
export async function fetchOpenNotices(): Promise<Notice[]> {
  const sb = getSupabase();
  const now = new Date();
  let rows: NoticeRow[];
  const snap = await fetchSnapshot();
  const rpc = snap ? null : await sb.rpc('open_notices');
  if (snap) rows = snap.filter((r) => new Date(r.closes_at) >= now); // 스냅샷 이후 마감된 공고는 뺌
  else if (rpc && !rpc.error && Array.isArray(rpc.data)) rows = rpc.data as NoticeRow[];
  else {
    rows = [];
    for (let from = 0; from < 20 * PAGE; from += PAGE) {
      const { data, error } = await withCols<NoticeRow[]>((cols) => sb
        .from('notices')
        .select(cols)
        .eq('source', 'api')
        .gte('closes_at', now.toISOString())
        .order('closes_at', { ascending: true })
        .range(from, from + PAGE - 1) as unknown as PromiseLike<Res<NoticeRow[]>>);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) break;
    }
  }
  void cacheSet(OPEN_KEY, rows);
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
  const { data } = await withCols<{ id: number; bid_ord: string; kind: string | null }>((cols) => getSupabase().from('notices')
    .select(cols.includes('kind:raw') ? 'id,bid_ord,kind:raw->>ntceKindNm' : 'id,bid_ord,kind')
    .eq('bid_no', bidNo).order('bid_ord', { ascending: false }).limit(1).maybeSingle() as unknown as PromiseLike<Res<{ id: number; bid_ord: string; kind: string | null }>>);
  return data ? { id: data.id, bidOrd: data.bid_ord, kind: data.kind ?? null } : null;
}

/** 공사 A값·순공사비 (026) — 계산기용. 026 실행 전이거나 값이 없으면 null */
/** budget: 배정예산(부가세 포함, 공고 원본 asignBdgtAmt) — 단일예가·비예가 공고의 참고 금액 */
export interface NoticeCost { aValue: number | null; aApply: boolean | null; aParts: Record<string, number> | null; netCost: number | null; budget: number | null }
export async function fetchNoticeCost(id: number): Promise<NoticeCost | null> {
  const { data, error } = await getSupabase().from('notices').select('a_value,a_apply,a_parts,net_cost,budget:raw->>asignBdgtAmt').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const budget = Number(data.budget);
  return { aValue: data.a_value ? Number(data.a_value) : null, aApply: data.a_apply ?? null, aParts: data.a_parts ?? null,
    netCost: data.net_cost ? Number(data.net_cost) : null, budget: budget > 0 ? budget : null };
}

export async function fetchNotice(id: number): Promise<Notice | null> {
  const { data, error } = await withCols<NoticeRow>((cols) => getSupabase().from('notices').select(cols).eq('id', id).maybeSingle() as unknown as PromiseLike<Res<NoticeRow>>);
  if (error) throw error;
  return data ? toNotice(data) : null;
}

export async function fetchNoticesByIds(ids: number[]): Promise<Notice[]> {
  if (!ids.length) return [];
  const { data, error } = await withCols<NoticeRow[]>((cols) => getSupabase().from('notices').select(cols).in('id', ids) as unknown as PromiseLike<Res<NoticeRow[]>>);
  if (error) throw error;
  return ((data ?? []) as NoticeRow[]).map((r) => toNotice(r));
}

/* ---------- 저장 공고 정정·취소 따라가기 ---------- */

/** 저장한 공고(from)가 정정되어 새 차수(to)가 나왔거나 취소됨 */
export interface SavedChange { from: number; to: number | null; bidNo: string; title: string; diff: string[]; cancelled: boolean; at: string }

const md = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3600e3);
  const p = (v: number) => String(v).padStart(2, '0');
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
};
const won = fmtKorean;

/** 바뀐 점 — 마감·금액·공고명. 그 밖(첨부·조건)은 공고문에서 확인 */
export function noticeDiff(a: Notice, b: Notice): string[] {
  const out: string[] = [];
  if (a.closesAt.getTime() !== b.closesAt.getTime()) out.push(`마감 ${md(a.closesAt)} → ${md(b.closesAt)}`);
  if (a.basePrice && b.basePrice && a.basePrice !== b.basePrice) out.push(`기초금액 ${won(a.basePrice)} → ${won(b.basePrice)}`);
  else if (a.estPrice && b.estPrice && a.estPrice !== b.estPrice) out.push(`추정가격 ${won(a.estPrice)} → ${won(b.estPrice)}`);
  if (a.title.trim() !== b.title.trim()) out.push('공고명이 바뀌었어요');
  return out;
}

/**
 * 저장한 공고 중 새 차수(정정공고)가 나왔거나 취소된 것 — 마감 7일 지난 공고는 보지 않음
 * 공고 목록은 마지막 차수만 보여 주므로, 이전 차수를 저장해 두면 목록·마감 알림에서 빠지고 낡은 정보가 보임
 */
export async function findSavedChanges(ids: number[]): Promise<SavedChange[]> {
  if (!ids.length) return [];
  const sb = getSupabase();
  const since = new Date(Date.now() - 7 * 86400e3).toISOString();
  const { data: mine, error } = await withCols<NoticeRow[]>((cols) => sb.from('notices').select(cols).in('id', ids.slice(-300)).gte('closes_at', since) as unknown as PromiseLike<Res<NoticeRow[]>>);
  if (error) throw error;
  if (!mine?.length) return [];
  const { data: all, error: e2 } = await withCols<NoticeRow[]>((cols) => sb.from('notices').select(cols).in('bid_no', [...new Set(mine.map((r) => r.bid_no))]) as unknown as PromiseLike<Res<NoticeRow[]>>);
  if (e2) throw e2;
  const last = new Map<string, Notice>();
  for (const n of (all ?? []).map((r) => toNotice(r))) {
    const cur = last.get(n.bidNo);
    if (!cur || n.bidOrd > cur.bidOrd) last.set(n.bidNo, n);
  }
  const out: SavedChange[] = [];
  const at = new Date().toISOString();
  for (const old of mine.map((r) => toNotice(r))) {
    const now = last.get(old.bidNo);
    if (!now || now.bidOrd <= old.bidOrd) continue;
    // 저장 목록에 이미 새 차수가 있으면 옛 차수만 정리
    const cancelled = /취소/.test(now.kind ?? '');
    out.push({ from: old.id, to: cancelled ? null : now.id, bidNo: old.bidNo, title: now.title || old.title, diff: cancelled ? [] : noticeDiff(old, now), cancelled, at });
  }
  return out;
}

/** 어느 분야 공고에나 나오는 입찰 일반어 — 유사도 비교에서 제외 */
export const GENERIC = /^(\d{4}(학년도|년도|년)?|\d+차|\d+단계|\d+구역|구축|시스템|고도화|플랫폼|통합|운영|유지관리|유지보수|개발|설치|선정|재공고|업체|기반|관련|위한|및|등|용|제작|개선|지원|관리|서비스|구매|입찰공고|안내|수의계약|단가계약|연간단가|연간|단가|협상에의한계약|신규|추가|공사|용역|물품|사업|계약|위탁|대행|임차|교체|보수|정비|점검)$/;

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
    .lte('contract_date', new Date(Date.now() + 33 * 3600e3).toISOString().slice(0, 10)) // 미래 날짜로 잘못 입력된 계약 제외
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
    // 일반어('연간단가'·'유지보수' 등)만 겹치면 관련 없는 계약 — 핵심 낱말이 하나 이상 겹쳐야 보여줌
    .map((c) => ({ c, score: [...words(c.title)].filter((w) => target.has(w) && !GENERIC.test(w)).length }))
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
    // 014 자동 계산 열로 검색 — 원본(raw) JSON을 훑으면 공고가 쌓인 뒤 시간 초과(57014)
    .select('product_name, p_code, p_list, s_code, s_name')
    .or(`product_name.ilike.*${s}*,s_name.ilike.*${s}*,p_list.ilike.*${s}*`)
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

/* ---------- 공공 계약 단가 (031) ---------- */
export interface ItemPrice {
  code: string; name: string | null; n: number;
  p25: number; p50: number; p75: number; from: string | null; to: string | null;
  /** 흩어짐 3배 이내 — 아니면 화면은 숫자 대신 최근 계약 실례만 */
  spread_ok: boolean;
  recent: { date: string | null; org: string | null; spec: string | null; qty: number; unit_price: number; corp: string | null }[];
}

/** 공고 품목번호(앞 8자리로 연결)별 최근 12개월 공공 계약 단가. 031 실행 전이면 null */
export async function fetchItemPrices(codes: string[]): Promise<ItemPrice[] | null> {
  if (!codes.length) return [];
  const { data, error } = await getSupabase().rpc('item_prices', { p_codes: codes.slice(0, 5) });
  if (error) return null;
  return (data ?? []) as ItemPrice[];
}

/** 공고 수량·단위 (원본) — 이 공고 개당 금액 추정용 */
export async function fetchNoticeQty(id: number): Promise<{ qty: number | null; unit: string | null } | null> {
  const { data, error } = await getSupabase().from('notices').select('qty:raw->>prdctQty,unit:raw->>prdctUnit').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const q = Number(data.qty);
  return { qty: q > 0 ? q : null, unit: data.unit || null };
}
