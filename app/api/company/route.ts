import { NextResponse, type NextRequest } from 'next/server';

/*
 * 사업자등록번호 → 나라장터 등록 업체 정보 (사용자정보 서비스)
 * 공공데이터포털 인증키(NARA_API_KEY)는 서버에서만 사용합니다.
 */

const BASE = 'https://apis.data.go.kr/1230000/ao/UsrInfoService02';

interface ApiBody<T> {
  totalCount?: number | string;
  items?: T[] | { item?: T | T[] };
}

async function call<T>(op: string, params: Record<string, string>): Promise<T[]> {
  const key = process.env.NARA_API_KEY;
  if (!key) throw new Error('NARA_API_KEY 미설정');
  const qs = new URLSearchParams({ serviceKey: key, pageNo: '1', numOfRows: '100', type: 'json', ...params });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/${op}?${qs}`, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const json = await res.json();
      const body: ApiBody<T> | undefined = json.response?.body;
      if (json.response?.header?.resultCode !== '00' || !body) {
        throw new Error(json.response?.header?.resultMsg ?? '조회 오류');
      }
      const items = body.items ?? [];
      return Array.isArray(items) ? items : items.item ? ([] as T[]).concat(items.item) : [];
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return [];
}

interface CorpRow { corpNm?: string; rgnNm?: string; ceoNm?: string; mnfctDivNm?: string; hdoffceDivNm?: string }
interface IndRow { indstrytyCd?: string; indstrytyNm?: string; rprsntIndstrytyYn?: string; indstrytyStatsNm?: string }

export async function GET(req: NextRequest) {
  const bizno = (req.nextUrl.searchParams.get('bizno') ?? '').replace(/\D/g, '');
  if (bizno.length !== 10) {
    return NextResponse.json({ error: '사업자등록번호 10자리를 입력해 주세요' }, { status: 400 });
  }
  if (!process.env.NARA_API_KEY) {
    return NextResponse.json({ error: '서버에 공공데이터포털 인증키가 설정되지 않았습니다' }, { status: 503 });
  }
  try {
    const [corps, inds] = await Promise.all([
      call<CorpRow>('getPrcrmntCorpBasicInfo02', { inqryDiv: '3', bizno }),
      call<IndRow>('getPrcrmntCorpIndstrytyInfo02', { inqryDiv: '1', bizno }),
    ]);
    const corp = corps[0];
    if (!corp) return NextResponse.json({ registered: false });
    const industries = [...new Map(
      inds
        .filter((i) => i.indstrytyCd && i.indstrytyNm)
        .sort((a, b) => (b.rprsntIndstrytyYn === 'Y' ? 1 : 0) - (a.rprsntIndstrytyYn === 'Y' ? 1 : 0))
        .map((i) => [i.indstrytyCd!, { code: i.indstrytyCd!, name: i.indstrytyNm! }]),
    ).values()];
    return NextResponse.json({
      registered: true,
      corpName: corp.corpNm ?? null,
      location: corp.rgnNm?.trim() || null,
      ceo: corp.ceoNm ?? null,
      kind: corp.mnfctDivNm ?? null,
      industries,
    });
  } catch (e) {
    return NextResponse.json({ error: `나라장터 조회에 실패했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}
