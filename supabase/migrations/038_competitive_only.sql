-- =========================================================
-- 038: 낙찰률은 경쟁 입찰만 (U12) + 업계 비교 미리 계산 (U11) — 2026-11-22 사용자 결정
--  · U12: 입찰 성과 낙찰률·유형별·기관별·평균 투찰률과 업계 비교를 참가 2곳 이상 개찰만으로
--         1곳 참가(수의·견적·단가계약) 낙찰은 경쟁 입찰 실력보다 낙찰률을 부풀림 → 건수만 single/single_won 으로 따로
--         (발주기관 카드 035와 같은 기준: 참가 업체 수가 비어 있으면 경쟁 입찰로 봄)
--  · U11: 업계 비교가 7.8~8.4초(서버 제한 15초) → 회사별 결과를 peer_cache 에 저장(20시간)
--         수집기가 매시간 refresh_peer_cache() 로 미리 계산 · 캐시가 없으면 처음 한 번만 계산
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

-- ---------- 업계 비교: 회사별 계산(peers_for) + 하루 캐시 (U11) ----------
create table if not exists public.peer_cache (
  bizno    bigint not null,
  months   int not null,
  result   jsonb not null,
  at       timestamptz not null default now(),
  primary key (bizno, months)
);
alter table public.peer_cache enable row level security; -- 정책 없음 → 회원은 직접 읽기·쓰기 불가 (함수만)

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
           count(*) filter (where o.winner_bizno is not null or r.note = 1 or o.opened_at < now() - interval '60 days') as settled,
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

-- 회원 호출: 20시간 안에 계산한 값이 있으면 그대로(즉시), 없으면 계산해 저장
create or replace function public.my_peers(p_months int default 12)
returns jsonb language plpgsql volatile security definer set search_path = public
set statement_timeout = '20s' as $$
declare
  me bigint := my_verified_bizno();
  m int := least(greatest(p_months, 3), 36);
  r jsonb;
begin
  if me is null then return jsonb_build_object('verified', false); end if;
  select result into r from peer_cache where bizno = me and months = m and at > now() - interval '20 hours';
  if r is not null then return r; end if;
  r := peers_for(me, m);
  insert into peer_cache (bizno, months, result, at) values (me, m, r, now())
  on conflict (bizno, months) do update set result = excluded.result, at = excluded.at;
  return r;
end $$;
revoke all on function public.my_peers(int) from anon, public;
grant execute on function public.my_peers(int) to authenticated;

-- 수집기(관리자 키)가 매시간 부름: 회사 확인 회원 중 계산이 20시간 넘은 회사만 다시 계산 (한 번에 최대 p_max곳)
create or replace function public.refresh_peer_cache(p_max int default 20)
returns int language plpgsql volatile security definer set search_path = public
set statement_timeout = '280s' as $$
declare
  b bigint;
  done int := 0;
begin
  for b in
    select distinct nullif(regexp_replace(v.bizno, '\D', '', 'g'), '')::bigint
    from company_verifications v
    where nullif(regexp_replace(v.bizno, '\D', '', 'g'), '') is not null
      and not exists (select 1 from peer_cache c where c.bizno = nullif(regexp_replace(v.bizno, '\D', '', 'g'), '')::bigint
                        and c.months = 12 and c.at > now() - interval '20 hours')
    limit p_max
  loop
    insert into peer_cache (bizno, months, result, at) values (b, 12, peers_for(b, 12), now())
    on conflict (bizno, months) do update set result = excluded.result, at = excluded.at;
    done := done + 1;
  end loop;
  return done;
end $$;
revoke all on function public.refresh_peer_cache(int) from anon, authenticated, public;

-- 기준이 바뀌었으니 예전 캐시는 비움 (여러 번 실행해도 안전)
delete from public.peer_cache where not (result ? 'at');

-- 확인: 세 함수가 보이면 정상
select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('my_bid_report', 'my_peers', 'peers_for', 'refresh_peer_cache');
