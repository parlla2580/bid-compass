-- =========================================================
-- 046: 일일 브리핑 집계를 DB 예약 작업으로 (2026-11-23)
--  · 045 의 ops_daily_brief() 를 API(관리자 키)로 부르면 큰 표 건수 세기가 API 시간 제한(수 초)에 걸림
--    → pg_cron 이 매일 08:50(한국시간)에 집계해 ops_brief_log 에 저장, 09:00 브리핑은 저장된 결과만 읽음
--  · 지금 한 번: 1분 안에 집계가 돌고 스스로 예약을 지움 (brief-snapshot-now)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 저장된 최신 결과 + 전날 결과 (빠름 — 표 하나만 읽음)
create or replace function public.ops_brief_latest()
returns jsonb language sql stable security definer set search_path = public as $$
  select l.data || jsonb_build_object('snapshot_at', l.at,
           'prev', (select p.data from public.ops_brief_log p where p.day < l.day order by p.day desc limit 1))
  from public.ops_brief_log l order by l.day desc limit 1
$$;
revoke all on function public.ops_brief_latest() from anon, authenticated, public;
grant execute on function public.ops_brief_latest() to service_role;

-- 2. 매일 23:50 UTC = 08:50 한국시간 집계 (09:00 브리핑 전)
select cron.schedule('brief-snapshot', '50 23 * * *', $job$select public.ops_daily_brief()$job$);

-- 3. 지금 한 번 집계 (다음 1분 안에 실행 후 스스로 지움)
select cron.schedule('brief-snapshot-now', '* * * * *',
  $job$select public.ops_daily_brief(); select cron.unschedule('brief-snapshot-now');$job$);

-- 확인: brief-snapshot(50 23 * * *) · brief-snapshot-now 두 줄 (now 는 1~2분 뒤 사라짐)
select jobname, schedule, active from cron.job where jobname like 'brief-snapshot%' order by jobname;
