-- =========================================================
-- 013: 맞춤 공고 정교화 P3·P7
--  · company_profiles.keywords — 꼭 볼 단어(plus) / 빼고 싶은 단어(minus)
--  · org_competition — 기관·유형별 최근 1년 참가업체 수 중앙값 (경쟁 강도, 누구나 읽기)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 꼭 볼 단어 / 빼고 싶은 단어  {"plus": ["CCTV"], "minus": ["유지보수"]}
alter table public.company_profiles add column if not exists keywords jsonb not null default '{}'::jsonb;

-- 2. 기관·유형별 경쟁 강도 — 2곳 이상 들어온 개찰만 (1곳 수의견적 제외)
create or replace view public.org_competition as
  select coalesce(demand_org, org) as org,
         bid_type,
         count(*)::int as openings,
         percentile_cont(0.5) within group (order by participants)::int as median_participants
  from public.openings
  where participants >= 2
    and opened_at >= now() - interval '1 year'
    and coalesce(demand_org, org) is not null
  group by 1, 2
  having count(*) >= 3;

grant select on public.org_competition to anon, authenticated;

-- 확인
select count(*) as orgs from public.org_competition;
