-- =========================================================
-- 042: [조회만] 수집 예약 점검 2 (2026-11-22)
--  · 041 결과: pg_cron 은 매시 07분 정상 실행(succeeded) → 그런데 GitHub 에 실행이 생기지 않음
--  · SQL 편집기는 마지막 결과 하나만 보여서, 토큰 저장 여부와 GitHub 응답을 표 하나로 합침
--  · 아무것도 바꾸지 않습니다. 여러 번 실행해도 됩니다.
-- 읽는 법
--  · token_saved = false            → Vault 에 github_collect_token 이 없음 (이름 오타 포함)
--  · token_saved = true, 나머지 빈칸 → 요청 기록 없음 (6시간 지난 기록은 지워짐)
--  · status_code 204                → 정상
--  · 401 토큰 틀림·만료 / 403 Actions 쓰기 권한 없음 / 404 토큰에 bid-compass 저장소가 빠짐 / 422 입력값
-- =========================================================

select (select exists (select 1 from vault.secrets where name = 'github_collect_token')) as token_saved,
       l.requested_at, l.status_code, l.error
from (select 1) x
left join public.collect_trigger_log(5) l on true;
