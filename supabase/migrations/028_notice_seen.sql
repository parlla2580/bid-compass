-- =========================================================
-- 028: 열어 본 공고 기록 — 휴대폰·PC가 같은 '봤음' 상태 (2026-11-18 사용자 요청)
--  · 회원 1명당 1행: 열어 본 공고 id 목록(최근 것 20,000개) + 지난 확인 때 목록의 가장 큰 공고 id
--    (공고 id는 처음 수집될 때 매겨지고 계속 커짐 → '지난번 이후 새로 들어온 공고' = 그 id보다 큰 공고)
--  · 본인 행만 읽기, 쓰기는 mark_seen / set_list_mark 함수로만
--  · 실행 전에는 화면이 이 기기(브라우저)에만 저장
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

create table if not exists public.notice_seen (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  ids        int[] not null default '{}',
  list_mark  int,                       -- 지난 확인 때 목록의 가장 큰 공고 id
  updated_at timestamptz not null default now()
);
alter table public.notice_seen enable row level security;

drop policy if exists "own seen read" on public.notice_seen;
create policy "own seen read" on public.notice_seen for select using (auth.uid() = user_id);

-- 열어 본 공고 추가 (합치고 중복 제거, 최근 공고 20,000개만 유지)
create or replace function public.mark_seen(p_ids int[])
returns void language sql security definer set search_path = public as $$
  insert into notice_seen (user_id, ids)
  select auth.uid(), coalesce((select array_agg(x order by x desc) from (select distinct unnest(p_ids) x limit 20000) t), '{}')
  where auth.uid() is not null
  on conflict (user_id) do update set
    ids = (select array_agg(x order by x desc) from (
             select x from (select distinct unnest(notice_seen.ids || excluded.ids) x) u order by x desc limit 20000) t),
    updated_at = now();
$$;

-- 지난 확인 표시 (목록의 가장 큰 공고 id) — 뒤로 가지 않게 큰 값만
create or replace function public.set_list_mark(p_mark int)
returns void language sql security definer set search_path = public as $$
  insert into notice_seen (user_id, list_mark)
  select auth.uid(), p_mark where auth.uid() is not null
  on conflict (user_id) do update set list_mark = greatest(coalesce(notice_seen.list_mark, 0), excluded.list_mark), updated_at = now();
$$;

revoke all on function public.mark_seen(int[]) from public, anon;
revoke all on function public.set_list_mark(int) from public, anon;
grant execute on function public.mark_seen(int[]) to authenticated;
grant execute on function public.set_list_mark(int) to authenticated;

-- 확인
select count(*) as rows from public.notice_seen;
