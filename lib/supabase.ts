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
