-- =========================================================
-- 009: 입찰 분석에 '투찰 순위를 아직 못 받은 낙찰 건'도 포함
-- 투찰 순위(bid_results)는 개발계정 호출 한도 때문에 개찰의 일부만 받고 있어(2026-11-09 기준 11,760건 중 660건),
-- 낙찰했는데도 성적표가 비어 보이는 문제가 있었습니다.
-- 최종낙찰자(openings.winner_bizno)가 우리 회사인 개찰은 투찰 순위가 없어도 '투찰 1건·낙찰 1건'으로 셉니다.
-- (이 경우 순위는 비워 두고, 투찰률은 최종낙찰률을 씁니다)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.my_bid_report(p_years int default 3)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  since timestamptz := now() - make_interval(years => p_years);
  result jsonb;
begin
  if me is null then
    return jsonb_build_object('verified', false);
  end if;

  with mine as (
    -- ① 투찰 순위가 있는 개찰
    select o.id, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           r.rank, r.amount, r.rate, r.note,
           (o.winner_bizno = me) as won,
           (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1) as first_rate
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
    union all
    -- ② 투찰 순위는 없지만 최종낙찰자가 우리 회사인 개찰
    select o.id, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           null::smallint, o.winner_amount, o.winner_rate, null::smallint,
           true, null::numeric
    from openings o
    where o.winner_bizno = me and o.opened_at >= since
      and not exists (select 1 from bid_results x where x.opening_id = o.id and x.bizno = me)
  )
  select jsonb_build_object(
    'verified', true,
    'years', p_years,
    'total', count(*),
    'won', count(*) filter (where won),
    'below_floor', count(*) filter (where note = 1),
    'avg_rate', round(avg(rate) filter (where note is null), 3),
    'avg_participants', round(avg(participants)),
    'near_misses', coalesce((
      select jsonb_agg(m order by m->>'gap')
      from (
        select jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rank', rank,
                 'rate', rate, 'first_rate', first_rate, 'gap', round(abs(rate - first_rate), 3), 'participants', participants) m
        from mine
        where not won and note is null and rank between 2 and 5 and first_rate is not null
        order by abs(rate - first_rate)
        limit 10
      ) t), '[]'::jsonb),
    'below_floor_list', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rate', rate))
      from (select * from mine where note = 1 order by opened_at desc limit 10) t), '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_object_agg(bid_type, jsonb_build_object('total', n, 'won', w))
      from (select bid_type, count(*) n, count(*) filter (where won) w from mine group by bid_type) t), '{}'::jsonb),
    'top_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('org', org, 'total', n, 'won', w) order by n desc)
      from (select coalesce(demand_org, org) org, count(*) n, count(*) filter (where won) w
            from mine group by 1 order by 2 desc limit 5) t), '[]'::jsonb),
    -- 투찰 순위를 받은 건수 (나머지는 낙찰 결과만 있음)
    'detailed', count(*) filter (where rank is not null or note is not null)
  ) into result
  from mine;

  return result;
end $$;

create or replace function public.my_bid_history(p_years int default 3, p_limit int default 300)
returns table (title text, org text, demand_org text, bid_type text, opened_at timestamptz, amount bigint, won boolean, rank smallint)
language sql stable security definer set search_path = public as $$
  select * from (
    select o.title, o.org, o.demand_org, o.bid_type, o.opened_at, r.amount, o.winner_bizno = r.bizno, r.rank
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = my_verified_bizno() and o.opened_at >= now() - make_interval(years => p_years)
    union all
    select o.title, o.org, o.demand_org, o.bid_type, o.opened_at, o.winner_amount, true, null::smallint
    from openings o
    where o.winner_bizno = my_verified_bizno() and o.opened_at >= now() - make_interval(years => p_years)
      and not exists (select 1 from bid_results x where x.opening_id = o.id and x.bizno = o.winner_bizno)
  ) t
  order by opened_at desc
  limit p_limit
$$;

revoke all on function public.my_bid_report(int) from anon, public;
revoke all on function public.my_bid_history(int, int) from anon, public;
grant execute on function public.my_bid_report(int) to authenticated;
grant execute on function public.my_bid_history(int, int) to authenticated;
