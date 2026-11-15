import type { MuteItem, Product } from './data';
import { getSupabase } from './supabase';

/*
 * 영업 기회 A — 공고 없이 우리 품목을 산 기관 (기획 17.1)
 *  물품: contract_lines.code(물품분류번호 8자리) = 회원 주요 품목 코드 앞 8자리
 *  공사·용역: contracts.class_code(공공조달분류 8자리) = 같은 코드
 *  · 조달청(지방조달청 포함)이 계약기관이면 대행 계약 → 수요기관을 실제 구매기관으로
 *  · 조달청 3자단가·단가계약·다수공급자계약은 기관 구매가 아니라 제외
 *  · '공고 없이' = 수의계약이면서 연결된 입찰공고 번호가 없는 계약
 * 공개 조달 데이터(계약)만 사용. 업체명은 나라장터 계약 정보에 공개된 상호
 */

export interface SalesItem { name: string; unitPrice: number | null; qty: number | null }

export interface SalesContract {
  id: string;
  title: string;
  kind: string;
  /** 실제 구매기관 */
  buyer: string;
  buyerKind: string | null;
  /** 계약기관(조달청 대행이면 조달청) */
  contractOrg: string | null;
  dept: string | null;
  method: string | null;
  /** 공고 없이 체결 (수의계약 + 입찰공고 번호 없음) */
  noNotice: boolean;
  /** 수의계약 근거 (예: 추정가격 2천만원 이하 물품 또는 용역) */
  basis: string | null;
  amount: number;
  date: string | null;
  endDate: string | null;
  vendors: string[];
  matched: string[];
  items: SalesItem[];
  url: string | null;
}

export interface SalesOrg {
  name: string;
  kind: string | null;
  contracts: SalesContract[];
  count: number;
  amount: number;
  last: string | null;
  /** 오늘 이후 가장 먼저 끝나는 계약일 */
  nextEnd: string | null;
  depts: string[];
  vendors: { name: string; count: number }[];
}

const FIELDS = 'id,bid_type,title,org,org_kind,method,amount,contract_date,end_date,dept,demand_orgs,corps,notice_no,base_detail,detail_url';
const PPS = /조달청/;
const PPS_FRAME = /3자단가|단가계약|다수공급자|MAS/i;
const LIMIT = 3000;

interface Row {
  id: string; bid_type: string; title: string; org: string | null; org_kind: string | null; method: string | null;
  amount: number | null; contract_date: string | null; end_date: string | null; dept: string | null;
  demand_orgs: string | null; corps: { name?: string }[] | null; notice_no: string | null; base_detail: string | null; detail_url: string | null;
}

/** '[1^7832000^강원도교육청 강릉교육지원청^교육기관^^^]' → 첫 수요기관 */
export function firstDemand(raw: string | null): { name: string; kind: string | null } | null {
  const m = /\[\d*\^[^^]*\^([^^\]]+)\^([^^\]]*)/.exec(raw ?? '');
  return m ? { name: m[1].trim(), kind: m[2].trim() || null } : null;
}

/** 원본에 남은 HTML 문자 참조 (&amp; 등) 풀기 */
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** 회원 주요 품목(관심 없음 제외) → 8자리 코드 → 이름 */
export function productCodes(products: Product[] | null, muted: MuteItem[] = []): Map<string, string> {
  const off = new Set(muted.filter((m) => m.kind === 'product').map((m) => m.code.slice(0, 8)));
  const out = new Map<string, string>();
  for (const p of products ?? []) {
    const c = p.code?.slice(0, 8);
    if (c && c.length === 8 && !off.has(c) && !out.has(c)) out.set(c, p.name);
  }
  return out;
}

