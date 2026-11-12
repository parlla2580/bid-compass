import 'server-only';
import type { Industry } from './data';

/*
 * 나라장터 사용자정보 서비스 — 서버 전용
 * 공공데이터포털 인증키(NARA_API_KEY)는 브라우저로 보내지 않습니다.
 */

const BASE = 'https://apis.data.go.kr/1230000/ao/UsrInfoService02';

interface ApiBody<T> {
  items?: T[] | { item?: T | T[] };
}

async function call<T>(op: string, params: Record<string, string>): Promise<T[]> {
  const key = process.env.NARA_API_KEY;
  if (!key) throw new Error('서버에 공공데이터포털 인증키가 설정되지 않았습니다');
  const qs = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '100', type: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${op}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const json = await res.json();
      const body: ApiBody<T> | undefined = json.response?.body;
      if (json.response?.header?.resultCode !== '00' || !body) throw new Error(json.response?.header?.resultMsg ?? '조회 오류');
      const items = body.items ?? [];
      return Array.isArray(items) ? items : items.item ? ([] as T[]).concat(items.item) : [];
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return [];
}

interface CorpRow { corpNm?: string; rgnNm?: string; ceoNm?: string; emplyeNum?: string }
interface IndRow { indstrytyCd?: string; indstrytyNm?: string; rprsntIndstrytyYn?: string }

/** 조달업체 공급물품 (세부품명번호 10자리) */
export interface SupplyProduct { code: string; name: string }

export interface NaraCompany {
  corpName: string | null;
  ceo: string | null;
  location: string | null;
  industries: Industry[];
  /** 나라장터 등록 종업원수 (업체가 입력한 값, 기업규모 참고용) */
  employees: number | null;
  products: SupplyProduct[];
}

/** 응답 필드 이름이 서비스 버전마다 달라질 수 있어, 코드(10자리)·이름 필드를 찾아 씀 */
function toProduct(r: Record<string, string | undefined>): SupplyProduct | null {
  const keys = Object.keys(r);
  const codeKey = keys.find((k) => /Clsfc(No)?$/i.test(k) && /^\d{8,10}$/.test(r[k] ?? '')) ?? keys.find((k) => /^\d{10}$/.test(r[k] ?? ''));
  const nameKey = keys.find((k) => /(Clsfc(No)?Nm|PrdctNm|prdctNm)$/i.test(k) && r[k]);
  if (!codeKey) return null;
  return { code: r[codeKey]!, name: (nameKey && r[nameKey]) || r[codeKey]! };
}

/** 사업자번호 → 나라장터 등록 업체 정보. 미등록이면 null */
export async function lookupCompany(bizno: string): Promise<NaraCompany | null> {
  const [corps, inds, prds] = await Promise.all([
    call<CorpRow>('getPrcrmntCorpBasicInfo02', { inqryDiv: '3', bizno }),
    call<IndRow>('getPrcrmntCorpIndstrytyInfo02', { inqryDiv: '1', bizno }),
    // 공급물품은 없거나 조회 실패해도 업체 조회는 계속
    call<Record<string, string>>('getPrcrmntCorpSplyPrdctInfo02', { inqryDiv: '1', bizno }).catch(() => []),
  ]);
  const corp = corps[0];
  if (!corp) return null;
  const industries = [...new Map(
    inds
      .filter((i) => i.indstrytyCd && i.indstrytyNm)
      .sort((a, b) => (b.rprsntIndstrytyYn === 'Y' ? 1 : 0) - (a.rprsntIndstrytyYn === 'Y' ? 1 : 0))
      .map((i) => [i.indstrytyCd!, { code: i.indstrytyCd!, name: i.indstrytyNm! }]),
  ).values()];
  const products = [...new Map(prds.map(toProduct).filter((x): x is SupplyProduct => !!x).map((x) => [x.code, x])).values()];
  const emp = Number(corp.emplyeNum);
  return { corpName: corp.corpNm ?? null, ceo: corp.ceoNm ?? null, location: corp.rgnNm?.trim() || null, industries, products, employees: Number.isFinite(emp) && emp > 0 ? emp : null };
}

/**
 * 입력한 대표자명이 나라장터 대표자명과 같은지 — 띄어쓰기 무시, 공동대표('홍길동,김철수' 등)는 한 명만 맞아도 일치
 */
export function ceoMatches(input: string, registered: string | null): boolean {
  if (!registered) return false;
  const norm = (s: string) => s.replace(/\s+/g, '').replace(/[()]/g, '');
  const a = norm(input);
  if (a.length < 2) return false;
  const names = registered.split(/[,·/]|외\s*\d+\s*(?:명|인)?/).map(norm).filter(Boolean);
  return names.includes(a) || norm(registered) === a;
}

export const validBizno = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').length === 10;
