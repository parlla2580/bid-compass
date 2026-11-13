-- =========================================================
-- 019: 알림함 상태 (기획 16장 A1 — 알림함·입찰 진행 추적)
--  · 알림 자체는 화면이 그때그때 만들고(1순위 서류, 마감 임박, 결과 확정, 새 맞춤 공고),
--    회원별 '읽음 / 제출했어요 / 체크한 서류'만 여기에 저장 → 휴대폰과 PC가 같은 상태
--  · item_key 예: 'first:12345'(1순위 서류), 'result:12345'(결과), 'due:678'(저장 공고 마감), 'new:2026-11-13'
--  · 본인 행만 읽고 쓰기
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create table if not exists public.inbox_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_key   text not null,
  read_at    timestamptz,
  done_at    timestamptz,
  checks     text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table public.inbox_state enable row level security;

drop policy if exists "own inbox read"   on public.inbox_state;
drop policy if exists "own inbox write"  on public.inbox_state;
drop policy if exists "own inbox update" on public.inbox_state;
drop policy if exists "own inbox delete" on public.inbox_state;
create policy "own inbox read"   on public.inbox_state for select using (auth.uid() = user_id);
create policy "own inbox write"  on public.inbox_state for insert with check (auth.uid() = user_id);
create policy "own inbox update" on public.inbox_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own inbox delete" on public.inbox_state for delete using (auth.uid() = user_id);

-- 확인
select count(*) as rows from public.inbox_state;
