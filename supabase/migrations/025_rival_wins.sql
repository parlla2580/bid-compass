-- =========================================================
-- 025: 입찰 분석 「시장 분석」 — 자주 만나는 회사를 누르면 그 회사가 이 시장에서 낙찰한 공고 (2026-11-17)
--  · rival_wins(p_bizno, p_years, p_market) — 우리가 투찰한 개찰 중 그 회사가 최종낙찰자인 것, 최근 순 20건
--  · 시장 나누기는 023 my_market 과 같은 규칙 (물품 세부품명 앞 6자리 / 용역 분류 앞 6자리 / 공사 대표 면허)
--  · 010·023 원칙 유지: 회사별 승패·투찰률은 보여주지 않음. 공개된 최종낙찰자·낙찰금액만
--  · 회사 확인을 마친 회원만 (my_verified_bizno)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.rival_wins(p_bizno bigint, p_years int default 3, p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  since timestamptz := now() - make_interval(years => p_years);
begin
  if me is null then
    return jsonb_build_object('verified', false);
  end if;
  return jsonb_build_object('verified', true, 'wins', coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'org', x.org, 'type', x.bid_type,
                                        'opened_at', x.opened_at, 'amount', x.winner_amount) order by x.opened_at desc)
    from (
      select o.id, o.title, coalesce(o.demand_org, o.org) as org, o.bid_type, o.opened_at, o.winner_amount
      from bid_results r
      join openings o on o.id = r.opening_id
      left join lateral (
        select n.p_code, n.s_code, n.industry_mid
        from notices n where n.bid_no = o.bid_no order by n.bid_ord desc limit 1
      ) n on true
      where r.bizno = me and o.opened_at >= since and o.winner_bizno = p_bizno
        and (p_market is null or p_market = case
             when o.bid_type = '물품' and n.p_code is not null then '물품:' || left(n.p_code, 6)
             when o.bid_type = '용역' and n.s_code is not null then '용역:' || left(n.s_code, 6)
             when o.bid_type = '공사' and n.industry_mid is not null then '공사:' || n.industry_mid
             else o.bid_type end)
      order by o.opened_at desc
      limit 20
    ) x), '[]'::jsonb));
end $$;

revoke all on function public.rival_wins(bigint, int, text) from anon, public;
grant execute on function public.rival_wins(bigint, int, text) to authenticated;

-- 확인: 함수가 보이면 정상
select p.oid::regprocedure as fn from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = 'rival_wins';
