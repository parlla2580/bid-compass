-- =========================================================
-- 006: 투찰금액 계산기 「이 금액으로 썼다면?」 되돌려보기
-- 지난 개찰에 '기초금액 × 사정률 × 낙찰하한율'로 투찰했다면 몇 위였을지 집계합니다.
-- 개별 업체 정보는 돌려주지 않고 건수만 돌려줍니다 (투찰 기록 직접 읽기 금지 원칙 유지).
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.bid_backtest(p_type text, p_sajeong numeric, p_floor numeric, p_limit int default 500)
returns jsonb language sql stable security definer set search_path = public as $$
  with o as (
    -- 투찰 순위를 받아 둔 최근 개찰 (예정가격·기초금액이 있는 것)
    select id, planned_price, base_amount
    from openings
    where bid_type = p_type and details_fetched and planned_price > 0 and base_amount > 0
      and opened_at >= now() - interval '3 years'
      and planned_price::numeric / base_amount between 0.9 and 1.1
    order by opened_at desc
    limit least(greatest(p_limit, 1), 2000)
  ),
  m as (
    -- 내 투찰률 = 내 투찰금액 ÷ 실제 예정가격 × 100
    select id, (base_amount * p_sajeong / 100 * p_floor / 100) / planned_price * 100 as my_rate from o
  ),
  r as (
    -- 나보다 낮게(하한 이상으로) 쓴 업체 수 → 0이면 1순위
    select m.my_rate,
           (select count(*) from bid_results b
             where b.opening_id = m.id and b.note is null and b.rate >= p_floor and b.rate < m.my_rate) as better
    from m
  )
  select jsonb_build_object(
    'n', count(*),
    'below', count(*) filter (where my_rate < p_floor),
    'first', count(*) filter (where my_rate >= p_floor and better = 0),
    'top3', count(*) filter (where my_rate >= p_floor and better < 3)
  ) from r
$$;

revoke all on function public.bid_backtest(text, numeric, numeric, int) from public;
grant execute on function public.bid_backtest(text, numeric, numeric, int) to anon, authenticated;
