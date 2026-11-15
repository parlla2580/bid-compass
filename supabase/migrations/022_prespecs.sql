-- =========================================================
-- 022: 사전규격 (곧 나올 공고, 기획 17.3 · API 로드맵 1순위)
--  · prespecs — 조달청 사전규격정보서비스(HrcspSsstndrdInfoService) 물품·용역·공사
--      정식 공고 전에 규격서·배정예산을 공개하고 의견을 받는 단계 → "곧 나올 공고"
--      담당자 이름·전화번호는 개인정보라 저장하지 않음
--  · notices.pre_no — 공고 원본의 사전규격등록번호(bfSpecRgstNo) → 사전규격이 실제 공고로 나왔는지 연결
--  · recent_prespecs(days) — 최근 사전규격 + 연결된 공고 id (화면·스냅샷용)
-- 공개 조달 데이터라 누구나 읽기, 쓰기는 수집기(관리자 키)만
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- (2번 notices.pre_no는 공고 표를 한 번 고쳐 써서 수십 초 걸릴 수 있어요)
-- =========================================================

-- 1. 사전규격
create table if not exists public.prespecs (
  id             text primary key,        -- 사전규격등록번호 (bfSpecRgstNo)
  kind           text not null,           -- 물품 / 용역 / 공사
  biz_div        text,                    -- 업무구분 원문 (일반용역·기술용역 등)
  title          text not null,           -- 품명(사업명)
  org            text,                    -- 발주기관
  demand_org     text,                    -- 실수요기관
  budget         numeric,                 -- 배정예산
  received_at    timestamptz,             -- 접수일시
  opinion_close  timestamptz,             -- 의견 등록 마감
  delivery_until date,                    -- 납품기한
  delivery_days  int,                     -- 납품일수
  sw             boolean,                 -- SW사업 대상 여부
  products       jsonb not null default '[]'::jsonb,  -- [{code, name}] 물품 세부품명
  files          text[] not null default '{}',        -- 규격서 내려받기 주소
  notice_nos     text[] not null default '{}',        -- 사전규격에 적힌 입찰공고번호
  registered_at  timestamptz,
  changed_at     timestamptz,
  collected_at   timestamptz not null default now()
);
create index if not exists prespecs_received_idx on public.prespecs (received_at desc);
create index if not exists prespecs_close_idx    on public.prespecs (opinion_close);

alter table public.prespecs enable row level security;
drop policy if exists "사전규격은 누구나 읽기" on public.prespecs;
create policy "사전규격은 누구나 읽기" on public.prespecs for select to anon, authenticated using (true);
grant select on public.prespecs to anon, authenticated;

-- 2. 공고 → 사전규격 연결
alter table public.notices add column if not exists pre_no text generated always as (nullif(raw->>'bfSpecRgstNo', '')) stored;
create index if not exists notices_pre_no_idx on public.notices (pre_no) where pre_no is not null;

-- 3. 최근 사전규격 + 실제 공고(가장 최근 차수) 연결
create or replace function public.recent_prespecs(p_days int default 30)
returns table (
  id text, kind text, title text, org text, demand_org text, budget numeric,
  received_at timestamptz, opinion_close timestamptz, delivery_until date, sw boolean,
  products jsonb, files text[], notice_id bigint, notice_closes_at timestamptz
)
language sql stable
set search_path = public
as $$
  select p.id, p.kind, p.title, p.org, p.demand_org, p.budget,
         p.received_at, p.opinion_close, p.delivery_until, p.sw,
         p.products, p.files, n.id, n.closes_at
  from public.prespecs p
  left join lateral (
    select x.id, x.closes_at from public.notices x
    where x.pre_no = p.id or x.bid_no = any (array(select split_part(t, '-', 1) from unnest(p.notice_nos) t))
    order by x.bid_ord desc limit 1
  ) n on true
  where p.received_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
  order by p.received_at desc
$$;
grant execute on function public.recent_prespecs(int) to anon, authenticated;

-- 확인: 사전규격 수(처음엔 0) · 사전규격번호가 있는 공고 수
select (select count(*) from public.prespecs) as prespecs,
       (select count(*) from public.notices where pre_no is not null) as notices_with_prespec;
