-- =========================================================
-- 014: 공고 목록 속도 개선
--  · 공고 원본(raw JSON)에서 매번 꺼내던 7개 항목을 저장 시 미리 계산해 두는 열로 (자동 계산 열)
--    → 마감 전 공고 1천 건당 DB 처리 약 1.1초 절약 (2026-11-12 실측)
--  · 마감 전 공고 조회용 색인 (source='api' 이고 마감일 순)
--  · open_notices() — 마감 전 공고 전체를 한 번에 돌려주는 함수
--    (1천 건씩 12번 나눠 받으면 뒤쪽 페이지가 앞부분을 건너뛰느라 느려져 3초 시간 제한에 걸리던 문제 해결)
-- 수집기는 이 열들을 직접 쓰지 않으므로 수정 없이 그대로 동작합니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- (처음 실행 때 공고 표 전체를 한 번 다시 쓰므로 수십 초 걸릴 수 있어요)
-- =========================================================

alter table public.notices add column if not exists p_code  text generated always as (raw->>'dtilPrdctClsfcNo') stored;
alter table public.notices add column if not exists p_list  text generated always as (raw->>'purchsObjPrdctList') stored;
alter table public.notices add column if not exists s_code  text generated always as (raw->>'pubPrcrmntClsfcNo') stored;
alter table public.notices add column if not exists s_name  text generated always as (raw->>'pubPrcrmntClsfcNm') stored;
alter table public.notices add column if not exists kind    text generated always as (raw->>'ntceKindNm') stored;
alter table public.notices add column if not exists prearng text generated always as (raw->>'prearngPrceDcsnMthdNm') stored;
alter table public.notices add column if not exists ind_lmt text generated always as (raw->>'indstrytyLmtYn') stored;

-- 마감 전 공고: where source = 'api' and closes_at >= now() order by closes_at
create index if not exists notices_open_idx on public.notices (closes_at) where source = 'api';

analyze public.notices;

-- 마감 전 공고 전체 (화면의 NOTICE_COLUMNS_FAST 와 같은 열). 누구나 읽는 공개 공고라 호출자 권한으로 실행
create or replace function public.open_notices()
returns json language sql stable set statement_timeout = '20s' as $$
  select coalesce(json_agg(t), '[]'::json) from (
    select id, bid_no, bid_ord, bid_type, title, org, demand_org, contract, award, est_price, base_price,
           reserve_rate_min, reserve_rate_max, floor_rate, closes_at, region_limit, region_basis, license_limits,
           product_name, url, posted_at, p_code, p_list, s_code, s_name, kind, prearng, ind_lmt
    from public.notices
    where source = 'api' and closes_at >= now()
    order by closes_at, id
  ) t;
$$;
grant execute on function public.open_notices() to anon, authenticated;

-- 확인: 7개 열이 채워졌는지
select count(*) as notices, count(p_list) as with_products, count(kind) as with_kind from public.notices;
