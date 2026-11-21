-- =========================================================
-- 039: 수집기 외부 예약 호출 (2026-11-22)
--  · 문제: GitHub 예약 실행이 11/15~21 기대 약 155회 중 116회만 실행(약 25% 누락), 최대 8.6시간 공백
--  · 방법: Supabase pg_cron 이 매시 07분에 GitHub API(workflow_dispatch)로 collect.yml 실행을 요청
--          GitHub 예약은 3시간마다 보조로 남김 — 최근 50분 안에 실행이 있으면 수집기가 스스로 건너뜀
--  · 토큰: GitHub fine-grained 토큰(이 저장소 하나 · Actions 쓰기만)을 Supabase Vault 에만 보관
--          코드·저장소·채팅에는 쓰지 않음
--
-- 실행 순서
--  1) 토큰은 SQL 이 아니라 Supabase 대시보드 Vault 화면에서 넣기 (SQL 편집기 기록에 토큰이 남지 않게)
--     이름: github_collect_token / 값: GitHub 토큰
--  2) 이 SQL 전체 Run (여러 번 실행해도 안전 · 토큰 갱신 때는 Vault 에서 값만 바꾸면 됨)
-- =========================================================

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 1. 수집 실행 요청 함수 — 회원은 부를 수 없음 (pg_cron 과 관리자만)
create or replace function public.trigger_collect()
returns bigint language plpgsql security definer set search_path = public as $$
declare
  tok text;
  req bigint;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_collect_token';
  if tok is null then
    raise notice 'github_collect_token 없음 — Supabase Vault 에 토큰을 넣어 주세요';
    return null;
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/parlla2580/bid-compass/actions/workflows/collect.yml/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('hours', '3', 'mode', 'full')),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'bid-compass-scheduler',
      'Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  ) into req;
  return req;
end $$;
revoke all on function public.trigger_collect() from anon, authenticated, public;

-- 2. 매시 07분 실행 (정각은 GitHub 도 붐비는 시간이라 피함) — 같은 이름이면 덮어씀
select cron.schedule('collect-hourly', '7 * * * *', $job$select public.trigger_collect()$job$);

-- 3. 점검용: 최근 요청 결과 (GitHub 이 204 또는 200 이면 정상 · 401/403 은 토큰 문제 · 404 는 저장소/권한 문제)
create or replace function public.collect_trigger_log(p_limit int default 10)
returns table (requested_at timestamptz, status_code int, error text)
language sql stable security definer set search_path = public as $$
  select r.created, r.status_code, coalesce(r.error_msg, left(r.content, 200))
  from net._http_response r
  where r.created > now() - interval '6 hours'
  order by r.created desc
  limit p_limit
$$;
revoke all on function public.collect_trigger_log(int) from anon, authenticated, public;

-- 확인 ① 예약이 등록됐는지 (collect-hourly · 7 * * * * 한 줄이면 정상)
select jobname, schedule, active from cron.job where jobname = 'collect-hourly';
-- 확인 ② 토큰이 저장됐는지 (true 면 정상 · 토큰 값은 보이지 않음)
select exists (select 1 from vault.secrets where name = 'github_collect_token') as token_saved;
