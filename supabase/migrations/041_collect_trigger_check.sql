-- =========================================================
-- 041: [조회만] 수집 예약(039) 점검 (2026-11-22)
--  · 18:07 UTC(03:07 한국시간) 예약이 GitHub 수집을 실행시키지 못해 원인 확인용. 아무것도 바꾸지 않습니다.
--  · 결과 ① 토큰 저장 여부  ② 예약 등록  ③ 예약 실행 기록  ④ GitHub 응답 — 네 표를 캡처해 주세요
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- ① 토큰이 Vault 에 있는지 (true 여야 함 · 값은 보이지 않음)
select exists (select 1 from vault.secrets where name = 'github_collect_token') as token_saved;

-- ② 예약 등록 (collect-hourly · 7 * * * * · active = true 여야 함)
select jobid, jobname, schedule, active from cron.job where jobname = 'collect-hourly';

-- ③ 최근 예약 실행 기록 (status 가 succeeded 여야 함 · failed 면 return_message 에 이유)
select d.start_time, d.status, left(d.return_message, 200) as return_message
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where j.jobname = 'collect-hourly'
order by d.start_time desc limit 5;

-- ④ GitHub 응답 (204 또는 200 정상 · 401/403 토큰 · 404 권한·저장소 · 422 입력값)
select * from public.collect_trigger_log(5);
