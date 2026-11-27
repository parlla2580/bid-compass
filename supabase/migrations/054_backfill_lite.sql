-- =========================================================
-- 054: 공고·사전규격 과거분 더 받기 (2026-11-27 사용자 결정: 2024-01까지)
--  · 043 과거분(공고·개찰·계약·사전규격, ~2025-04-01)과 별도로, 공고·사전규격만 2025-03-31 → 2024-01-01 거꾸로
--  · 매시 수집이 043 과거분을 받은 뒤 남는 시간에 하루치씩 (공고·사전규격만이라 가벼움, 실행당 최대 20일)
--  · 진행 위치: select * from public.backfill_lite;  멈추기: update public.backfill_lite set next_day = stop_day - 1 where id = 1;
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다(진행 위치 유지).
-- =========================================================

create table if not exists public.backfill_lite (
  id int primary key default 1 check (id = 1),
  next_day date not null,
  stop_day date not null,
  fails int not null default 0,
  skipped date[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.backfill_lite enable row level security;  -- 정책 없음 = 회원 접근 불가 (수집기는 관리자 키)
revoke all on public.backfill_lite from anon, authenticated;

insert into public.backfill_lite (id, next_day, stop_day)
values (1, date '2025-03-31', date '2024-01-01')
on conflict (id) do nothing;

-- 확인: next_day 2025-03-31 · stop_day 2024-01-01 · 남은 날 456 (이미 진행 중이면 더 적음)
select next_day, stop_day, (next_day - stop_day + 1) as days_left, fails, skipped from public.backfill_lite;
