-- =========================================================
-- 035: 발주기관 카드 보정 (2026-11-21) — 034 실데이터 점검 결과 반영
--  · 조달청처럼 제3자단가·우수조달 단가계약(참가 1곳, 낙찰률 100%)이 많은 기관은
--    참가 업체 수 1곳·낙찰률 99.97%로 왜곡됨 → 참가 2곳 이상 개찰만 통계에 사용
--      대상: 유형별 개찰 수·참가 업체 수, 사정률, 낙찰률, 낙찰 많이 한 업체, 낙찰자 정해진 건수
--      월별 공고 수·전체 개찰 수는 그대로. 뺀 건수는 single 로 돌려줌
--  · 낙찰 많이 한 업체는 2건 이상 낙찰한 곳만 (1건짜리 나열 방지)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.org_profile(p_org text, p_months int default 12)
returns jsonb language sql stable security definer set search_path = public
set statement_timeout = '10s' as $$
  with since as (select now() - make_interval(months => least(greatest(p_months, 3), 36)) as t),
  op as (
    select o.* from openings o, since
    where coalesce(o.demand_org, o.org) = p_org and o.opened_at >= since.t
  ),
  nt as (
    select distinct on (n.bid_no) n.bid_no, n.posted_at, n.bid_type from notices n, since
    where coalesce(n.demand_org, n.org) = p_org and n.posted_at >= since.t and n.source = 'api'
    order by n.bid_no, n.bid_ord desc
  ),
  -- 경쟁 개찰만: 참가 1곳 이하(제3자단가·우수조달·혁신제품 시범구매 등 단가계약)는 통계에서 뺌
  cp as (select * from op where coalesce(participants, 2) >= 2),
  sj as (
    select planned_price::numeric / base_amount as r from cp
    where base_amount > 0 and planned_price > 0 and planned_price::numeric / base_amount between 0.9 and 1.1
  ),
  wn as (select winner_bizno, count(*) as wins from cp where winner_bizno is not null group by winner_bizno having count(*) >= 2)
  select jsonb_build_object(
    'org', p_org,
    'months', coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'n', n) order by ym)
                        from (select to_char(posted_at at time zone 'Asia/Seoul', 'YYYY-MM') ym, count(*) n from nt group by 1) m), '[]'::jsonb),
    'notices', (select count(*) from nt),
    'openings', (select count(*) from op),
    'd_from', least((select min(posted_at) from nt), (select min(opened_at) from op)),
    'd_to', greatest((select max(posted_at) from nt), (select max(opened_at) from op)),
    'by_type', coalesce((select jsonb_object_agg(bid_type, jsonb_build_object('n', n, 'participants', p))
                         from (select bid_type, count(*) n, percentile_cont(0.5) within group (order by participants) filter (where participants > 0) p
                               from cp group by bid_type) t), '{}'::jsonb),
    'single', (select count(*) from op where coalesce(participants, 2) < 2),
    'sajeong', (select case when count(*) > 0 then jsonb_build_object('n', count(*),
                  'p25', round((percentile_cont(0.25) within group (order by r) * 100)::numeric, 2),
                  'p50', round((percentile_cont(0.5)  within group (order by r) * 100)::numeric, 2),
                  'p75', round((percentile_cont(0.75) within group (order by r) * 100)::numeric, 2)) end from sj),
    'win_rate', (select case when count(*) > 0 then jsonb_build_object('n', count(*),
                  'p25', round(percentile_cont(0.25) within group (order by winner_rate)::numeric, 3),
                  'p50', round(percentile_cont(0.5)  within group (order by winner_rate)::numeric, 3),
                  'p75', round(percentile_cont(0.75) within group (order by winner_rate)::numeric, 3)) end
                 from cp where winner_rate between 50 and 100),
    'decided', (select count(*) from cp where winner_bizno is not null),
    'winners', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c.name, '업체명 미상'), 'wins', w.wins) order by w.wins desc)
                         from (select * from wn order by wins desc limit 5) w left join bid_companies c on c.bizno = w.winner_bizno), '[]'::jsonb)
  )
$$;

grant execute on function public.org_profile(text, int) to anon, authenticated;

-- 확인: 조달청 낙찰률 중앙값이 100% 근처가 아니고 single 이 수백 건이면 정상
select public.org_profile('조달청') -> 'single' as single, public.org_profile('조달청') -> 'win_rate' as win_rate;
