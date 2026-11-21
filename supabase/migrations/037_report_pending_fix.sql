-- =========================================================
-- 037: 낙찰률 분모 통일 (2026-11-22 전체 테스트)
--  · 증상: 입찰 분석 한 화면에서 낙찰률이 45.4%(위 원) · 58%(업계 비교) · 58%(유형별)로 다르게 나옴
--          '결정 전'도 위 원 아래 1건, 투찰 목록 8건으로 다름
--  · 기준(2026-11-18 사용자 결정): 낙찰률 = 낙찰 ÷ (투찰 − 결정 전)
--      결정 전 = 낙찰자 없음 · 하한 미달 아님 · 개찰 60일 이내 (투찰 목록의 '결정 전'과 같음)
--      60일이 지나도 낙찰자가 없으면(유찰 등) 낙찰 못 한 투찰로 셈
--  · 원인: my_bid_report 의 settled 가 NULL 이 되어 결정 전 건수가 1건으로 줄었고,
--          유형별·업계 비교는 '낙찰자 있음'만 분모로 써서 오래된 결과 없음 건이 빠졌음
--  · 수정: my_bid_report(유형별·기관별 포함)와 my_peers 를 같은 분모로. 아깝게 놓친 공고는 그대로(낙찰자 정해진 건만)
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
           (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1) as first_rate,
           -- decided: 최종낙찰자가 정해졌거나 하한 미달 (놓친 공고·순위 기준)
           coalesce(o.winner_bizno is not null or r.note = 1, false) as decided,
           -- settled: 낙찰률 분모 = 결정 전(낙찰자 없음 · 개찰 60일 이내)만 뺀 투찰 — 목록의 '결정 전'과 같은 기준 (037)
           coalesce(o.winner_bizno is not null or r.note = 1 or o.opened_at < now() - interval '60 days', false) as settled
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
    union all
    -- ② 투찰 순위는 없지만 최종낙찰자가 우리 회사인 개찰
    select o.id, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           null::smallint, o.winner_amount, o.winner_rate, null::smallint,
           true, null::numeric, true, true
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
    -- 낙찰자 결정 전(개찰 60일 이내 · 적격심사·PQ 중 등) — 낙찰률 계산에서 뺌
    'pending', count(*) filter (where not settled),
    'avg_rate', round(avg(rate) filter (where note is null), 3),
    'avg_participants', round(avg(participants)),
    'near_misses', coalesce((
      select jsonb_agg(m order by m->>'gap')
      from (
        select jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rank', rank,
                 'rate', rate, 'first_rate', first_rate, 'gap', round(abs(rate - first_rate), 3), 'participants', participants) m
        from mine
        where decided and not won and note is null and rank between 2 and 5 and first_rate is not null
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
    'detailed', count(*) filter (where decided and (rank is not null or note is not null)),
    -- 낙찰률은 투찰 순위까지 받은 개찰 기준으로 (낙찰 결과만 있는 건은 떨어진 입찰이 빠져 낙찰률이 부풀려짐)
    'won_detailed', count(*) filter (where decided and won and (rank is not null or note is not null))
  ) into result
  from mine;

  return result;
end $$;

revoke all on function public.my_bid_report(int) from anon, public;
grant execute on function public.my_bid_report(int) to authenticated;

revoke all on function public.my_bid_report(int) from anon, public;
grant execute on function public.my_bid_report(int) to authenticated;

create or replace function public.my_peers(p_months int default 12)
returns jsonb language plpgsql stable security definer set search_path = public
set statement_timeout = '15s' as $$
declare
  me bigint := my_verified_bizno();
  since timestamptz := now() - make_interval(months => least(greatest(p_months, 3), 36));
  result jsonb;
begin
  if me is null then return jsonb_build_object('verified', false); end if;

  with mine as (
    select o.id, o.bid_type from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
  ),
  types as (select distinct bid_type from mine),
  met as (
    select b.bizno from mine m join bid_results b on b.opening_id = m.id
    where b.bizno <> me group by b.bizno having count(*) >= 2
  ),
  -- 우리와 경쟁사들의 같은 기간·같은 유형 투찰 성적
  stats as (
    select r.bizno,
           count(*) filter (where o.winner_bizno is not null or r.note = 1 or o.opened_at < now() - interval '60 days') as settled, -- 037: 입찰 성과와 같은 분모
           count(*) filter (where o.winner_bizno = r.bizno) as won,
           count(*) as bids
    from bid_results r join openings o on o.id = r.opening_id
    where (r.bizno = me or r.bizno in (select bizno from met))
      and o.opened_at >= since and o.bid_type in (select bid_type from types)
    group by r.bizno
  ),
  peers as (
    select bizno, won::numeric / settled as rate, bids from stats
    where bizno <> me and settled >= 5
  ),
  my as (select * from stats where bizno = me)
  select jsonb_build_object(
    'verified', true,
    'months', least(greatest(p_months, 3), 36),
    'n', (select count(*) from peers),
    'enough', (select count(*) from peers) >= 30,
    'me', (select jsonb_build_object('bids', bids, 'settled', settled, 'won', won,
              'rate', case when settled > 0 then round(won::numeric / settled, 4) end) from my),
    'rate', (select jsonb_build_object(
               'p25', round(percentile_cont(0.25) within group (order by rate)::numeric, 4),
               'p50', round(percentile_cont(0.5)  within group (order by rate)::numeric, 4),
               'p75', round(percentile_cont(0.75) within group (order by rate)::numeric, 4)) from peers),
    'bids', (select jsonb_build_object(
               'p25', percentile_cont(0.25) within group (order by bids),
               'p50', percentile_cont(0.5)  within group (order by bids),
               'p75', percentile_cont(0.75) within group (order by bids)) from peers),
    -- 우리보다 낙찰률이 낮은 경쟁사 비율 (같으면 절반으로) → 1 − 이 값 = 상위 ○%
    'below', (select round(avg(case when p.rate < (select won::numeric / nullif(settled, 0) from my) then 1
                                     when p.rate = (select won::numeric / nullif(settled, 0) from my) then 0.5 else 0 end), 4) from peers p),
    'bids_below', (select round(avg(case when p.bids < (select bids from my) then 1 when p.bids = (select bids from my) then 0.5 else 0 end), 4) from peers p)
  ) into result;

  return result;
end $$;

revoke all on function public.my_peers(int) from anon, public;
grant execute on function public.my_peers(int) to authenticated;

-- 확인: 두 함수가 보이면 정상 (값은 회사 확인된 계정의 입찰 분석 화면에서)
select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('my_bid_report', 'my_peers');
