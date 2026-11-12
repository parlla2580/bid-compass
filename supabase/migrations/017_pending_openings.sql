-- =========================================================
-- 017: 낙찰자 결정 전 개찰을 '탈락'으로 세지 않기
--  · 적격심사·PQ 등으로 최종낙찰자가 아직 정해지지 않은 개찰은 1순위여도 '탈락'으로 분류되고,
--    낙찰률·유형·기관별 성적·아깝게 놓친 공고에서 진 입찰로 세어졌다.
--  · my_bid_list: 'decided'(최종낙찰자 결정 여부) 추가 → 화면에 '결정 전' 묶음
--  · my_bid_report: 결과가 난 입찰(낙찰자 결정 또는 하한 미달)만 낙찰률·유형·기관별·놓친 공고에 사용, 'pending' 건수 추가
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
        'winner', case when x.won then null else c.name end,
        -- 최종낙찰자가 정해졌는지 (적격심사·PQ 중이면 1순위여도 아직 결정 전)
        'decided', x.winner_bizno is not null) order by x.opened_at desc)
      from (select * from rows order by opened_at desc limit p_limit) x left join bid_companies c on c.bizno = x.winner_bizno), '[]'::jsonb))
  end
$$;

revoke all on function public.my_bid_list(int, int) from anon, public;
grant execute on function public.my_bid_list(int, int) to authenticated;

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
           (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1) as first_rate,
           -- 결과가 난 입찰: 최종낙찰자가 정해졌거나 하한 미달(낙찰 불가)
           (o.winner_bizno is not null or r.note = 1) as settled
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
    union all
    -- ② 투찰 순위는 없지만 최종낙찰자가 우리 회사인 개찰
    select o.id, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           null::smallint, o.winner_amount, o.winner_rate, null::smallint,
           true, null::numeric, true
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
    -- 낙찰자 결정 전(적격심사·PQ 중 등) — 낙찰률 계산에서 뺌
    'pending', count(*) filter (where not settled),
    'avg_rate', round(avg(rate) filter (where note is null), 3),
    'avg_participants', round(avg(participants)),
    'near_misses', coalesce((
      select jsonb_agg(m order by m->>'gap')
      from (
        select jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rank', rank,
                 'rate', rate, 'first_rate', first_rate, 'gap', round(abs(rate - first_rate), 3), 'participants', participants) m
        from mine
        where settled and not won and note is null and rank between 2 and 5 and first_rate is not null
        order by abs(rate - first_rate)
        limit 10
      ) t), '[]'::jsonb),
    'below_floor_list', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rate', rate))
      from (select * from mine where note = 1 order by opened_at desc limit 10) t), '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_object_agg(bid_type, jsonb_build_object('total', n, 'won', w))
      from (select bid_type, count(*) n, count(*) filter (where won) w from mine where settled group by bid_type) t), '{}'::jsonb),
    'top_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('org', org, 'total', n, 'won', w) order by n desc)
      from (select coalesce(demand_org, org) org, count(*) n, count(*) filter (where won) w
            from mine where settled group by 1 order by 2 desc limit 5) t), '[]'::jsonb),
    -- 투찰 순위를 받은 건수 (나머지는 낙찰 결과만 있음)
    'detailed', count(*) filter (where settled and (rank is not null or note is not null)),
    -- 낙찰률은 투찰 순위까지 받은 개찰 기준으로 (낙찰 결과만 있는 건은 떨어진 입찰이 빠져 낙찰률이 부풀려짐)
    'won_detailed', count(*) filter (where settled and won and (rank is not null or note is not null))
  ) into result
  from mine;

  return result;
end $$;

revoke all on function public.my_bid_report(int) from anon, public;
grant execute on function public.my_bid_report(int) to authenticated;
