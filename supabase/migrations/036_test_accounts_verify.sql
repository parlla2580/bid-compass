-- =========================================================
-- 036: [테스트 전용] 테스트 계정 3개를 '회사 확인됨'으로 (2026-11-21 전체 사용성 테스트)
--  · 대상: test-goods / test-build / test-clean @example.com (각 계정 프로필의 사업자번호 그대로)
--  · 입찰 분석·업계 비교·개찰 결과 차이 화면을 테스트 계정으로 보기 위함 — 대표자명 대조 없이 넣는 기록
--  · 되돌리기: 각 계정 마이페이지 > 회사 확인 > '확인 해제' (029), 또는 출시 전 테스트 계정 삭제
--  · 다른 회원 기록은 건드리지 않음
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

with t as (
  select u.id as user_id, regexp_replace(p.bizno, '\D', '', 'g') as bizno,
         coalesce((select c.name from public.bid_companies c
                   where c.bizno = nullif(regexp_replace(p.bizno, '\D', '', 'g'), '')::bigint), '테스트 업체') as corp_name
  from auth.users u join public.company_profiles p on p.user_id = u.id
  where u.email in ('test-goods@example.com', 'test-build@example.com', 'test-clean@example.com')
    and p.bizno is not null
),
v as (
  insert into public.company_verifications (user_id, bizno, corp_name)
  select user_id, bizno, corp_name from t
  on conflict (user_id) do update set bizno = excluded.bizno, corp_name = excluded.corp_name
  returning user_id
)
update public.company_profiles p set corp_name = t.corp_name
from t where p.user_id = t.user_id;

-- 확인: 3줄이 나오고 bids(그 회사 투찰 기록 수)가 보이면 정상
select u.email, v.corp_name,
       (select count(*) from public.bid_results r where r.bizno = v.bizno::bigint) as bids
from public.company_verifications v join auth.users u on u.id = v.user_id
where u.email like 'test-%@example.com'
order by u.email;
