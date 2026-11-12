import { NextResponse, type NextRequest } from 'next/server';
import { lookupCompany, validBizno } from '@/lib/nara-server';
import { checkLimits, clientIp } from '@/lib/server-guard';

/*
 * 사업자등록번호 → 업종·소재지 (가입 전 간편 시작용)
 * 업체명은 나라장터 공개 정보라 확인용으로 보여줍니다(2026-11-09 결정). 대표자명은 돌려주지 않습니다.
 * 단, 업체명을 '회사 확인 완료'로 저장하는 것은 가입 시 대표자명 확인(/api/company/verify) 후에만.
 */
export async function GET(req: NextRequest) {
  const bizno = (req.nextUrl.searchParams.get('bizno') ?? '').replace(/\D/g, '');
  if (!validBizno(bizno)) return NextResponse.json({ error: '사업자등록번호 10자리를 입력해 주세요' }, { status: 400 });
  // 호출 제한 — 나라장터 API 하루 한도 보호, 대량 조회 방지
  const ip = clientIp(req.headers);
  const limited = await checkLimits([
    { name: 'lookup-ip-10m', key: ip, windowSec: 600, max: 20 },
    { name: 'lookup-ip-day', key: ip, windowSec: 86400, max: 120 },
  ]);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });
  try {
    const c = await lookupCompany(bizno);
    if (!c) return NextResponse.json({ registered: false });
    return NextResponse.json({ registered: true, corpName: c.corpName, location: c.location, industries: c.industries, products: c.products, employees: c.employees });
  } catch (e) {
    return NextResponse.json({ error: `나라장터 조회에 실패했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}
