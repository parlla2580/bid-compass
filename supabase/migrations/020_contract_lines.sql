-- =========================================================
-- 020: 계약 세부 (영업 기회 A — 공고 없이 사는 기관)
--  · contract_lines — 계약 1건의 세부 줄
--      물품: 물품분류번호(10자리)·품명·수량·단가·원산지  (getCntrctInfoListThngDetail)
--      공사: 업종명·공사현장 지역·관련 업체·공사금액     (getCntrctInfoListCnstwkServcInfo)
--      용역: 품명및규격·현장 지역·관련 업체·용역금액      (getCntrctInfoListGnrlServcServcInfo)
--    → 계약명 낱말 대신 품목 코드·업종·지역으로 '우리 품목을 산 기관'을 정확히 찾고,
--      물품 단가로 '공공 단가 기준값'을 만듦
--  · contracts.corps 에 저장돼 있던 대표자명(ceo) 제거 — 화면에 쓰지 않는 개인정보 (최소 수집)
-- 공개 조달 데이터라 누구나 읽기, 쓰기는 수집기(관리자 키)만
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- (2번 대표자명 정리는 계약 약 11만 건을 한 번 고쳐 써서 수십 초 걸릴 수 있어요)
-- =========================================================

-- 1. 계약 세부 줄
create table if not exists public.contract_lines (
  contract_id   text not null,              -- 통합계약번호 (contracts.id)
  kind          text not null,              -- 물품 / 공사 / 용역
  seq           text not null,              -- 계약 안에서 줄을 구분하는 값
  code          text,                       -- 물품분류번호(10자리)
  name          text,                       -- 품명 / 품명및규격
  item_name     text,                       -- 한글품목명(물품)
  industry      text,                       -- 업종명(공사)
  site_region   text,                       -- 공사현장 지역
  corp_name     text,                       -- 관련 업체(공사·용역)
  is_rep        boolean,                    -- 대표 여부(공사·용역)
  unit_price    numeric,                    -- 수량단가(물품)
  qty           numeric,                    -- 수량(물품)
  amount        numeric,                    -- 물품금액 / 공사금액 / 용역금액
  origin        text,                       -- 원산지(물품)
  contract_date date,
  collected_at  timestamptz not null default now(),
  primary key (contract_id, kind, seq)
);
create index if not exists contract_lines_code_idx     on public.contract_lines (code);
create index if not exists contract_lines_code6_idx    on public.contract_lines (left(code, 6));
create index if not exists contract_lines_industry_idx on public.contract_lines (industry);
create index if not exists contract_lines_date_idx     on public.contract_lines (contract_date desc);

alter table public.contract_lines enable row level security;
drop policy if exists "계약 세부는 누구나 읽기" on public.contract_lines;
create policy "계약 세부는 누구나 읽기" on public.contract_lines for select to anon, authenticated using (true);
grant select on public.contract_lines to anon, authenticated;

-- 2. 이미 저장된 계약의 대표자명 제거
update public.contracts
set corps = (select coalesce(jsonb_agg(c - 'ceo'), '[]'::jsonb) from jsonb_array_elements(corps) c)
where corps is not null and jsonb_typeof(corps) = 'array' and corps::text like '%"ceo"%';

-- 확인: 세부 줄 수(처음엔 0) · 대표자명이 남은 계약 수(0이어야 정상)
select (select count(*) from public.contract_lines) as lines,
       (select count(*) from public.contracts where corps::text like '%"ceo"%') as ceo_left;
