-- =========================================================
-- 010: 입찰 분석 「우리 시장」 — 같은 공고에 들어온 업체로 보는 시장 지도
-- 회사 확인(대표자명 일치)을 마친 회원 본인의 시장만 계산합니다. 투찰 기록 표는 계속 직접 읽을 수 없습니다.
--
-- 통계 방법 (신뢰도 우선)
--  · 우리 시장 = 우리 회사가 투찰한 개찰들 (최근 p_years년)
--  · 주요 업체 = 우리 시장에 함께 들어온 업체를 '가중 코사인 유사도'로 순위
--      개찰 가중치 w = 1 / ln(e + 참가업체수 − 1)  → 수백 곳이 들어온 공고에서 함께 들어간 건 우연에 가까우므로 낮게
--      유사도 = Σ(함께 들어간 개찰 w) / √(Σ우리 개찰 w × Σ그 회사 전체 개찰 w)
--      → 아무 공고에나 들어가는 대형 업체는 분모가 커져 자동으로 낮아짐 (검색엔진의 흔한 단어 낮추기와 같은 원리)
--      함께 들어간 개찰 3건 미만은 우연일 수 있어 제외
--  · 시장 점유 = 우리 시장 개찰의 최종낙찰 금액 합계 중 업체별 비중 (낙찰 금액이 있는 개찰 기준)
--  · 다른 시장 = 주요 업체들이 들어갔지만 우리는 들어가지 않은 기관·유형. 주요 업체 중 몇 곳이 들어갔는지로 순위
--  · 새로 들어온 업체 = 최근 90일에 처음 우리 시장에 나타나 2건 이상 함께 들어온 업체
--  · 승패(누구에게 이겼나·졌나)와 투찰률 습관은 계산하지 않음 (추첨 영향이 커 의미가 약하고, 투찰률은 민감)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.my_market(p_years int default 3)
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
    select o.id, o.bid_type, coalesce(o.demand_org, o.org) as org, o.opened_at, o.winner_bizno, o.winner_amount,
           1.0 / ln(exp(1.0) + greatest(coalesce(o.participants, 1), 1) - 1) as w
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
  ),
  my_w as (select coalesce(sum(w), 0) as total, count(*) as n from mine),
  co as (
    -- 우리 시장에 함께 들어온 업체
    select b.bizno, count(*) as shared, sum(m.w) as shared_w, min(m.opened_at) as first_seen
    from mine m join bid_results b on b.opening_id = m.id
    where b.bizno <> me
    group by b.bizno
    having count(*) >= 3
  ),
  cand as (select * from co order by shared_w desc limit 60),
  their as (
    -- 후보 업체의 전체 참여(같은 기간) 가중치 합
    select c.bizno, sum(1.0 / ln(exp(1.0) + greatest(coalesce(o.participants, 1), 1) - 1)) as total_w, count(*) as total_n
    from cand c join bid_results b on b.bizno = c.bizno join openings o on o.id = b.opening_id
    where o.opened_at >= since
    group by c.bizno
  ),
  scored as (
    select c.bizno, c.shared, c.first_seen, t.total_n,
           c.shared_w / nullif(sqrt((select total from my_w) * t.total_w), 0) as sim
    from cand c join their t on t.bizno = c.bizno
  ),
  top as (select * from scored order by sim desc nulls last limit 10),
  market as (
    select winner_bizno, sum(winner_amount) as amt, count(*) as wins
    from mine where winner_bizno is not null and winner_amount > 0
    group by winner_bizno
  ),
  market_total as (select coalesce(sum(amt), 0) as amt, coalesce(sum(wins), 0) as n from market),
  others as (
    -- 주요 업체들이 들어갔지만 우리는 들어가지 않은 기관·유형 (최근 1년)
    select coalesce(o.demand_org, o.org) as org, o.bid_type, count(distinct b.bizno) as firms, count(distinct o.id) as openings
    from top t join bid_results b on b.bizno = t.bizno join openings o on o.id = b.opening_id
    where o.opened_at >= now() - interval '1 year'
      and coalesce(o.demand_org, o.org) is not null
      and not exists (select 1 from mine m where m.org = coalesce(o.demand_org, o.org))
    group by 1, 2
    having count(distinct b.bizno) >= 2
    order by firms desc, openings desc
    limit 6
  )
  select jsonb_build_object(
    'verified', true,
    'years', p_years,
    'my_openings', (select n from my_w),
    'competitors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bizno', t.bizno, 'name', coalesce(c.name, '업체명 미상'), 'shared', t.shared, 'their_total', t.total_n,
        'sim', round(t.sim::numeric, 3),
        'wins', coalesce(mk.wins, 0), 'win_amount', coalesce(mk.amt, 0)) order by t.sim desc)
      from top t left join bid_companies c on c.bizno = t.bizno left join market mk on mk.winner_bizno = t.bizno), '[]'::jsonb),
    'market', jsonb_build_object(
      'openings_with_winner', (select n from market_total),
      'total_amount', (select amt from market_total),
      'mine', coalesce((select amt from market where winner_bizno = me), 0),
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

revoke all on function public.my_market(int) from anon, public;
grant execute on function public.my_market(int) to authenticated;
