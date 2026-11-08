import { NextResponse, type NextRequest } from 'next/server';
import { ceoMatches, lookupCompany, validBizno } from '@/lib/nara-server';

/*
 * 가입 시 회사 확인 — 사업자등록번호 + 대표자명을 나라장터 업체정보와 대조
 * 대표자명은 비교에만 쓰고 저장하지 않습니다.
 * 응답
 *   { status: 'verified', corpName, location, industries }  나라장터 등록 + 대표자명 일치
 *   { status: 'mismatch' }                                     나라장터 등록 + 대표자명 불일치
 *   { status: 'unregistered' }                                 나라장터 미등록 (대표자명으로 확인 불가)
 */
export async function POST(req: NextRequest) {
  let body: { bizno?: string; ceo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 });
  }
  const bizno = (body.bizno ?? '').replace(/\D/g, '');
  const ceo = (body.ceo ?? '').trim();
  if (!validBizno(bizno)) return NextResponse.json({ error: '사업자등록번호 10자리를 입력해 주세요' }, { status: 400 });
  if (ceo.length < 2) return NextResponse.json({ error: '대표자명을 입력해 주세요' }, { status: 400 });

  try {
    const c = await lookupCompany(bizno);
    if (!c) return NextResponse.json({ status: 'unregistered' });
    if (!ceoMatches(ceo, c.ceo)) return NextResponse.json({ status: 'mismatch' });
    return NextResponse.json({ status: 'verified', corpName: c.corpName, location: c.location, industries: c.industries });
  } catch (e) {
    return NextResponse.json({ error: `나라장터 조회에 실패했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}
