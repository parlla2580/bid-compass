-- =========================================================
-- 040: [조회만] DB 용량·표 크기 점검 (2026-11-22) — 과거 데이터 거슬러 받기 전에 여유 확인
--  · 아무것도 바꾸지 않는 조회 SQL입니다. 여러 번 실행해도 안전합니다.
--  · 결과 ①: DB 전체 크기 / 결과 ②: 큰 표 순서 (행 수는 통계 추정치)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run → 결과 표 두 개를 캡처해 주세요
-- =========================================================

-- ① DB 전체 크기
select pg_size_pretty(pg_database_size(current_database())) as db_size;

-- ② 표별 크기 (색인 포함) · 행 수 추정
select c.relname as table_name,
       pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
       to_char(greatest(c.reltuples, 0)::bigint, 'FM999,999,999') as rows_estimate
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by pg_total_relation_size(c.oid) desc
limit 12;
