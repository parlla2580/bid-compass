-- =========================================================
-- 051: 개찰 결과 해설 알림 (2026-11-24, 오픈 전 아하 포인트 ③)
--  · 알림함 '개찰 결과 · 3위' 를 한 줄 해설로: 1순위와 차이 · 사정률 · 하한선까지 차이
--  · 최근 N일(기본 14일) 우리 투찰만 — 가벼운 조회 (회사 확인 회원 본인 것만)
--  · 사정률 = 예정가격 ÷ 기초금액 · 1순위 투찰률 = 그 개찰 1순위 투찰률 · 하한율 = 공고의 낙찰하한율
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.my_result_notes(p_days int default 14)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select my_verified_bizno() as b)
  select case when (select b from me) is null then jsonb_build_object('verified', false) else
    jsonb_build_object('verified', true, 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'rank', r.rank,
        'rate', r.rate,
        'note', r.note,
        'first_rate', (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1),
        'sajeong', case when o.base_amount > 0 and o.planned_price > 0 then round(o.planned_price::numeric * 100 / o.base_amount, 3) end,
        'floor_rate', (select n.floor_rate from notices n
                       where n.bid_no = o.bid_no and n.bid_ord = o.bid_ord and n.floor_rate between 50 and 100 limit 1)))
      from bid_results r join openings o on o.id = r.opening_id, me
      where r.bizno = me.b and o.opened_at >= now() - make_interval(days => least(greatest(p_days, 1), 60))), '[]'::jsonb))
  end
$$;
revoke all on function public.my_result_notes(int) from anon, public;
grant execute on function public.my_result_notes(int) to authenticated;

-- 확인: 함수 한 줄
select p.oid::regprocedure as fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'my_result_notes';
