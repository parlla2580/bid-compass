-- =========================================================
-- 016: 회사 확인을 서버만 기록 + API 호출 제한
--
--  [보안 구멍] 지금까지 '회사 확인 완료'(업체명)를 브라우저가 company_profiles 에 직접 저장했다.
--   로그인한 사람이 자기 프로필의 사업자번호·업체명을 바꾸면 남의 회사 입찰 분석을 볼 수 있었다.
--  [고침]
--   1. company_verifications — 서버(관리자 키)만 쓰는 회사 확인 기록. 회원은 자기 것 읽기만
--   2. my_verified_bizno() — 이 표 + 현재 프로필 사업자번호가 같을 때만 인정
--      (모든 분석 함수가 이 함수로 본인 회사를 정하므로 한 곳만 바꾸면 전부 막힘)
--   3. api_hits / rl_hit() — 회사 조회·확인 API 호출 횟수 제한 (서버만 호출, IP·사업자번호는 해시로만 저장)
--
-- 실행 순서: 이 SQL 실행 → Vercel 환경변수에 SUPABASE_SECRET_KEY 추가 → 재배포
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 회사 확인 기록
create table if not exists public.company_verifications (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  bizno       text not null,
  corp_name   text not null,
  verified_at timestamptz not null default now()
);
alter table public.company_verifications enable row level security;
drop policy if exists "own verification read" on public.company_verifications;
create policy "own verification read" on public.company_verifications for select using (auth.uid() = user_id);
-- 쓰기 정책은 만들지 않음 → 회원(anon·authenticated)은 쓸 수 없고 관리자 키만 씀
revoke insert, update, delete on public.company_verifications from anon, authenticated;

-- 기존 회원 이전: 지금까지 가입 때 확인된 회원(업체명 있음)을 그대로 옮김 (현재 회원은 시험 계정뿐)
insert into public.company_verifications (user_id, bizno, corp_name)
select user_id, regexp_replace(bizno, '\D', '', 'g'), corp_name
from public.company_profiles
where corp_name is not null and bizno is not null
on conflict (user_id) do nothing;

-- 2. 본인 회사 = 서버가 확인한 사업자번호이면서, 지금 프로필 사업자번호와 같을 때만
create or replace function public.my_verified_bizno()
returns bigint language sql stable security definer set search_path = public as $$
  select nullif(regexp_replace(v.bizno, '\D', '', 'g'), '')::bigint
  from company_verifications v
  join company_profiles p on p.user_id = v.user_id
  where v.user_id = auth.uid()
    and regexp_replace(coalesce(p.bizno, ''), '\D', '', 'g') = regexp_replace(v.bizno, '\D', '', 'g')
$$;
revoke all on function public.my_verified_bizno() from anon, public;
grant execute on function public.my_verified_bizno() to authenticated;

-- 3. 호출 제한 — key 는 서버가 만든 해시(원래 IP·사업자번호는 저장하지 않음)
create table if not exists public.api_hits (
  key text not null,
  at  timestamptz not null default now()
);
create index if not exists api_hits_key_at_idx on public.api_hits (key, at desc);
alter table public.api_hits enable row level security; -- 정책 없음 → 회원은 읽기·쓰기 불가

-- 이번 호출을 기록하고, 창(window) 안 호출 수가 max 이하면 true
create or replace function public.rl_hit(p_key text, p_window_sec int, p_max int)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into api_hits (key) values (p_key);
  select count(*) into n from api_hits where key = p_key and at > now() - make_interval(secs => p_window_sec);
  -- 가끔 하루 지난 기록 정리
  if random() < 0.01 then delete from api_hits where at < now() - interval '2 days'; end if;
  return n <= p_max;
end $$;
revoke all on function public.rl_hit(text, int, int) from anon, authenticated, public;

-- 확인
select (select count(*) from public.company_verifications) as verified_members,
       has_function_privilege('anon', 'public.rl_hit(text,int,int)', 'execute') as anon_can_hit;  -- false 여야 정상
