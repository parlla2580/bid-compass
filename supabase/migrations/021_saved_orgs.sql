-- =========================================================
-- 021: 저장한 기관 (영업 기회 → 알림, 기획 17.1)
--  · 회원이 [영업 기회]에서 저장한 구매기관과, 저장할 때 본 '진행 중 계약'(끝나는 날) 목록
--  · 알림함이 이 목록으로 "저장한 기관의 계약이 곧 끝나요"를, 공고 목록으로 "저장한 기관이 새 공고를 냈어요"를 만듦
--  · watch 예: [{"id":"R26TE...","title":"2027년 무인민원발급기 유지보수","end":"2027-12-31"}]
--  · 본인 행만 읽고 쓰기
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create table if not exists public.saved_orgs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  org        text not null,
  kind       text,
  watch      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, org)
);
alter table public.saved_orgs enable row level security;

drop policy if exists "own orgs read"   on public.saved_orgs;
drop policy if exists "own orgs write"  on public.saved_orgs;
drop policy if exists "own orgs update" on public.saved_orgs;
drop policy if exists "own orgs delete" on public.saved_orgs;
create policy "own orgs read"   on public.saved_orgs for select using (auth.uid() = user_id);
create policy "own orgs write"  on public.saved_orgs for insert with check (auth.uid() = user_id);
create policy "own orgs update" on public.saved_orgs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own orgs delete" on public.saved_orgs for delete using (auth.uid() = user_id);

-- 확인 (처음엔 0)
select count(*) as saved_orgs from public.saved_orgs;
