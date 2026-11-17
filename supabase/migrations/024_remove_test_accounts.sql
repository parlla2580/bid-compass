-- =========================================================
-- 024: 사용성 테스트 계정 정리 (2026-11-16~17 페르소나 테스트)
--  · 테스트용 계정은 모두 'bc-ut-…@example.com' (실제 사람에게 메일이 가지 않는 예약 도메인)
--  · 계정을 지우면 회사 정보·회사 확인 기록·저장 공고·알림함·저장 기관이 함께 지워짐 (on delete cascade)
--  · 테스트가 끝난 뒤 한 번만 실행. 여러 번 실행해도 됩니다 (지울 계정이 없으면 0)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run.
-- =========================================================

-- 1. 지우기 전에 확인 (몇 개인지)
select count(*) as test_accounts from auth.users where email like 'bc-ut-%@example.com';

-- 2. 지우기
delete from auth.users where email like 'bc-ut-%@example.com';

-- 3. 확인 (0이어야 정상)
select count(*) as left_accounts from auth.users where email like 'bc-ut-%@example.com';
