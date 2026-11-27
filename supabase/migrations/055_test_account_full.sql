-- =========================================================
-- 055: [테스트 전용] 1@naver.com 을 '모든 기능이 보이는' 계정으로 (2026-11-27 사용자 요청)
--  · 계정은 이미 만들어 둠 — 이 SQL 은 회사·설정·저장 목록만 채움 (비밀번호는 저장소에 적지 않음)
--  · test-goods@example.com 의 회사 정보(사업자번호·업종·주요 품목·추천 설정·적격 점수)와 회사 확인을 그대로 복사
--    → 입찰 분석·시장 분석·업계 비교·영업·알림 해설·주간 리포트가 모두 열림
--  · 저장한 기관 3곳 + 지금 열린 공고 저장 3건(마감 가까운 순) — 기관 › 저장, 알림함, 마감 임박이 보이게
--  · ⚠ 실제 회사 기록이 보이는 계정: 오픈 전 반드시 삭제 (Authentication › Users 에서 삭제하면 관련 행도 함께 지워짐)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

do $$
declare
  me uuid := (select id from auth.users where email = '1@naver.com');
  src uuid := (select id from auth.users where email = 'test-goods@example.com');
begin
  if me is null then raise exception '1@naver.com 계정이 없음'; end if;
  if src is null then raise exception 'test-goods@example.com 계정이 없음 (복사할 회사 정보 없음)'; end if;

  -- 1) 회사 정보 그대로 복사 (열 이름을 따로 적지 않아 열이 늘어도 그대로 복사됨)
  delete from public.company_profiles where user_id = me;
  insert into public.company_profiles
  select (jsonb_populate_record(null::public.company_profiles, to_jsonb(p) || jsonb_build_object('user_id', me))).*
  from public.company_profiles p where p.user_id = src;

  -- 2) 회사 확인 기록
  insert into public.company_verifications (user_id, bizno, corp_name)
  select me, v.bizno, v.corp_name from public.company_verifications v where v.user_id = src
  on conflict (user_id) do update set bizno = excluded.bizno, corp_name = excluded.corp_name;

  -- 3) 저장한 기관 3곳 (이 회사가 많이 투찰한 기관)
  insert into public.saved_orgs (user_id, org, kind, watch)
  select me, org, null, '[]'::jsonb from (values ('한국과학기술정보연구원'), ('한국해양과학기술원'), ('조달청')) t(org)
  on conflict (user_id, org) do nothing;

  -- 4) 저장한 공고 3건 — 지금 열린 물품 공고 중 컴퓨터·서버 관련, 마감 가까운 순
  insert into public.saved_notices (user_id, notice_id)
  select me, n.id from public.notices n
  where n.closes_at > now() + interval '1 day' and n.bid_type = '물품' and n.title ~ '(컴퓨터|서버|워크스테이션|노트북)'
  order by n.closes_at asc limit 3
  on conflict do nothing;
end $$;

-- 확인: 한 줄에 회사명 · 확인 여부 · 저장한 기관 3 · 저장한 공고 3
select u.email, p.corp_name, (v.user_id is not null) as verified,
       (select count(*) from public.saved_orgs s where s.user_id = u.id) as saved_orgs,
       (select count(*) from public.saved_notices s where s.user_id = u.id) as saved_notices
from auth.users u
left join public.company_profiles p on p.user_id = u.id
left join public.company_verifications v on v.user_id = u.id
where u.email = '1@naver.com';
