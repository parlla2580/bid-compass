-- =========================================================
-- 033: 익명 업계 비교 (로드맵 3, 2026-11-21) — 커뮤니티 대신 '남들은 어떻게 하나'
--  · 비교 대상(경쟁사 묶음) = 최근 p_months개월 우리가 투찰한 개찰에서 2번 이상 만난 회사 중
--      같은 기간 결과가 난 투찰이 5건 이상인 회사 (우리와 같은 유형의 개찰만)
--    (같은 품목 시장 전체로 잡으면 1년치 공고를 매번 훑어야 해 느림 — 실제로 부딪히는 경쟁사로 정의)
--  · 결과가 난 투찰 = 최종낙찰자가 정해졌거나 하한 미달. 낙찰 = 최종낙찰자가 그 회사
--  · 돌려주는 값: 묶음 크기, 우리 값(투찰·낙찰·낙찰률·월 투찰), 묶음의 분포(25·50·75%), 우리보다 낙찰률이 낮은 회사 비율
--    개별 회사 이름·사업자번호·숫자는 돌려주지 않음. 묶음이 30곳 미만이면 enough = false (화면은 숨김)
--  · 회사 확인을 마친 회원 본인 것만 (my_verified_bizno)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

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
           count(*) filter (where o.winner_bizno is not null or r.note = 1) as settled,
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

-- 확인: 함수가 보이면 정상
select p.oid::regprocedure from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'my_peers';
