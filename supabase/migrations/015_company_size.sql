-- =========================================================
-- 015: 기업규모에 '소기업·소상공인' 추가
--  · 물품·용역 추정가격 1억 원 미만 제한경쟁 공고는 소기업·소상공인만 참여하는 경우가 많아
--    (판로지원법 시행령 제2조의2) 중소기업과 구분해야 맞춤 판정이 됩니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- company_size 에 걸린 기존 제한(이름이 무엇이든)을 찾아 지움
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.company_profiles'::regclass and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%company_size%'
  loop
    execute format('alter table public.company_profiles drop constraint %I', c);
  end loop;
end $$;
alter table public.company_profiles add constraint company_profiles_company_size_check
  check (company_size in ('소기업·소상공인', '중소기업', '중견기업', '대기업'));

-- 확인: 기업규모별 회원 수
select coalesce(company_size, '(미입력)') as company_size, count(*) from public.company_profiles group by 1 order by 2 desc;
