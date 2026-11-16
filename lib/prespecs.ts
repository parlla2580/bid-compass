import { keywordHit, type BidType, type Notice, type Product, type Profile } from './data';
import { productMatch } from './match';
import { specificity, titleDf, type Stats } from './stats';
import { getSupabase } from './supabase';

/*
 * 곧 나올 공고 — 사전규격 (022, 기획 17.3)
 * 정식 공고 전에 규격서·배정예산을 공개하고 의견을 받는 단계.
 * 우리 품목과 맞는 사전규격만 골라 '의견 마감 / 공고 기다리는 중 / 공고 나옴'으로 보여줌
 * 데이터: ① CDN 스냅샷(public-data/prespecs.json.gz, 수집기가 매시간) ② recent_prespecs(30)
 */

interface PrespecRow {
  id: string; kind: string; title: string; org: string | null; demand_org: string | null; budget: number | null;
  received_at: string | null; opinion_close: string | null; delivery_until: string | null; sw: boolean | null;
  products: Product[] | null; files: string[] | null; notice_id: number | null; notice_closes_at: string | null;
}

export type PrespecStatus = 'opinion' | 'waiting' | 'noticed' | 'closed';

export interface Prespec {
  id: string;
  kind: BidType;
  title: string;
  org: string | null;
  demandOrg: string | null;
  budget: number | null;
  receivedAt: Date | null;
  opinionClose: Date | null;
  deliveryUntil: string | null;
  sw: boolean;
  products: Product[];
  files: string[];
  noticeId: number | null;
  status: PrespecStatus;
}

