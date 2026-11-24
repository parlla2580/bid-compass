-- =========================================================
-- 052: 공개 업종 시장 리포트 (2026-11-24, 오픈 전 아하 포인트 ⑤)
--  · 로그인 없이 보는 /market 페이지 — 검색·카페 공유로 새 사용자 유입
--  · 업종 = 물품 세부품명 · 용역 분류 · 공사 대표 면허. 유형별로 최근 12개월 공고가 많은 12곳(30건 이상)
--  · 페이지마다: 공고 수 · 월별 공고 · 지금 열린 공고 · 추정가격 보통 범위 · 보통 경쟁 · 낙찰률 보통 범위 · 많이 낸 기관 TOP 5
--  · 무거운 집계라 DB 예약 'market-pages'(매일 05:20 한국시간 = 20:20 UTC)가 market_pages 표에 미리 저장, 화면은 읽기만
--  · 공개 정보만 (나라장터 공개 자료 집계, 업체명 없음). 쇼핑몰·단가계약(각 수요기관·다수공급자·카탈로그)은 뺌
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create table if not exists public.market_pages (
  slug   text primary key,       -- p+세부품명번호 / s+용역분류번호 / c+면허 이름 해시
  type   text not null,          -- 물품 · 용역 · 공사
  name   text not null,
  code   text not null,
  rank   int not null,           -- 유형 안 순위 (공고 많은 순)
  data   jsonb not null,
  at     timestamptz not null default now()
);
alter table public.market_pages enable row level security;
drop policy if exists "시장 리포트는 누구나 읽기" on public.market_pages;
create policy "시장 리포트는 누구나 읽기" on public.market_pages for select to anon, authenticated using (true);
grant select on public.market_pages to anon, authenticated;

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
      from mp_base group by bid_type, code having count(*) >= 30
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

select cron.schedule('market-pages', '20 20 * * *', $job$select public.refresh_market_pages()$job$);
-- 지금 한 번 (1분 안, 스스로 예약 삭제)
select cron.schedule('market-pages-now', '* * * * *',
  $job$select public.refresh_market_pages(); select cron.unschedule('market-pages-now');$job$);

-- 확인: 예약 2줄 (market-pages · market-pages-now). now 는 몇 분 뒤 사라지고, market_pages 에 36줄 안팎이 생김
select jobname, schedule from cron.job where jobname like 'market-pages%' order by jobname;
