-- =========================================================
-- 003: 실제 공고로 전환 (기획서 v2.1)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run
-- 001(schema.sql), 002(002_collect.sql) 다음에 실행합니다. 여러 번 실행해도 됩니다.
-- =========================================================


-- 1. 목데이터 삭제 (API 원본이 없는 공고). 이 공고를 저장한 기록도 함께 지워짐
delete from public.notices where source = 'sample' or raw is null;


-- 2. 기업 프로필: 사업자번호 분기, 나라장터 업종, 시군구 소재지
alter table public.company_profiles add column if not exists bizno           text;     -- 사업자등록번호 (선택)
alter table public.company_profiles add column if not exists nara_registered boolean;  -- 나라장터 등록 업체 여부
alter table public.company_profiles add column if not exists corp_name       text;     -- 업체명 (나라장터 조회 시)
alter table public.company_profiles add column if not exists industries      jsonb;    -- 나라장터 업종 [{code, name}] (null = 미입력)
-- location 컬럼은 '경기도 용인시'처럼 시도(+시군구) 전체 이름으로 저장


-- 3. industries — 나라장터 업종 목록 (업종 및 근거법규서비스, 수집 배치가 채움)
create table if not exists public.industries (
  code         text primary key,       -- 업종코드
  name         text not null,          -- 업종명
  category     text,                   -- 업종분류명
  in_use       boolean,                -- 업종사용여부
  base_law     text,                   -- 근거법령명
  updated_at   timestamptz not null default now()
);

create index if not exists industries_name_idx on public.industries (name);

alter table public.industries enable row level security;
drop policy if exists "업종은 누구나 읽기" on public.industries;
create policy "업종은 누구나 읽기" on public.industries
  for select to anon, authenticated using (true);
grant select on public.industries to anon, authenticated;