const URL_ = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/public-data/prespecs.json.gz`;
const MAX_AGE = 6 * 3600e3;

async function snapshot(): Promise<PrespecRow[] | null> {
  if (typeof DecompressionStream === 'undefined' || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const res = await fetch(URL_, { cache: 'no-cache', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    const text = buf[0] === 0x1f && buf[1] === 0x8b
      ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(buf);
    const s = JSON.parse(text) as { at?: string; rows?: PrespecRow[] };
    if (!s.at || !Array.isArray(s.rows) || Date.now() - new Date(s.at).getTime() > MAX_AGE) return null;
    return s.rows;
  } catch {
    return null;
  }
}

function toPrespec(r: PrespecRow, now: number): Prespec {
  const close = r.opinion_close ? new Date(r.opinion_close) : null;
  const noticed = r.notice_id !== null;
  const noticeOpen = noticed && (!r.notice_closes_at || new Date(r.notice_closes_at).getTime() >= now);
  return {
    id: r.id, kind: (r.kind === '물품' || r.kind === '공사' ? r.kind : '용역') as BidType, title: r.title,
    org: r.org, demandOrg: r.demand_org, budget: r.budget ? Number(r.budget) : null,
    receivedAt: r.received_at ? new Date(r.received_at) : null, opinionClose: close, deliveryUntil: r.delivery_until,
    sw: !!r.sw, products: r.products ?? [], files: r.files ?? [], noticeId: r.notice_id,
    status: noticed ? (noticeOpen ? 'noticed' : 'closed') : close && close.getTime() >= now ? 'opinion' : 'waiting',
  };
}

let memo: Promise<Prespec[]> | null = null;
let memoAt = 0;

/** 최근 30일 사전규격 (한 화면에서 여러 번 불러도 한 번만 받음, 10분 유지) */
export function fetchPrespecs(): Promise<Prespec[]> {
  if (memo && Date.now() - memoAt < 10 * 60e3) return memo;
  memoAt = Date.now();
  memo = (async () => {
    let rows = await snapshot();
    if (!rows) {
      rows = [];
      for (let i = 0; i < 50; i++) { // 함수 결과도 한 번에 1,000행까지
        const { data, error } = await getSupabase().rpc('recent_prespecs', { p_days: 30 }).range(i * 1000, i * 1000 + 999);
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as PrespecRow[]));
        if (!data || data.length < 1000) break;
      }
    }
    const now = Date.now();
    return rows.map((r) => toPrespec(r, now));
  })();
  memo.catch(() => { memo = null; });
  return memo;
}

export interface PrespecMatch { p: Prespec; why: string; sim: number }

/** 업종 이름 → 사업명에서 찾을 핵심어 ('석면해체.제거업' → 석면해체 / '전기공사업' → 전기)
 *  공사·용역 사전규격은 품목 코드가 거의 없어, 품목 없이 업종만 있는 회사(공사업체 등)를 위해 사용 */
const IND_GENERIC = /^(공사|건설|시설|서비스|판매|제조|사업|용역|관리|일반|기타|종합|전문|자유|연구|학술|정보|통신|설비|업무|대행|제거|설치)$/;
function industryWords(profile: Profile, stats: Stats | null): { w: string; name: string; build: boolean }[] {
  const off = new Set((profile.muted ?? []).filter((m) => m.kind === 'industry').map((m) => m.code));
  const out: { w: string; name: string; build: boolean }[] = [];
  for (const ind of profile.industries ?? []) {
    if (off.has(ind.code)) continue;
    const build = /공사업/.test(ind.name); // 공사업 면허는 공사 사전규격에만
    for (const raw of ind.name.replace(/\([^)]*\)/g, ' ').split(/[^가-힣A-Za-z0-9]+/)) {
      const w = raw.replace(/(공사업|사업자|사업|업)$/, '');
      if (w.length < 2 || IND_GENERIC.test(w)) continue;
      // 아주 흔한 낱말은 제외 — 공고명 특이도 0.3 이상 (통계가 없으면 3글자 이상만)
      if (stats ? specificity(stats, titleDf(stats, w)) < 0.3 : w.length < 3) continue;
      for (const v of [w, ...(IND_SYNONYM[w] ?? [])]) if (!out.some((x) => x.w === v)) out.push({ w: v, name: ind.name, build });
    }
  }
  return out;
}

/** 업종 이름과 공고에서 쓰는 말이 다른 경우 (면허 이름 → 사업명에 흔히 쓰는 말) */
const IND_SYNONYM: Record<string, string[]> = {
  건물위생관리: ['청소', '미화'],
  소독: ['방역'],
  경비: ['보안'],
  조경식재: ['조경'],
  실내건축: ['인테리어'],
};

/** 두 글자 낱말은 낱말 첫머리에서만 ('비계'가 '정비계획' 안에서 맞지 않게) */
// 낱말 뒤에 붙으면 다른 뜻이 되는 경우 ('청소'+'년', '전기'+'차')
const NOT_AFTER: Record<string, string> = { 청소: '년', 전기: '차', 소독: '약' };
const hasWord = (title: string, w: string) => (w.length >= 3 ? title.includes(w)
  : new RegExp(`(^|[^가-힣])${w}${NOT_AFTER[w] ? `(?!${NOT_AFTER[w]})` : ''}`).test(title));

export function matchPrespecs(list: Prespec[], profile: Profile, stats: Stats | null): PrespecMatch[] {
  const out: PrespecMatch[] = [];
  const mutedProd = new Set((profile.muted ?? []).filter((m) => m.kind === 'product').map((m) => m.code));
  const types = profile.types?.length ? new Set(profile.types) : null;
  const indWords = industryWords(profile, stats);
  for (const p of list) {
    if (p.status === 'closed') continue;
    if (types && !types.has(p.kind)) continue;
    const like = { title: p.title, products: p.products } as Notice;
    if (keywordHit(like, profile.keywords?.minus)) continue;
    const plus = keywordHit(like, profile.keywords?.plus);
    if (plus) { out.push({ p, why: `꼭 볼 단어 · ${plus}`, sim: 1 }); continue; }
    const pm = productMatch(like, profile.products, stats);
    if (pm && pm.sim >= 0.5 && !mutedProd.has(pm.theirs.code)) {
      out.push({ p, why: `${pm.sim >= 0.8 ? '우리 품목' : '비슷한 품목'} · ${pm.mine.name}`, sim: pm.sim });
      continue;
    }
    // 품목으로 못 맞추면 업종 이름 핵심어 (공사·용역)
    if (p.kind !== '물품') {
      const hit = indWords.find((x) => (!x.build || p.kind === '공사') && hasWord(p.title, x.w));
      if (hit) out.push({ p, why: `우리 업종 · ${hit.name}`, sim: 0.6 });
    }
  }
  return out;
}
