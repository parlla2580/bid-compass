import { EMPTY_PROFILE, type BidType, type CompanySize, type Industry, type Keywords, type MuteItem, type Product, type Profile } from './data';
import { getSupabase } from './supabase';

/* =========================================================
 * Supabase 읽기·쓰기 — 회원 데이터 (supabase/schema.sql, migrations/003)
 * ========================================================= */

interface ProfileRow {
  user_id: string;
  bizno: string | null;
  nara_registered: boolean | null;
  corp_name: string | null;
  industries: Industry[] | null;
  location: string | null;
  company_size: CompanySize | null;
  records: string;
  pref_types: BidType[];
  pref_orgs: string[];
  price_min: number | null;
  price_max: number | null;
  products?: Product[] | null;
  muted?: MuteItem[] | null;
  keywords?: Keywords | null;
}

function toRow(userId: string, p: Profile): ProfileRow {
  return {
    user_id: userId,
    bizno: p.bizno,
    nara_registered: p.naraRegistered,
    corp_name: p.corpName,
    industries: p.industries,
    location: p.location,
    company_size: p.size,
    records: p.records,
    pref_types: p.types,
    pref_orgs: p.preferredOrgs,
    price_min: p.priceRange?.[0] ?? null,
    price_max: p.priceRange?.[1] ?? null,
    products: p.products,
    muted: p.muted,
    keywords: p.keywords,
  };
}

function fromRow(r: ProfileRow): Profile {
  return {
    ...EMPTY_PROFILE,
    bizno: r.bizno,
    naraRegistered: r.nara_registered,
    corpName: r.corp_name,
    industries: r.industries,
    location: r.location,
    size: r.company_size,
    records: r.records,
    types: r.pref_types,
    preferredOrgs: r.pref_orgs,
    priceRange: r.price_min !== null && r.price_max !== null ? [Number(r.price_min), Number(r.price_max)] : null,
    products: r.products ?? null,
    muted: r.muted ?? [],
    keywords: r.keywords ?? {},
  };
}

/** 회원의 프로필과 저장 공고 — 프로필 행이 없으면 profile은 null */
export async function loadMember(userId: string): Promise<{ profile: Profile | null; saved: number[] }> {
  const sb = getSupabase();
  const [p, s] = await Promise.all([
    sb.from('company_profiles').select('*').eq('user_id', userId).maybeSingle<ProfileRow>(),
    sb.from('saved_notices').select('notice_id').eq('user_id', userId).order('saved_at'),
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  return { profile: p.data ? fromRow(p.data) : null, saved: (s.data ?? []).map((r) => Number(r.notice_id)) };
}

export async function saveProfile(userId: string, p: Profile) {
  const row = { ...toRow(userId, p), updated_at: new Date().toISOString() };
  const sb = getSupabase();
  const { error } = await sb.from('company_profiles').upsert(row);
  // 새 열이 아직 DB에 없으면(마이그레이션 실행 전) 그 열만 빼고 다시 저장 — 나머지 정보는 지킴
  const missing = error && /Could not find the '(\w+)' column/.exec(error.message)?.[1];
  if (missing && missing in row) {
    const { [missing as keyof typeof row]: _skip, ...rest } = row; // eslint-disable-line @typescript-eslint/no-unused-vars
    const retry = await sb.from('company_profiles').upsert(rest);
    if (retry.error) throw retry.error;
    return;
  }
  if (error) throw error;
}

export async function setSaved(userId: string, noticeId: number, on: boolean) {
  const sb = getSupabase();
  const { error } = on
    ? await sb.from('saved_notices').upsert({ user_id: userId, notice_id: noticeId }, { ignoreDuplicates: true })
    : await sb.from('saved_notices').delete().eq('user_id', userId).eq('notice_id', noticeId);
  if (error) throw error;
}

/** 가입 직후 — 가입 전 브라우저에 있던 프로필·저장 공고를 서버로 옮김 (기획서 결정 A) */
export async function uploadLocal(userId: string, p: Profile, saved: number[]) {
  await saveProfile(userId, p);
  if (saved.length) {
    const { error } = await getSupabase()
      .from('saved_notices')
      .upsert(saved.map((id) => ({ user_id: userId, notice_id: id })), { ignoreDuplicates: true });
    if (error) throw error;
  }
}

/** Supabase 오류 메시지를 사용자용 한국어로 */
export function authErrorText(message: string): string {
  if (/already registered|already been registered/i.test(message)) return '이미 가입된 이메일입니다. 로그인해 주세요';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 맞지 않습니다';
  if (/password should be at least/i.test(message)) return '비밀번호가 너무 짧습니다';
  if (/email not confirmed/i.test(message)) return '이메일 인증이 필요합니다. 메일함을 확인해 주세요';
  if (/invalid.*email|email.*invalid/i.test(message)) return '이메일 주소를 확인해 주세요';
  if (/rate limit|too many/i.test(message)) return '요청이 많습니다. 잠시 후 다시 시도해 주세요';
  return `처리하지 못했습니다: ${message}`;
}
