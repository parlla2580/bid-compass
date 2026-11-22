-- =========================================================
-- 043: 과거분 이어 받기 진행 위치 (2026-11-22)
--  · 매시 수집이 끝난 뒤 과거 하루치씩 거꾸로 받음: 2026-02-28 → 2025-04-01 (2026-03 은 11/22 수동으로 받음)
--  · 이 표 한 줄이 '다음에 받을 날'을 기억. 수집기(scripts/collect.mjs)만 읽고 씀 — 회원은 볼 수 없음
--  · 멈추기: update public.backfill_state set next_day = stop_day - 1 where id = 1;
--  · 다시 시작·범위 바꾸기: next_day / stop_day 값만 바꾸면 됨
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다(진행 위치는 그대로 유지).
-- =========================================================

create table if not exists public.backfill_state (
  id int primary key default 1 check (id = 1),
  next_day date not null,          -- 다음에 받을 날 (거꾸로 내려감)
  stop_day date not null,          -- 여기까지 받으면 끝
  fails int not null default 0,    -- 같은 날 연속 실패 횟수 (3번이면 건너뜀)
  skipped date[] not null default '{}', -- 3번 실패해 건너뛴 날 (나중에 수동 재수집)
  updated_at timestamptz not null default now()
);
alter table public.backfill_state enable row level security;  -- 정책 없음 = 회원 접근 불가 (수집기는 관리자 키)
revoke all on public.backfill_state from anon, authenticated;

insert into public.backfill_state (id, next_day, stop_day)
values (1, date '2026-02-28', date '2025-04-01')
on conflict (id) do nothing;

-- 확인: next_day 2026-02-28 · stop_day 2025-04-01 한 줄이면 정상 (이미 진행 중이면 next_day 가 더 앞 날짜)
--  남은 일수도 함께 표시
select next_day, stop_day, (next_day - stop_day + 1) as days_left, fails, skipped, updated_at
from public.backfill_state;
