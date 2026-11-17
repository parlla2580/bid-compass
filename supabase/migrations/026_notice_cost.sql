-- =========================================================
-- 026: 투찰금액 계산 정확도 — 공사 A값·순공사비·기초금액 공개일 (2026-11-17)
--  · 기초금액 API(이미 매시간 받는 것)에 들어 있던 값을 버리지 않고 저장 (API 호출 늘지 않음)
--    a_value     A값 합계 (국민연금·건강보험·퇴직공제부금·노인장기요양·산업안전보건관리비·안전관리비·품질관리비)
--    a_apply     입찰가격산식 A 적용 여부 (bidPrceCalclAYn)
--    a_parts     A값 항목별 금액 (화면에서 대조용)
--    net_cost    기초금액 순공사비 (bssAmtPurcnstcst)
--    base_open_at 기초금액 공개일시 — 저장 공고 '기초금액이 나왔어요' 알림
--  · A값 대상 공고의 투찰 하한 = (예정가격 − A) × 낙찰하한율 + A
--  · open_notices() 에 a_value·a_apply·net_cost·base_open_at 추가 (공고 목록 스냅샷)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- 실행 뒤 이미 올라온 공고는 비어 있음 → 수집을 기간 지정으로 한 번 다시 돌리면 채워짐
-- =========================================================

alter table public.notices add column if not exists a_value bigint;
alter table public.notices add column if not exists a_apply boolean;
alter table public.notices add column if not exists a_parts jsonb;
alter table public.notices add column if not exists net_cost bigint;
alter table public.notices add column if not exists base_open_at timestamptz;

create or replace function public.open_notices()
returns json language sql stable set statement_timeout = '20s' as $$
  select coalesce(json_agg(t), '[]'::json) from (
    select id, bid_no, bid_ord, bid_type, title, org, demand_org, contract, award, est_price, base_price,
           reserve_rate_min, reserve_rate_max, floor_rate, closes_at, region_limit, region_basis, license_limits,
           product_name, url, posted_at, p_code, p_list, s_code, s_name, kind, prearng, ind_lmt,
           a_value, a_apply, net_cost, base_open_at
    from public.notices
    where source = 'api' and closes_at >= now()
    order by closes_at, id
  ) t;
$$;
grant execute on function public.open_notices() to anon, authenticated;

-- 확인: 열 5개가 보이면 정상 (값은 다음 수집부터 채워짐)
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'notices' and column_name in ('a_value', 'a_apply', 'a_parts', 'net_cost', 'base_open_at')
order by column_name;
