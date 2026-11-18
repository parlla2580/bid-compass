-- =========================================================
-- 027: 되돌려보기 — 개찰마다 '실제 하한선'으로 판정 (공사 A값 반영) + 사정률별 곡선
--
-- 문제 (2026-11-18 실측)
--   008은 공고 낙찰하한율만으로 하한선을 그어, 공사(A값이 더해져 실제 하한선이 더 높음)에서
--   실제로는 하한 미달인 금액을 '나보다 낮은 업체 없음 = 1순위'로 셌습니다.
--   공사 최근 1,000건에서 1순위 30%(참가 중앙값 108곳)로 부풀려짐.
--   같은 기간 공사 낙찰률은 공고 하한율보다 중앙값 0.535%p 높았음.
--
-- 바꾼 방식
--   · 하한 통과: 내가 고른 사정률로 계산한 예정가격(기초금액 × 사정률) ≥ 실제 예정가격
--       (하한선 = (예정가격 − A) × 하한율 + A 는 예정가격에 대해 늘어나기만 하므로 A값과 무관하게 정확)
--   · 내 투찰률 = 그 개찰의 실제 하한선 투찰률 + (기초금액 × 사정률 − 예정가격) ÷ 예정가격 × 하한율
--       (A값이 있어도 차이는 (x − P) × 하한율로 같음)
--   · 실제 하한선 투찰률
--       ① 공고 하한율이 있고, 물품·용역이거나 공사인데 A값(또는 A 미적용)을 알면 → 계산값
--       ② 아니면 투찰 기록으로 추정: 하한 미달 업체 최고 투찰률과 정상 업체 최저 투찰률의 중간
--          (미달 업체가 없으면 정상 업체 최저 투찰률 — 1순위를 적게 세는 쪽)
--   · 투찰 기록(정상 업체)이 없는 개찰은 뺌 — 비교할 상대가 없어 1순위로 잘못 세지 않게
--   · luck: 아무 데나 썼을 때 기대 1순위 수 = Σ 1 / (정상 업체 수 + 1)
--
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 개찰별 판정 재료 (내부용)
create or replace function public.bt_openings(p_type text, p_floor numeric, p_limit int)
returns table (p numeric, b numeric, f numeric, line numeric, r1 numeric, r3 numeric, nvalid int)
language sql stable security definer set search_path = public as $$
  with o as (
    select o.id, o.planned_price::numeric as p, o.base_amount::numeric as b, n.floor_rate as nf,
           case when n.a_apply is false then 0::numeric
                when n.a_apply and n.a_value > 0 then n.a_value::numeric end as na
    from openings o
    left join lateral (
      select n.floor_rate, n.a_apply, n.a_value from notices n
      where n.bid_no = o.bid_no and n.bid_ord = o.bid_ord and n.floor_rate between 50 and 100
      limit 1
    ) n on true
    where o.bid_type = p_type and o.details_fetched and o.planned_price > 0 and o.base_amount > 0
      and o.opened_at >= now() - interval '3 years'
      and o.planned_price::numeric / o.base_amount between 0.9 and 1.1
    order by o.opened_at desc
    limit least(greatest(p_limit, 1), 2000)
  ),
  x as (
    select o.*, s.bad, s.r1, s.r3, s.nvalid
    from o cross join lateral (
      select max(br.rate) filter (where br.note = 1) as bad,
             min(br.rate) filter (where br.note is null) as r1,
             (array_agg(br.rate order by br.rate) filter (where br.note is null))[3] as r3,
             (count(*) filter (where br.note is null))::int as nvalid
      from bid_results br where br.opening_id = o.id and br.rate > 0
    ) s
  )
  select x.p, x.b, coalesce(x.nf, p_floor) as f,
         case
           when x.nf is not null and (p_type <> '공사' or x.na is not null)
             then ((x.p - coalesce(x.na, 0)) * x.nf / 100 + coalesce(x.na, 0)) / x.p * 100
           when x.bad is not null and greatest(x.bad, coalesce(x.nf, 0)) < x.r1
             then (greatest(x.bad, coalesce(x.nf, 0)) + x.r1) / 2
           else x.r1
         end as line,
         x.r1, x.r3, x.nvalid
  from x
  where x.r1 is not null
$$;

revoke all on function public.bt_openings(text, numeric, int) from public, anon, authenticated;


-- 사정률 하나 — 계산기 화면 (기존 이름·인자 그대로, 결과에 luck 추가)
create or replace function public.bid_backtest(p_type text, p_sajeong numeric, p_floor numeric, p_limit int default 500)
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (
    select nvalid, r1, r3, b * p_sajeong / 100 >= p as ok,
           line + (b * p_sajeong / 100 - p) / p * f as my
    from bt_openings(p_type, p_floor, p_limit)
  )
  select jsonb_build_object(
    'n', count(*),
    'below', count(*) filter (where not ok),
    'first', count(*) filter (where ok and my <= r1),
    'top3', count(*) filter (where ok and (r3 is null or my <= r3)),
    'luck', round(coalesce(sum(1.0 / (nvalid + 1)), 0), 1)
  ) from t
$$;

revoke all on function public.bid_backtest(text, numeric, numeric, int) from public;
grant execute on function public.bid_backtest(text, numeric, numeric, int) to anon, authenticated;


-- 사정률별 곡선 — 한 번에 여러 사정률 (최대 81개 점)
create or replace function public.bid_backtest_curve(p_type text, p_floor numeric,
  p_from numeric default 98, p_to numeric default 102, p_step numeric default 0.25, p_limit int default 1000)
returns jsonb language sql stable security definer set search_path = public as $$
  with o as (select * from bt_openings(p_type, p_floor, p_limit)),
  s as (
    select round(v, 2) as s
    from generate_series(p_from, p_to, greatest(p_step, (p_to - p_from) / 80, 0.01)) v
  ),
  t as (
    select s.s, b * s.s / 100 >= p as ok, line + (b * s.s / 100 - p) / p * f as my, r1, r3
    from s cross join o
  ),
  pts as (
    select s,
           count(*) filter (where not ok) as below,
           count(*) filter (where ok and my <= r1) as first,
           count(*) filter (where ok and (r3 is null or my <= r3)) as top3
    from t group by s
  )
  select jsonb_build_object(
    'n', (select count(*) from o),
    'luck', (select round(coalesce(sum(1.0 / (nvalid + 1)), 0), 1) from o),
    'points', coalesce((select jsonb_agg(jsonb_build_object('s', s, 'first', first, 'top3', top3, 'below', below) order by s) from pts), '[]'::jsonb)
  )
$$;

revoke all on function public.bid_backtest_curve(text, numeric, numeric, numeric, numeric, int) from public;
grant execute on function public.bid_backtest_curve(text, numeric, numeric, numeric, numeric, int) to anon, authenticated;