export async function fetchSalesContracts(codes: Map<string, string>): Promise<SalesContract[]> {
  if (!codes.size) return [];
  const sb = getSupabase();
  const list = [...codes.keys()];

  // 1) 물품 세부 줄 → 계약 번호별 맞은 품목·단가
  const goods = new Map<string, { matched: Set<string>; items: SalesItem[] }>();
  for (const part of chunk(list, 40)) {
    const { data, error } = await sb.from('contract_lines').select('contract_id,code,item_name,name,unit_price,qty')
      .in('code', part).order('contract_date', { ascending: false, nullsFirst: false }).limit(LIMIT);
    if (error) throw new Error(error.message);
    for (const l of data ?? []) {
      const g = goods.get(l.contract_id) ?? { matched: new Set<string>(), items: [] };
      g.matched.add(codes.get(l.code) ?? l.name ?? '');
      if (g.items.length < 5) g.items.push({ name: l.item_name || l.name || '', unitPrice: l.unit_price, qty: l.qty });
      goods.set(l.contract_id, g);
    }
  }

  // 2) 계약 — 물품은 번호로, 공사·용역은 분류 코드로
  const rows = new Map<string, { row: Row; matched: Set<string>; items: SalesItem[] }>();
  const ids = [...goods.keys()];
  const byId = await Promise.all(chunk(ids, 100).map(async (part) => {
    const { data, error } = await sb.from('contracts').select(FIELDS).in('id', part);
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  }));
  for (const r of byId.flat()) { const g = goods.get(r.id)!; rows.set(r.id, { row: r, matched: g.matched, items: g.items }); }
  for (const part of chunk(list, 40)) {
    const { data, error } = await sb.from('contracts').select(`${FIELDS},class_code`).in('class_code', part).limit(LIMIT);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as (Row & { class_code: string })[]) {
      const cur = rows.get(r.id);
      if (cur) cur.matched.add(codes.get(r.class_code) ?? '');
      else rows.set(r.id, { row: r, matched: new Set([codes.get(r.class_code) ?? '']), items: [] });
    }
  }

  // 3) 실제 구매기관, 단가계약 제외
  const out: SalesContract[] = [];
  for (const { row: r, matched, items } of rows.values()) {
    const pps = PPS.test(r.org ?? '');
    if (pps && PPS_FRAME.test(r.title)) continue;
    const dem = pps ? firstDemand(r.demand_orgs) : null;
    if (pps && !dem) continue; // 실제 구매기관을 알 수 없는 대행 계약
    const buyer = dem?.name ?? r.org;
    if (!buyer) continue;
    const sui = r.method === '수의계약';
    out.push({
      id: r.id, title: unesc(r.title), kind: r.bid_type, buyer, buyerKind: dem?.kind ?? r.org_kind, contractOrg: r.org, dept: pps ? null : r.dept,
      method: r.method, noNotice: sui && !r.notice_no, basis: sui ? r.base_detail : null,
      amount: Number(r.amount) || 0, date: r.contract_date, endDate: r.end_date,
      vendors: (r.corps ?? []).map((c) => unesc(c.name ?? '')).filter(Boolean),
      matched: [...matched].filter(Boolean), items, url: r.detail_url,
    });
  }
  return out.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
}

const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export function groupByOrg(list: SalesContract[]): SalesOrg[] {
  const m = new Map<string, SalesContract[]>();
  for (const c of list) m.set(c.buyer, [...(m.get(c.buyer) ?? []), c]);
  const t = today();
  return [...m.entries()].map(([name, cs]) => {
    const vend = new Map<string, number>();
    for (const c of cs) for (const v of new Set(c.vendors)) vend.set(v, (vend.get(v) ?? 0) + 1);
    const ends = cs.map((c) => c.endDate).filter((d): d is string => !!d && d >= t).sort();
    return {
      name, kind: cs[0].buyerKind, contracts: cs, count: cs.length,
      amount: cs.reduce((a, c) => a + c.amount, 0),
      last: cs.map((c) => c.date).filter((d): d is string => !!d && d <= t).sort().at(-1) ?? null, // 미래 계약일(이상값)은 '최근'에서 제외
      nextEnd: ends[0] ?? null,
      depts: [...new Set(cs.map((c) => c.dept).filter((d): d is string => !!d))].slice(0, 3),
      vendors: [...vend.entries()].map(([n, count]) => ({ name: n, count })).sort((a, b) => b.count - a.count).slice(0, 3),
    };
  });
}

/** 기관유형 묶음 */
export const KIND_GROUPS: { key: string; label: string; test: (k: string | null) => boolean }[] = [
  { key: 'local', label: '지자체', test: (k) => !!k && /지방자치단체/.test(k) },
  { key: 'public', label: '공공기관', test: (k) => !!k && /공기업|준정부|공공기관/.test(k) },
  { key: 'edu', label: '교육기관', test: (k) => !!k && /교육/.test(k) },
  { key: 'gov', label: '국가기관', test: (k) => !!k && /국가기관/.test(k) },
];

/** 오늘부터 끝나는 날까지 일수 */
export const daysTo = (d: string) => Math.round((Date.parse(d) - Date.parse(today())) / 86400e3);
