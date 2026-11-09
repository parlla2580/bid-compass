-- =========================================================
-- 011: 입찰 이력 목록과 개찰 한 건의 요약 (회사 확인 회원 본인만)
--  · my_bid_list    — 우리 회사가 투찰·낙찰한 개찰 목록 (결과·순위·투찰률·낙찰자)
--  · my_opening_detail — 우리 회사가 참여한 개찰 1건: 기초금액·예정가격·사정률·낙찰자·낙찰금액,
--                        참가업체 전원의 투찰률 분포(업체명 포함 — 회사 확인 회원에게 공개, 2026-11-09 결정)
-- 우리 회사가 참여하지 않은 개찰은 돌려주지 않습니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.my_bid_list(p_years int default 3, p_limit int default 500)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select my_verified_bizno() as b),
  rows as (
    select o.id, o.title, coalesce(o.demand_org, o.org) as org, o.bid_type, o.opened_at, o.participants,
           r.rank, r.rate, r.amount, r.note, (o.winner_bizno = r.bizno) as won, o.winner_bizno
    from bid_results r join openings o on o.id = r.opening_id, me
    where r.bizno = me.b and o.opened_at >= now() - make_interval(years => p_years)
    union all
    select o.id, o.title, coalesce(o.demand_org, o.org), o.bid_type, o.opened_at, o.participants,
           null, o.winner_rate, o.winner_amount, null, true, o.winner_bizno
    from openings o, me
    where o.winner_bizno = me.b and o.opened_at >= now() - make_interval(years => p_years)
      and not exists (select 1 from bid_results x where x.opening_id = o.id and x.bizno = me.b)
  )
  select case when (select b from me) is null then jsonb_build_object('verified', false) else
    jsonb_build_object('verified', true, 'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'org', x.org, 'type', x.bid_type, 'opened_at', x.opened_at, 'participants', x.participants,
        'rank', x.rank, 'rate', x.rate, 'amount', x.amount, 'note', x.note, 'won', x.won,
        'winner', case when x.won then null else c.name end) order by x.opened_at desc)
      from (select * from rows order by opened_at desc limit p_limit) x left join bid_companies c on c.bizno = x.winner_bizno), '[]'::jsonb))
  end
$$;

create or replace function public.my_opening_detail(p_id int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  o openings%rowtype;
  floor_rate numeric;
begin
  if me is null then return jsonb_build_object('verified', false); end if;
  select * into o from openings where id = p_id;
  if not found then return jsonb_build_object('verified', true, 'found', false); end if;
  -- 우리 회사가 참여(투찰)했거나 낙찰한 개찰만
  if not exists (select 1 from bid_results where opening_id = p_id and bizno = me) and coalesce(o.winner_bizno, 0) <> me then
    return jsonb_build_object('verified', true, 'found', false);
  end if;

  select n.floor_rate into floor_rate from notices n
   where n.bid_no = o.bid_no and n.bid_ord = o.bid_ord and n.floor_rate between 50 and 100 limit 1;

  return jsonb_build_object(
    'verified', true, 'found', true,
    'opening', jsonb_build_object(
      'id', o.id, 'bid_no', o.bid_no, 'bid_ord', o.bid_ord, 'title', o.title, 'org', o.org, 'demand_org', o.demand_org,
      'type', o.bid_type, 'opened_at', o.opened_at, 'participants', o.participants,
      'base_amount', o.base_amount, 'planned_price', o.planned_price,
      'sajeong', case when o.base_amount > 0 and o.planned_price > 0 then round(o.planned_price::numeric / o.base_amount * 100, 3) end,
      'floor_rate', floor_rate,
      'winner', (select name from bid_companies where bizno = o.winner_bizno),
      'winner_is_me', o.winner_bizno = me,
      'winner_amount', o.winner_amount, 'winner_rate', o.winner_rate,
      'details_fetched', o.details_fetched),
    'bidders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', b.rank, 'rate', b.rate, 'amount', b.amount, 'note', b.note,
        'name', coalesce(c.name, '업체명 미상'), 'me', b.bizno = me, 'winner', b.bizno = o.winner_bizno) order by b.rank nulls last, b.rate)
      from bid_results b left join bid_companies c on c.bizno = b.bizno
      where b.opening_id = p_id), '[]'::jsonb)
  );
end $$;

revoke all on function public.my_bid_list(int, int) from anon, public;
revoke all on function public.my_opening_detail(int) from anon, public;
grant execute on function public.my_bid_list(int, int) to authenticated;
grant execute on function public.my_opening_detail(int) to authenticated;
