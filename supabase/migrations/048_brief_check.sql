-- =========================================================
-- 048: [점검 + 정리] 브리핑 예약 확인 (2026-11-23)
--  · 047 실행 뒤에도 브리핑 기간이 예전 방식으로 나옴 → 함수가 바뀌었는지, 일회용 예약(brief-snapshot-now)이 남아 매분 도는지 확인
--  · 일회용 예약이 남아 있으면 지움 (매분 큰 표를 세면 DB 부담). 그 밖에는 아무것도 바꾸지 않음
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 결과 표 하나를 캡처해 주세요. 여러 번 실행해도 됩니다.
-- =========================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'brief-snapshot-now') then
    perform cron.unschedule('brief-snapshot-now');
  end if;
end $$;

-- 결과 한 표: 함수가 047 버전인지(new_function) · 남은 예약 · 최근 집계 실행 기록
select
  (select position('odd' in prosrc) > 0 from pg_proc where proname = 'ops_daily_brief' limit 1) as new_function,
  (select string_agg(jobname || ' ' || schedule, ' / ' order by jobname) from cron.job where jobname like 'brief%') as jobs,
  (select string_agg(to_char(d.start_time at time zone 'Asia/Seoul', 'HH24:MI') || ' ' || d.status || coalesce(' ' || left(d.return_message, 80), ''), ' / ' order by d.start_time desc)
     from (select * from cron.job_run_details where command like '%ops_daily_brief%' order by start_time desc limit 6) d) as recent_runs;
