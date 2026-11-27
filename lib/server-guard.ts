import 'server-only';
import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/*
 * 서버 전용 — 관리자 키 Supabase 클라이언트, 호출 제한, 요청자 확인
 *  · 관리자 키(SUPABASE_SECRET_KEY)는 Vercel 서버 환경변수에만. 없으면 관리자 기능은 꺼지고 메모리 제한만 동작
 *  · IP·사업자번호는 해시로만 다룸 (원래 값은 DB에 남기지 않음)
 */

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient | null {
  if (!URL || !SECRET) return null;
  admin ??= createClient(URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

/** 해시 키 — 서버 비밀값을 섞어, 바깥에서 같은 키를 만들 수 없게 */
export const hashKey = (...parts: string[]) =>
  createHash('sha256').update(`${process.env.NARA_API_KEY ?? ''}|${parts.join('|')}`).digest('hex').slice(0, 40);

/** 요청자 IP — Vercel 이 직접 넣는 x-real-ip 우선 (x-forwarded-for 는 요청자가 앞부분을 꾸밀 수 있어 호출 제한을 피해 갈 수 있음 · 2026-11-27 보안 검토) */
export function clientIp(headers: Headers): string {
  return headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',').pop()?.trim() || 'unknown';
}

/* ---------- 호출 제한 ---------- */
// 서버 인스턴스마다 따로인 예비 제한 (DB 제한이 없을 때·실패할 때)
const mem = new Map<string, number[]>();
function memHit(key: string, windowSec: number, max: number): boolean {
  const now = Date.now(), from = now - windowSec * 1000;
  const list = (mem.get(key) ?? []).filter((t) => t > from);
  list.push(now);
  mem.set(key, list);
  if (mem.size > 5000) for (const [k, v] of mem) if (!v.some((t) => t > from)) mem.delete(k);
  return list.length <= max;
}

export interface Limit { name: string; key: string; windowSec: number; max: number; message?: string }

/** 모든 제한을 통과하면 null, 걸리면 사용자에게 보여줄 문장 */
export async function checkLimits(limits: Limit[]): Promise<string | null> {
  const sb = adminClient();
  for (const l of limits) {
    const key = hashKey(l.name, l.key);
    let ok = memHit(key, l.windowSec, l.max);
    if (ok && sb) {
      const { data, error } = await sb.rpc('rl_hit', { p_key: key, p_window_sec: l.windowSec, p_max: l.max });
      if (!error) ok = data === true; // 016 실행 전이면 오류 → 메모리 제한만
    }
    if (!ok && l.message) return l.message;
    if (!ok) return `요청이 너무 많아요. ${l.windowSec >= 3600 ? `${Math.round(l.windowSec / 3600)}시간` : `${Math.round(l.windowSec / 60)}분`} 뒤에 다시 시도해 주세요`;
  }
  return null;
}

/** 요청에 실린 로그인 토큰으로 회원 id 확인 (관리자 키 필요) */
export async function requestUser(headers: Headers): Promise<string | null> {
  const sb = adminClient();
  const token = headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!sb || !token) return null;
  const { data, error } = await sb.auth.getUser(token);
  if (error) console.error('requestUser 실패', error.status, error.message);
  return error ? null : data.user?.id ?? null;
}
