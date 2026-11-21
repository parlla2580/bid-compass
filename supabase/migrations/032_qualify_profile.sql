-- =========================================================
-- 032: 적격심사 점수 프로필 — 공사 공고마다 '우리 회사 통과선' 자동 계산 (로드맵 2, 2026-11-21)
--  · company_profiles.qualify (jsonb): { credit: 신용평가등급 묶음(0~3), otherRatio: 그 밖의 점수(시공경험 등) 만점 대비 비율 0~1,
--      adj: 가점·감점, savedAt }
--  · 회원이 계산기에서 [우리 회사 점수로 저장]을 눌렀을 때만 저장 (본인 행만 읽고 쓰기 — 기존 정책 그대로)
--  · 신용평가등급은 특정 평가사와 무관한 등급 묶음(회사채·기업어음·기업신용평가등급)으로만 저장
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

alter table public.company_profiles add column if not exists qualify jsonb;

-- 확인: 열이 보이면 정상
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'company_profiles' and column_name = 'qualify';
