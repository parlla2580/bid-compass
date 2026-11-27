-- =========================================================
-- 053: 업종별 시장 리포트에서 '기타' 업종 빼기 (2026-11-27 사용자 결정 D2)
--  · 기타기술용역 · 기타사업지원서비스 · 기타연구조사서비스 · 기타행사기획및대행서비스 · 기타교육서비스 · 기타시약및지시약 등
--  · 빠진 자리는 다음 순위의 이름이 분명한 업종으로 채움 (유형별 12개 유지). 앱 안 공고·분석에는 영향 없음
--  · 함수만 바꾸고, 지금 한 번 다시 계산 (1분 안, 스스로 예약 삭제)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create or replace function public.refresh_market_pages(p_per_type int default 12)
returns int language plpgsql volatile security definer set search_path = public as $$
declare seg record; n int := 0; d jsonb; sl text; slugs text[] := '{}';
begin
  drop table if exists mp_base;
  -- 최근 12개월 공고 (같은 공고번호는 마지막 차수 하나) · 쇼핑몰·단가계약 제외
  create temp table mp_base on commit drop as
  select distinct on (n.bid_no) n.bid_no, n.bid_ord, n.bid_type, n.posted_at, n.closes_at, n.est_price,
         coalesce(n.demand_org, n.org) as org,
         case n.bid_type when '물품' then n.p_code when '용역' then n.s_code else n.industry_mid end as code,
         case n.bid_type when '물품' then n.product_name when '용역' then n.s_name else n.industry_mid end as name
  from notices n
  where n.posted_at >= now() - interval '12 months'
    and coalesce(n.demand_org, '') !~ '^각\s*수요기관'
    and coalesce(n.award, '') !~ '^(다수공급자|카탈로그)'
  order by n.bid_no, n.bid_ord desc;
  delete from mp_base where code is null or name is null or name = '';
  create index on mp_base (bid_type, code);

  for seg in
    select * from (
      select bid_type, code, mode() within group (order by name) as name, count(*) as cnt,
             row_number() over (partition by bid_type order by count(*) desc) as rk
      from mp_base group by bid_type, code
      -- 053: '기타○○' 처럼 이름이 모호한 분류는 빼고 다음 순위 업종으로 채움 (검색·공유에서 무엇의 시장인지 알기 어려움)
      having count(*) >= 30 and mode() within group (order by name) !~ '^기타'
    ) t where rk <= p_per_type
  loop
    with b as (select * from mp_base where bid_type = seg.bid_type and code = seg.code),
    o as (
      select op.participants, op.winner_rate
      from b join openings op on op.bid_no = b.bid_no and op.bid_ord = b.bid_ord
      where coalesce(op.participants, 0) >= 2
    )
    select jsonb_build_object(
      'notices', (select count(*) from b),
      'open_now', (select count(*) from b where closes_at > now()),
      'from', (select min(posted_at)::date from b), 'to', (select max(posted_at)::date from b),
      'months', coalesce((select jsonb_agg(jsonb_build_object('ym', ym, 'n', c) order by ym)
                          from (select to_char(posted_at at time zone 'Asia/Seoul', 'YYYY-MM') ym, count(*) c from b group by 1) m), '[]'::jsonb),
      'price', (select jsonb_build_object('n', count(*),
                  'p25', percentile_cont(0.25) within group (order by est_price),
                  'p50', percentile_cont(0.5) within group (order by est_price),
                  'p75', percentile_cont(0.75) within group (order by est_price)) from b where est_price > 0),
      'openings', (select count(*) from o),
      'participants', (select percentile_cont(0.5) within group (order by participants) from o),
      'win_rate', (select jsonb_build_object('n', count(*),
                  'p25', percentile_cont(0.25) within group (order by winner_rate),
                  'p50', percentile_cont(0.5) within group (order by winner_rate),
                  'p75', percentile_cont(0.75) within group (order by winner_rate)) from o where winner_rate between 50 and 110),
      'orgs', coalesce((select jsonb_agg(jsonb_build_object('org', org, 'n', c) order by c desc)
                        from (select org, count(*) c from b where org is not null group by org order by 2 desc limit 5) g), '[]'::jsonb)
    ) into d;
    insert into market_pages (slug, type, name, code, rank, data, at)
    values (case seg.bid_type when '물품' then 'p' || seg.code when '용역' then 's' || seg.code else 'c' || substr(md5(seg.code), 1, 10) end,
            seg.bid_type, seg.name, seg.code, seg.rk, d, now())
    on conflict (slug) do update set name = excluded.name, rank = excluded.rank, data = excluded.data, at = now()
    returning slug into sl;
    slugs := slugs || sl;
    n := n + 1;
  end loop;
  -- 이번에 순위에서 빠진 업종은 지움
  if n > 0 then delete from market_pages where not (slug = any(slugs)); end if;
  return n;
end $$;
revoke all on function public.refresh_market_pages(int) from anon, authenticated, public;

select cron.schedule('market-pages-now', '* * * * *',
  $job$select public.refresh_market_pages(); select cron.unschedule('market-pages-now');$job$);

-- 확인: market-pages-now 한 줄 (몇 분 뒤 사라지고, 업종 목록에서 '기타'가 빠짐)
select jobname, schedule from cron.job where jobname like 'market-pages%' order by jobname;
