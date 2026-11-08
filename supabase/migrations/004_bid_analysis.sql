-- =========================================================
-- 004: F7 입찰 분석 — 개찰 결과와 투찰 기록 (기획서 v2.2 12.3)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
--
-- 용량을 줄이기 위해 투찰 기록(bid_results)은 숫자만 저장하는 압축 설계를 씁니다 (실측 1행 약 129바이트).
-- 투찰 기록은 공개 데이터지만 다른 업체 정보가 섞여 있어, 화면에서는 직접 읽지 못하고
-- 회사 확인을 마친 회원 본인의 분석 함수(my_bid_report 등)로만 접근합니다.
-- =========================================================


-- 1. openings — 개찰된 공고 (낙찰정보서비스 개찰결과 목록 + 최종낙찰자 + 예정가격)
create table if not exists public.openings (
  id                serial primary key,
  bid_no            text not null,
  bid_ord           text not null,
  clsfc_no          text not null default '',
  rbid_no           text not null default '',
  bid_type          text not null,                 -- 물품·용역·공사
  title             text not null,
  org               text,                          -- 공고기관
  demand_org        text,                          -- 수요기관
  opened_at         timestamptz,                   -- 개찰일시
  status            text,                          -- 개찰완료 / 유찰 / 재입찰 등
  participants      int,                           -- 참가업체 수
  winner_bizno      bigint,                        -- 최종낙찰업체 사업자번호
  winner_amount     bigint,
  winner_rate       numeric(7,3),                  -- 최종낙찰률
  planned_price     bigint,                        -- 예정가격
  base_amount       bigint,                        -- 기초금액
  details_fetched   boolean not null default false,-- 투찰업체 순위를 받았는지
  updated_at        timestamptz not null default now(),
  unique (bid_no, bid_ord, clsfc_no, rbid_no)
);
create index if not exists openings_opened_idx  on public.openings (opened_at desc);
create index if not exists openings_pending_idx on public.openings (details_fetched) where details_fetched = false;
create index if not exists openings_winner_idx  on public.openings (winner_bizno);


-- 2. bid_results — 투찰 기록 (개찰완료 순위). 업체 × 개찰 1행
create table if not exists public.bid_results (
  opening_id  int not null references public.openings (id) on delete cascade,
  bizno       bigint not null,
  rank        smallint,                 -- 개찰순위 (하한선 미달 등은 비어 있음)
  amount      bigint,                   -- 투찰금액
  rate        numeric(7,3),             -- 투찰률
  note        smallint,                 -- null: 정상, 1: 낙찰하한선 미달, 2: 기타 (원문 비고는 저장하지 않음)
  primary key (opening_id, bizno)
);
create index if not exists bid_results_bizno_idx on public.bid_results (bizno);


-- 3. bid_companies — 투찰 업체명 (사업자번호 → 이름)
create table if not exists public.bid_companies (
  bizno       bigint primary key,
  name        text,
  updated_at  timestamptz not null default now()
);


-- 4. 보안: 개찰 공고는 누구나 읽기, 투찰 기록·업체명은 직접 읽기 금지 (아래 함수로만)
alter table public.openings      enable row level security;
alter table public.bid_results   enable row level security;
alter table public.bid_companies enable row level security;

drop policy if exists "개찰 공고는 누구나 읽기" on public.openings;
create policy "개찰 공고는 누구나 읽기" on public.openings for select to anon, authenticated using (true);
grant select on public.openings to anon, authenticated;
revoke all on public.bid_results, public.bid_companies from anon, authenticated;


-- 5. 회원 본인 회사의 사업자번호 (회사 확인을 마친 경우만)
create or replace function public.my_verified_bizno()
returns bigint language sql stable security definer set search_path = public as $$
  select nullif(regexp_replace(bizno, '\D', '', 'g'), '')::bigint
  from company_profiles
  where user_id = auth.uid() and corp_name is not null and bizno is not null
$$;


-- 6. 입찰 성적표 + 아깝게 놓친 공고 + 하한선 미달 (F7-1~F7-3)
--    p_years: 최근 몇 년 (기본 3)
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

  with mine as (
    select o.id, o.bid_no, o.bid_ord, o.bid_type, o.title, o.org, o.demand_org, o.opened_at, o.participants,
           o.winner_bizno, o.winner_rate, o.planned_price, o.base_amount,
           r.rank, r.amount, r.rate, r.note,
           (o.winner_bizno = me) as won,
           (select min(x.rate) from bid_results x where x.opening_id = o.id and x.rank = 1) as first_rate
    from bid_results r join openings o on o.id = r.opening_id
    where r.bizno = me and o.opened_at >= since
  )
  select jsonb_build_object(
    'verified', true,
    'years', p_years,
    'total', count(*),
    'won', count(*) filter (where won),
    'below_floor', count(*) filter (where note = 1),
    'avg_rate', round(avg(rate) filter (where note is null), 3),
    'avg_participants', round(avg(participants)),
    'near_misses', coalesce((
      select jsonb_agg(m order by m->>'gap')
      from (
        select jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rank', rank,
                 'rate', rate, 'first_rate', first_rate, 'gap', round(abs(rate - first_rate), 3), 'participants', participants) m
        from mine
        where not won and note is null and rank between 2 and 5 and first_rate is not null
        order by abs(rate - first_rate)
        limit 10
      ) t), '[]'::jsonb),
    'below_floor_list', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'org', org, 'opened_at', opened_at, 'rate', rate))
      from (select * from mine where note = 1 order by opened_at desc limit 10) t), '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_object_agg(bid_type, jsonb_build_object('total', n, 'won', w))
      from (select bid_type, count(*) n, count(*) filter (where won) w from mine group by bid_type) t), '{}'::jsonb),
    'top_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('org', org, 'total', n, 'won', w) order by n desc)
      from (select coalesce(demand_org, org) org, count(*) n, count(*) filter (where won) w
            from mine group by 1 order by 2 desc limit 5) t), '[]'::jsonb)
  ) into result
  from mine;

  return result;
end $$;


-- 7. 이력 기반 추천용 — 최근 참여한 개찰 공고 (공고명·기관·유형·금액·낙찰 여부)
create or replace function public.my_bid_history(p_years int default 3, p_limit int default 300)
returns table (title text, org text, demand_org text, bid_type text, opened_at timestamptz, amount bigint, won boolean, rank smallint)
language sql stable security definer set search_path = public as $$
  select o.title, o.org, o.demand_org, o.bid_type, o.opened_at, r.amount, o.winner_bizno = r.bizno, r.rank
  from bid_results r join openings o on o.id = r.opening_id
  where r.bizno = my_verified_bizno() and o.opened_at >= now() - make_interval(years => p_years)
  order by o.opened_at desc
  limit p_limit
$$;

revoke all on function public.my_verified_bizno() from anon, public;
revoke all on function public.my_bid_report(int) from anon, public;
revoke all on function public.my_bid_history(int, int) from anon, public;
grant execute on function public.my_bid_report(int) to authenticated;
grant execute on function public.my_bid_history(int, int) to authenticated;


-- 8. 수집 진행 상황 (운영 확인용, 누구나 읽기) — 투찰 기록 건수만
create or replace view public.bid_collect_stats as
  select (select count(*) from openings) as openings,
         (select count(*) from openings where details_fetched) as openings_detailed,
         (select reltuples::bigint from pg_class where relname = 'bid_results') as bid_rows_estimate,
         (select max(opened_at) from openings) as latest_opened_at;
grant select on public.bid_collect_stats to anon, authenticated;
