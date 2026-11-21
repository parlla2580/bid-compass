-- =========================================================
-- 034: 발주기관 카드 (로드맵 4, 2026-11-21) — 이 기관은 언제·어떻게 사나
--  · 기관 = 수요기관이 있으면 수요기관, 없으면 공고기관 (화면 전체와 같은 기준)
--  · org_profile(p_org, p_months) — 공개 조달 데이터라 누구나 (낙찰 업체 이름은 화면에서 가입 후)
--      months    : 월별 공고 수 (공고번호 기준, 최근 p_months개월)
--      by_type   : 유형별 개찰 수·보통 참가 업체 수(중앙값)
--      sajeong   : 사정률(예정가격 ÷ 기초금액) 25·50·75% — 90~110% 안, 기초금액·예정가격이 있는 개찰만
--      win_rate  : 낙찰률 25·50·75%
--      winners   : 낙찰 많이 한 업체 5곳 (낙찰 수, 낙찰자가 정해진 개찰 중 비율)
--      d_from/d_to: 실제 데이터 기간 (수집 기간이 짧을 수 있어 화면에 그대로 표시)
--  · 기관별 조회가 빠르도록 기관 식(coalesce) 인덱스 추가 — 처음 실행 때 수십 초 걸릴 수 있음
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create index if not exists openings_org_idx on public.openings ((coalesce(demand_org, org)), opened_at desc);
create index if not exists notices_org_idx  on public.notices  ((coalesce(demand_org, org)), posted_at desc);

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
  sj as (
    select planned_price::numeric / base_amount as r from op
    where base_amount > 0 and planned_price > 0 and planned_price::numeric / base_amount between 0.9 and 1.1
  ),
  wn as (select winner_bizno, count(*) as wins from op where winner_bizno is not null group by winner_bizno)
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
                               from op group by bid_type) t), '{}'::jsonb),
    'sajeong', (select case when count(*) > 0 then jsonb_build_object('n', count(*),
                  'p25', round((percentile_cont(0.25) within group (order by r) * 100)::numeric, 2),
                  'p50', round((percentile_cont(0.5)  within group (order by r) * 100)::numeric, 2),
                  'p75', round((percentile_cont(0.75) within group (order by r) * 100)::numeric, 2)) end from sj),
    'win_rate', (select case when count(*) > 0 then jsonb_build_object('n', count(*),
                  'p25', round(percentile_cont(0.25) within group (order by winner_rate)::numeric, 3),
                  'p50', round(percentile_cont(0.5)  within group (order by winner_rate)::numeric, 3),
                  'p75', round(percentile_cont(0.75) within group (order by winner_rate)::numeric, 3)) end
                 from op where winner_rate between 50 and 100),
    'decided', (select count(*) from op where winner_bizno is not null),
    'winners', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(c.name, '업체명 미상'), 'wins', w.wins) order by w.wins desc)
                         from (select * from wn order by wins desc limit 5) w left join bid_companies c on c.bizno = w.winner_bizno), '[]'::jsonb)
  )
$$;

grant execute on function public.org_profile(text, int) to anon, authenticated;

-- 확인: 서울대학교 (개찰 수·사정률이 보이면 정상)
select public.org_profile('서울대학교') -> 'openings' as openings, public.org_profile('서울대학교') -> 'sajeong' as sajeong;
