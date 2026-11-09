-- =========================================================
-- 007: 주요 품목 (맞춤 공고 고도화)
-- 회사의 주요 품목을 나라장터 세부품명번호(10자리)로 저장합니다.
-- 나라장터 공급물품이 등록된 업체는 자동으로 채우고, 없으면 사용자가 고릅니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 주요 품목 [{code: '4321150100', name: '컴퓨터서버', source: 'nara' | 'user'}] (null = 미입력)
alter table public.company_profiles add column if not exists products jsonb;

-- '관심 없음'으로 뺀 품목·키워드 (추천 순위를 낮추는 데 사용)
alter table public.company_profiles add column if not exists muted jsonb not null default '[]'::jsonb;

-- 확인
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'company_profiles' and column_name in ('products', 'muted');
