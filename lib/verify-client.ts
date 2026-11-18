import { getSupabase, supabaseEnabled } from './supabase';

export type VerifyResult = {
  status: 'verified' | 'mismatch' | 'unregistered';
  corpName?: string | null;
  location?: string | null;
  industries?: { code: string; name: string }[];
  /** 서버가 회사 확인을 기록했는지 (로그인 + 016 + 관리자 키) */
  stored?: boolean;
};

/** 사업자번호 + 대표자명 대조. 로그인 중이면 토큰을 실어 서버가 확인 결과를 기록하게 함 */
export async function verifyCompany(bizno: string, ceo: string): Promise<VerifyResult> {
  let token: string | undefined;
  if (supabaseEnabled) token = (await getSupabase().auth.getSession()).data.session?.access_token;
  const res = await fetch('/api/company/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ bizno, ceo }),
  });
  const v = (await res.json()) as VerifyResult & { error?: string };
  if (!res.ok) throw new Error(v.error ?? '회사 확인에 실패했습니다');
  return v;
}

/** 서버에 기록된 내 회사 확인 (016) — 입찰 분석이 열리는 기준과 같음. 없거나 로그인 전이면 null */
export interface MyVerification { corpName: string; bizno: string; verifiedAt: string }
export async function fetchMyVerification(): Promise<MyVerification | null> {
  if (!supabaseEnabled) return null;
  const { data, error } = await getSupabase().from('company_verifications').select('corp_name,bizno,verified_at').maybeSingle();
  if (error || !data) return null;
  return { corpName: data.corp_name, bizno: data.bizno, verifiedAt: data.verified_at };
}

/** 확인 해제 (029) — 실행 전이면 false */
export async function clearMyVerification(): Promise<boolean> {
  const { data: u } = await getSupabase().auth.getUser();
  if (!u.user) return false;
  const { error, count } = await getSupabase().from('company_verifications').delete({ count: 'exact' }).eq('user_id', u.user.id);
  return !error && (count ?? 0) > 0;
}
