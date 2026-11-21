-- =========================================================
-- 031: 공공 계약 단가 — 물품 공고의 품목을 실제로 기관들이 얼마에 샀나 (2026-11-21)
--  · 근거: contract_lines(물품 계약 세부, 020) — 물품분류번호(8자리)·수량·단가
--    공고의 세부품명번호(10자리) 앞 8자리 = 계약 물품분류번호 (실측: 데스크톱컴퓨터 4321150701 ↔ 43211507)
--  · 정확도 원칙 (실측으로 정함)
--    ① 수량 2 이상인 계약 줄만 — 수량 1은 묶음 총액이 단가 칸에 들어간 경우가 많음(배추김치 '단가' 551만 원 등)
--    ② 최근 12개월, 단가 > 0
--    ③ 보통 범위 = 25~75% 구간, 가운데 = 중앙값 (평균은 큰 묶음에 끌려감)
--    ④ 흩어짐(75% ÷ 25%)이 3배를 넘으면 spread_ok = false → 화면은 숫자 대신 최근 계약 실례만
--       (김치·반창고처럼 kg·박스·낱개 단위가 섞인 품목: 4.7~10배)
--  · 최근 계약 5건: 날짜·기관·규격(한글품목명)·수량·단가·납품업체 (모두 공개 계약 정보)
--  · item_prices(p_codes) — 공고 품목번호(8자리 이상) 최대 5개
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.item_prices(p_codes text[])
returns jsonb language sql stable security definer set search_path = public
set statement_timeout = '8s' as $$
  with codes as (
    select distinct left(c, 8) as code from unnest(p_codes[1:5]) c where c ~ '^\d{8}'
  ),
  lines as (
    select cd.code, l.contract_id, l.unit_price, l.qty, l.item_name, l.name,
           coalesce(l.contract_date, k.contract_date) as d, k.org, k.corps
    from codes cd
    join contract_lines l on l.code = cd.code and l.kind = '물품'
    left join contracts k on k.id = l.contract_id
    where l.unit_price > 0 and l.qty >= 2
      and coalesce(l.contract_date, k.contract_date) >= (now() - interval '12 months')::date
  ),
  agg as (
    select code,
           count(*) as n,
           percentile_cont(0.25) within group (order by unit_price) as p25,
           percentile_cont(0.5)  within group (order by unit_price) as p50,
           percentile_cont(0.75) within group (order by unit_price) as p75,
           min(d) as d_from, max(d) as d_to,
           mode() within group (order by name) as name
    from lines group by code
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'code', a.code, 'name', a.name, 'n', a.n,
    'p25', round(a.p25), 'p50', round(a.p50), 'p75', round(a.p75),
    'from', a.d_from, 'to', a.d_to,
    'spread_ok', a.p25 > 0 and a.p75 / a.p25 <= 3,
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('date', r.d, 'org', r.org, 'spec', coalesce(nullif(r.item_name, ''), r.name),
               'qty', r.qty, 'unit_price', round(r.unit_price), 'corp', r.corps -> 0 ->> 'name') order by r.d desc)
      from (select * from lines x where x.code = a.code order by x.d desc nulls last limit 5) r), '[]'::jsonb)
  ) order by a.n desc), '[]'::jsonb)
  from agg a
$$;

-- 계약 세부·계약 목록은 원래 누구나 읽을 수 있는 공개 정보 (020)
grant execute on function public.item_prices(text[]) to anon, authenticated;

-- 확인: 데스크톱컴퓨터 (n이 수백 건, spread_ok = true 정도면 정상)
select jsonb_pretty(public.item_prices(array['4321150701']));
