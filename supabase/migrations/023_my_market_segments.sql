-- =========================================================
-- 023: 입찰 분석 「시장 분석」 개선 — 시장 나누기 + 동점 풀기 (2026-11-16 페르소나 점검)
--  문제: ① 성격이 다른 공고(태블릿·GPU·실습기자재)가 한 시장으로 섞임
--        ② 지역 제한 공사는 같은 업체들이 매번 함께 들어와 '자주 만나는 회사'가 모두 같은 횟수(동점)
--  · 시장 = 우리가 투찰한 개찰을 공고의 품목·분류로 나눔 (공고 번호로 공고와 연결, 마지막 차수)
--      물품: 세부품명 앞 6자리 / 용역: 공공조달분류 앞 6자리 / 공사: 대표 면허(업종) / 그 밖: 유형
--      이름은 그 시장에서 가장 많이 나온 품명·분류명·면허명
--  · my_market(p_years, p_market) — p_market 없으면 전체, 있으면 그 시장만 계산. 결과에 markets(시장 목록) 추가
--  · 자주 만나는 회사 순서: 유사도 → 이 시장 낙찰 횟수 → 최근에 만난 순 → 함께 들어간 수
--      우리 투찰이 10건 미만인 작은 시장은 함께 2건부터 (10건 이상은 지금처럼 3건부터)
--  · 승패(누구에게 이겼나)와 경쟁사 투찰률은 계속 계산하지 않음 (010 원칙 유지). 낙찰 횟수는 공개된 최종낙찰자 기준
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

drop function if exists public.my_market(int);

