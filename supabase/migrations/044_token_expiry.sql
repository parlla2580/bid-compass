-- =========================================================
-- 044: 수집 예약 토큰 만료일 확인 (2026-11-22) — 만료 30일 전 GitHub 이슈 알림용
--  · 1순위: GitHub 응답 머리글 github-authentication-token-expiration (039 예약 요청의 응답, pg_net 이 6시간 보관)
--          → 토큰을 갱신하면 다음 요청부터 새 만료일이 자동 반영
--  · 2순위: ops_settings 의 github_token_expires (머리글이 안 올 때 대비 · 지금 값 2027-11-22)
--          토큰 갱신 때 머리글이 안 잡히면: update public.ops_settings set value = '새 만료일' where key = 'github_token_expires';
--  · 수집기(관리자 키)만 부를 수 있음. 회원은 볼 수 없음
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다(설정값은 유지).
-- =========================================================

create table if not exists public.ops_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.ops_settings enable row level security;  -- 정책 없음 = 회원 접근 불가
revoke all on public.ops_settings from anon, authenticated;
insert into public.ops_settings (key, value) values ('github_token_expires', '2027-11-22')
on conflict (key) do nothing;

create or replace function public.collect_token_expiry()
returns table (expires_at timestamptz, source text)
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  -- 최근 GitHub 응답 머리글 (키 대소문자 무관)
  begin
    select h.value into v
    from net._http_response r, jsonb_each_text(r.headers) h
    where lower(h.key) = 'github-authentication-token-expiration'
    order by r.created desc limit 1;
  exception when others then v := null;  -- pg_net 표가 없거나 구조가 다르면 2순위로
  end;
  if v is not null then
    begin
      return query select replace(v, ' UTC', '+00')::timestamptz, 'github'::text;
      return;
    exception when others then null;
    end;
  end if;
  return query
    select (s.value || ' 00:00:00+09')::timestamptz, 'ops_settings'::text
    from public.ops_settings s where s.key = 'github_token_expires';
end $$;
revoke all on function public.collect_token_expiry() from anon, authenticated, public;
grant execute on function public.collect_token_expiry() to service_role;

-- 확인: expires_at 과 source 한 줄 (source = github 이면 머리글로 자동 확인, ops_settings 면 저장값)
select expires_at, source, (expires_at::date - current_date) as days_left from public.collect_token_expiry();
