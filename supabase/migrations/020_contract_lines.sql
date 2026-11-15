-- =========================================================
-- 020: 계약 세부 (영업 기회 A — 공고 없이 사는 기관)
--  · contract_lines — 계약 1건의 세부 줄
--      물품: 물품분류번호(10자리)·품명·수량·단가·원산지  (getCntrctInfoListThngDetail)
--    → 계약명 낱말 대신 품목 코드로 '우리 품목을 산 기관'을 정확히 찾고, 물품 단가로 '공공 단가 기준값'을 만듦
--    (공사·용역 세부 API는 계약마다 1번씩 호출해야 해 하루 한도로는 불가 → 대신 아래 3번 열로)
--  · contracts 에 그동안 버리던 항목 추가: 공공조달분류(모든 유형 — 공고와 같은 분류 체계), 담당부서, 수요기관,
--    계약 끝나는 날(총완수·총준공일자 → 재발주 시기 예상), 공동계약 여부
--    (담당자 이름·전화번호는 개인정보라 저장하지 않음)
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

-- 3. 계약 목록에서 추가로 저장할 항목
alter table public.contracts add column if not exists class_code text;   -- 공공조달분류번호
alter table public.contracts add column if not exists class_name text;   -- 공공조달분류명
alter table public.contracts add column if not exists class_mid  text;   -- 공공조달중분류명
alter table public.contracts add column if not exists dept       text;   -- 계약기관 담당부서명
alter table public.contracts add column if not exists demand_orgs text;  -- 수요기관 목록(원문)
alter table public.contracts add column if not exists end_date   date;   -- 총완수·총준공일자
alter table public.contracts add column if not exists period_text text;  -- 계약기간(원문)
alter table public.contracts add column if not exists joint      boolean; -- 공동계약 여부
create index if not exists contracts_class_idx on public.contracts (class_code);
create index if not exists contracts_end_idx   on public.contracts (end_date);

-- 2. 이미 저장된 계약의 대표자명 제거
update public.contracts
set corps = (select coalesce(jsonb_agg(c - 'ceo'), '[]'::jsonb) from jsonb_array_elements(corps) c)
where corps is not null and jsonb_typeof(corps) = 'array' and corps::text like '%"ceo"%';

-- 확인: 세부 줄 수(처음엔 0) · 대표자명이 남은 계약 수(0이어야 정상)
select (select count(*) from public.contract_lines) as lines,
       (select count(*) from public.contracts where corps::text like '%"ceo"%') as ceo_left;
