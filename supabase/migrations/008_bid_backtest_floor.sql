-- =========================================================
-- 008: 되돌려보기 보정 — 개찰마다 그 공고의 낙찰하한율을 적용
-- 006은 사용자가 입력한 하한율 하나로 모든 과거 개찰을 계산해, 하한율이 다른 공고(예: 80.495%)에서
-- 1순위가 지나치게 많이 나왔습니다. 이제 개찰마다
--   ① 수집된 공고의 낙찰하한율, 없으면 ② 그 개찰의 투찰 기록으로 추정한 하한
--      (하한 미달 업체 최고 투찰률과 유효 업체 최저 투찰률의 중간)
-- 을 그 개찰의 하한으로 씁니다. 사용자의 선택은 '사정률'만 반영합니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.bid_backtest(p_type text, p_sajeong numeric, p_floor numeric, p_limit int default 500)
returns jsonb language sql stable security definer set search_path = public as $$
  with o as (
    select o.id, o.planned_price, o.base_amount,
           coalesce(
             (select n.floor_rate from notices n
               where n.bid_no = o.bid_no and n.bid_ord = o.bid_ord and n.floor_rate between 50 and 100 limit 1),
             -- 공고 하한율이 없으면: 하한 미달 업체 최고 투찰률과 유효 업체 최저 투찰률의 중간, 미달 업체가 없으면 유효 최저 - 0.01
             (select case when max(b.rate) filter (where b.note = 1) is not null
                          then (max(b.rate) filter (where b.note = 1) + min(b.rate) filter (where b.note is null)) / 2
                          else min(b.rate) filter (where b.note is null) - 0.01 end
                from bid_results b where b.opening_id = o.id and b.rate > 0)
           ) as floor_o
    from openings o
    where o.bid_type = p_type and o.details_fetched and o.planned_price > 0 and o.base_amount > 0
      and o.opened_at >= now() - interval '3 years'
      and o.planned_price::numeric / o.base_amount between 0.9 and 1.1
    order by o.opened_at desc
    limit least(greatest(p_limit, 1), 2000)
  ),
  m as (
    -- 그 개찰의 기초금액 × 내 사정률 × 그 공고 하한율 = 내 투찰금액 → 실제 예정가격 대비 투찰률
    select id, floor_o, (base_amount * p_sajeong / 100 * floor_o / 100) / planned_price * 100 as my_rate
    from o where floor_o is not null
  ),
  r as (
    select m.my_rate, m.floor_o,
           (select count(*) from bid_results b
             where b.opening_id = m.id and b.note is null and b.rate >= m.floor_o and b.rate < m.my_rate) as better
    from m
  )
  select jsonb_build_object(
    'n', count(*),
    'below', count(*) filter (where my_rate < floor_o - 0.0005),
    'first', count(*) filter (where my_rate >= floor_o - 0.0005 and better = 0),
    'top3', count(*) filter (where my_rate >= floor_o - 0.0005 and better < 3)
  ) from r
$$;

revoke all on function public.bid_backtest(text, numeric, numeric, int) from public;
grant execute on function public.bid_backtest(text, numeric, numeric, int) to anon, authenticated;
