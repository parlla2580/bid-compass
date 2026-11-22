import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** 환경변수가 없으면 Supabase 없이 브라우저 저장만으로 동작 */
export const supabaseEnabled = !!(url && key);

let client: SupabaseClient | null = null;

/** 브라우저용 Supabase 클라이언트 (publishable 키 — 권한은 DB의 RLS 규칙으로 제한) */
export function getSupabase(): SupabaseClient {
  if (!supabaseEnabled) throw new Error('Supabase 환경변수가 설정되지 않았습니다 (.env.example 참고)');
  client ??= createBrowserClient(url!, key!);
  return client;
}

/**
 * 결과를 기다리지 않는 저장 — supabase-js 요청은 then()을 불러야 실제로 보내짐.
 *  `void getSupabase().from(...).upsert(...)` 처럼 쓰면 요청이 아예 안 나감 (2026-11-22 발견: 저장한 기관·알림 읽음·본 공고 표시가 서버에 안 남던 원인)
 */
export function fire(q: PromiseLike<{ error: { message: string } | null }>, what = '저장'): void {
  q.then(({ error }) => { if (error) console.warn(`${what} 실패:`, error.message); }, (e) => console.warn(`${what} 실패:`, e));
}