create or replace function public.my_market(p_years int default 3, p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  since timestamptz := now() - make_interval(years => p_years);
  result jsonb;
begin
  if me is null then
    return jsonb_build_object('verified', false);
  end if;

  with mine_all as (
    select o.id, o.bid_type, coalesce(o.demand_org, o.org) as org, o.opened_at, o.winner_bizno, o.winner_amount,
           1.0 / ln(exp(1.0) + greatest(coalesce(o.participants, 1), 1) - 1) as w,
           case
             when o.bid_type = '물품' and n.p_code is not null then '물품:' || left(n.p_code, 6)
             when o.bid_type = '용역' and n.s_code is not null then '용역:' || left(n.s_code, 6)
             when o.bid_type = '공사' and n.industry_mid is not null then '공사:' || n.industry_mid
             else o.bid_type
           end as seg,
           case
             when o.bid_type = '물품' and n.p_code is not null then n.product_name
             when o.bid_type = '용역' and n.s_code is not null then n.s_name
             when o.bid_type = '공사' and n.industry_mid is not null then n.industry_mid
             else o.bid_type || ' (분류 없음)'
           end as seg_name
    from bid_results r
    join openings o on o.id = r.opening_id
    left join lateral (
      select x.p_code, x.s_code, x.s_name, x.product_name, x.industry_mid
      from notices x where x.bid_no = o.bid_no order by x.bid_ord desc limit 1
    ) n on true
    where r.bizno = me and o.opened_at >= since
  ),
  segs as (
    -- 시장 목록 — 이름은 가장 많이 나온 것
    select seg, count(*) as n, mode() within group (order by seg_name) as name, min(bid_type) as bid_type
    from mine_all group by seg
  ),
  mine as (select * from mine_all where p_market is null or seg = p_market),
  my_w as (select coalesce(sum(w), 0) as total, count(*) as n from mine),
  co as (
    -- 이 시장에 함께 들어온 업체
    select b.bizno, count(*) as shared, sum(m.w) as shared_w, min(m.opened_at) as first_seen, max(m.opened_at) as last_met
    from mine m join bid_results b on b.opening_id = m.id
    where b.bizno <> me
    group by b.bizno
    having count(*) >= case when (select n from my_w) >= 10 then 3 else 2 end
  ),
  cand as (select * from co order by shared_w desc limit 60),
  their as (
    select c.bizno, sum(1.0 / ln(exp(1.0) + greatest(coalesce(o.participants, 1), 1) - 1)) as total_w, count(*) as total_n
    from cand c join bid_results b on b.bizno = c.bizno join openings o on o.id = b.opening_id
    where o.opened_at >= since
    group by c.bizno
  ),
  market as (
    select winner_bizno, sum(winner_amount) as amt, count(*) as wins
    from mine where winner_bizno is not null and winner_amount > 0
    group by winner_bizno
  ),
  scored as (
    select c.bizno, c.shared, c.first_seen, c.last_met, t.total_n, coalesce(mk.wins, 0) as wins, coalesce(mk.amt, 0) as win_amount,
           c.shared_w / nullif(sqrt((select total from my_w) * t.total_w), 0) as sim
    from cand c join their t on t.bizno = c.bizno left join market mk on mk.winner_bizno = c.bizno
  ),
  -- 동점 풀기: 유사도(소수 셋째 자리) → 이 시장 낙찰 횟수 → 최근에 만난 순 → 함께 들어간 수
  top as (select * from scored order by round(sim::numeric, 3) desc nulls last, wins desc, last_met desc, shared desc limit 10),
  market_total as (select coalesce(sum(amt), 0) as amt, coalesce(sum(wins), 0) as n from market),
  others as (
    select coalesce(o.demand_org, o.org) as org, o.bid_type, count(distinct b.bizno) as firms, count(distinct o.id) as openings
    from top t join bid_results b on b.bizno = t.bizno join openings o on o.id = b.opening_id
    where o.opened_at >= now() - interval '1 year'
      and coalesce(o.demand_org, o.org) is not null
      and (p_market is null or o.bid_type = (select bid_type from segs where seg = p_market))
      and not exists (select 1 from mine m where m.org = coalesce(o.demand_org, o.org))
    group by 1, 2
    having count(distinct b.bizno) >= 2
    order by firms desc, openings desc
    limit 6
  )
  select jsonb_build_object(
    'verified', true,
    'years', p_years,
    'market_key', p_market,
    'markets', coalesce((select jsonb_agg(jsonb_build_object('key', seg, 'name', name, 'type', bid_type, 'openings', n) order by n desc)
                         from (select * from segs order by n desc limit 8) s), '[]'::jsonb),
    'my_openings', (select n from my_w),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bizno', t.bizno, 'name', coalesce(c.name, '업체명 미상'), 'shared', t.shared, 'their_total', t.total_n,
        'sim', round(t.sim::numeric, 3), 'last_met', t.last_met,
        'wins', t.wins, 'win_amount', t.win_amount)
        order by round(t.sim::numeric, 3) desc nulls last, t.wins desc, t.last_met desc, t.shared desc)
      from top t left join bid_companies c on c.bizno = t.bizno), '[]'::jsonb),
    'market', jsonb_build_object(
      'openings_with_winner', (select n from market_total),
      'total_amount', (select amt from market_total),
      'mine', coalesce((select amt from market where winner_bizno = me), 0),
      'my_wins', coalesce((select wins from market where winner_bizno = me), 0),
      'leaders', coalesce((
        select jsonb_agg(jsonb_build_object('name', coalesce(c.name, '업체명 미상'), 'amount', x.amt, 'wins', x.wins, 'me', x.winner_bizno = me) order by x.amt desc)
        from (select * from market order by amt desc limit 5) x left join bid_companies c on c.bizno = x.winner_bizno), '[]'::jsonb)),
    'other_markets', coalesce((select jsonb_agg(jsonb_build_object('org', org, 'type', bid_type, 'firms', firms, 'openings', openings)) from others), '[]'::jsonb),
    'newcomers', coalesce((
      select jsonb_agg(jsonb_build_object('name', coalesce(c.name, '업체명 미상'), 'shared', s.shared, 'first_seen', s.first_seen) order by s.shared desc)
      from (select * from co where first_seen >= now() - interval '90 days' and shared >= 2 order by shared desc limit 5) s
      left join bid_companies c on c.bizno = s.bizno), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.my_market(int, text) from anon, public;
grant execute on function public.my_market(int, text) to authenticated;

-- 확인: 함수가 하나만 있어야 정상 (예전 my_market(int)는 지움)
select p.oid::regprocedure as fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'my_market';
