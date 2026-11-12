import { NextResponse, type NextRequest } from 'next/server';
import { ceoMatches, lookupCompany, validBizno } from '@/lib/nara-server';
import { adminClient, checkLimits, clientIp, requestUser } from '@/lib/server-guard';

/*
 * 가입 시 회사 확인 — 사업자등록번호 + 대표자명을 나라장터 업체정보와 대조
 * 대표자명은 비교에만 쓰고 저장하지 않습니다.
 * 응답
 *   { status: 'verified', corpName, location, industries }  나라장터 등록 + 대표자명 일치
 *   { status: 'mismatch' }                                     나라장터 등록 + 대표자명 불일치
 *   { status: 'unregistered' }                                 나라장터 미등록 (대표자명으로 확인 불가)
 * 로그인 토큰(Authorization: Bearer)과 함께 오면, 확인 결과를 서버가 company_verifications 에 기록 (016)
 *   → 입찰 분석은 이 기록으로만 열림. 브라우저가 업체명을 써도 분석은 열리지 않음
 * 호출 제한: 같은 IP 시간당 10회·하루 30회, 같은 사업자번호 시간당 5회 (대표자명 맞히기 방지)
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

  const ip = clientIp(req.headers);
  const limited = await checkLimits([
    { name: 'verify-ip-hour', key: ip, windowSec: 3600, max: 10 },
    { name: 'verify-ip-day', key: ip, windowSec: 86400, max: 30 },
    { name: 'verify-bizno-hour', key: bizno, windowSec: 3600, max: 5 },
  ]);
  if (limited) return NextResponse.json({ error: limited }, { status: 429 });

  try {
    const c = await lookupCompany(bizno);
    if (!c) return NextResponse.json({ status: 'unregistered' });
    if (!ceoMatches(ceo, c.ceo)) return NextResponse.json({ status: 'mismatch' });

    // 로그인한 회원이면 서버가 확인 결과를 기록 (관리자 키 + 016 필요, 없으면 stored: false)
    let stored = false;
    const userId = await requestUser(req.headers);
    const sb = adminClient();
    if (userId && sb && c.corpName) {
      const { error } = await sb.from('company_verifications')
        .upsert({ user_id: userId, bizno, corp_name: c.corpName, verified_at: new Date().toISOString() });
      stored = !error;
    }
    return NextResponse.json({ status: 'verified', corpName: c.corpName, location: c.location, industries: c.industries, stored });
  } catch (e) {
    return NextResponse.json({ error: `나라장터 조회에 실패했습니다: ${(e as Error).message}` }, { status: 502 });
  }
}
