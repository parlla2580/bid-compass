-- =========================================================
-- 050: 낙찰률 분모에서 '결과 없음' 빼기 (2026-11-23)
--  · 문제: 개찰 60일이 지나면 낙찰자 정보가 없어도 '결과가 난 투찰'로 세어 탈락처럼 분모에 들어감
--          과거분 받기로 투찰 순위를 아직 못 받은 개찰이 늘며 낙찰률이 낮게 보임 (위플랫 0%)
--  · 바꾼 기준: 결과가 난 투찰 = 낙찰자 정해짐 · 하한 미달 · (개찰 60일 지남 + 우리 순위 2위 이하)
--          순위·낙찰자 정보가 둘 다 없는 오래된 개찰은 'unknown'(결과 없음)으로 따로 — 화면에서 '결과 없음 N 제외'
--  · 업계 비교(peers_for)도 같은 기준. 저장된 업계 비교는 지워서 다시 계산
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

  with allmine as (
    -- ① 투찰 순위가 있는 개찰
    select o.id, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           r.rank, r.amount, r.rate, r.note,
           (o.winner_bizno = me) as won,
           (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1) as first_rate,
           -- decided: 최종낙찰자가 정해졌거나 하한 미달 (놓친 공고·순위 기준)
           coalesce(o.winner_bizno is not null or r.note = 1, false) as decided,
           -- settled (050): 낙찰자가 정해졌거나 하한 미달, 또는 개찰 60일이 지났고 우리 순위가 2위 이하(떨어진 것이 확실)
           --  순위도 낙찰자 정보도 없는 오래된 개찰은 '결과 없음'으로 따로 셈 (과거분 받기로 순위 미수집 개찰이 늘며 탈락처럼 세어지던 문제)
           coalesce(o.winner_bizno is not null or r.note = 1 or (o.opened_at < now() - interval '60 days' and r.rank >= 2), false) as settled
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
  ),
  -- 038: 낙찰률·유형별·기관별·평균은 경쟁 입찰(참가 2곳 이상)만. 1곳 참가(수의·견적·단가계약)는 건수만 따로
  mine as (select * from allmine where coalesce(participants, 2) >= 2)
  select jsonb_build_object(
    'verified', true,
    'years', p_years,
    'single', (select count(*) from allmine where coalesce(participants, 2) < 2),
    'single_won', (select count(*) from allmine where coalesce(participants, 2) < 2 and won),
    'total', count(*),
    'won', count(*) filter (where won),
    'below_floor', count(*) filter (where note = 1),
    -- 낙찰자 결정 전(개찰 60일 이내 · 적격심사·PQ 중 등) — 낙찰률 계산에서 뺌
    'pending', count(*) filter (where not settled and opened_at >= now() - interval '60 days'),
    -- 050: 결과 없음 — 개찰 60일 지났는데 낙찰자·우리 순위 정보 없음 (유찰·순위 미수집)
    'unknown', count(*) filter (where not settled and opened_at < now() - interval '60 days'),
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

create or replace function public.peers_for(p_bizno bigint, p_months int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := p_bizno;
  m int := least(greatest(p_months, 3), 36);
  since timestamptz := now() - make_interval(months => least(greatest(p_months, 3), 36));
  result jsonb;
begin
  with mine as (
    select o.id, o.bid_type from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since and coalesce(o.participants, 2) >= 2
  ),
  types as (select distinct bid_type from mine),
  met as (
    select b.bizno from mine m join bid_results b on b.opening_id = m.id
    where b.bizno <> me group by b.bizno having count(*) >= 2
  ),
  -- 우리와 경쟁사들의 같은 기간·같은 유형 · 경쟁 입찰(참가 2곳 이상) 성적 — 입찰 성과와 같은 분모 (037·038)
  stats as (
    select r.bizno,
           count(*) filter (where o.winner_bizno is not null or r.note = 1 or (o.opened_at < now() - interval '60 days' and r.rank >= 2)) as settled,
           count(*) filter (where o.winner_bizno = r.bizno) as won,
           count(*) as bids
    from bid_results r join openings o on o.id = r.opening_id
    where (r.bizno = me or r.bizno in (select bizno from met))
      and o.opened_at >= since and o.bid_type in (select bid_type from types)
      and coalesce(o.participants, 2) >= 2
    group by r.bizno
  ),
  peers as (
    select bizno, won::numeric / settled as rate, bids from stats
    where bizno <> me and settled >= 5
  ),
  my as (select * from stats where bizno = me)
  select jsonb_build_object(
    'verified', true,
    'months', m,
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
    'below', (select round(avg(case when p.rate < (select won::numeric / nullif(settled, 0) from my) then 1
                                     when p.rate = (select won::numeric / nullif(settled, 0) from my) then 0.5 else 0 end), 4) from peers p),
    'bids_below', (select round(avg(case when p.bids < (select bids from my) then 1 when p.bids = (select bids from my) then 0.5 else 0 end), 4) from peers p),
    'at', now()
  ) into result;
  return result;
end $$;
revoke all on function public.peers_for(bigint, int) from anon, authenticated, public;

-- 업계 비교 저장값 비우기 (다음 조회·매시 수집 때 새 기준으로 다시 계산)
delete from public.peer_cache;

-- 확인: 둘 다 true 면 정상
select position('unknown' in (select prosrc from pg_proc where proname = 'my_bid_report' limit 1)) > 0 as report_ok,
       position('r.rank >= 2' in (select prosrc from pg_proc where proname = 'peers_for' limit 1)) > 0 as peers_ok;
