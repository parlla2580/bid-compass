-- =========================================================
-- 029: 회사 확인 — 본인이 '확인 해제'할 수 있게 + 지금 확인 기록 점검 (2026-11-18)
--
-- 배경: 마이페이지는 '회사 확인하기'를 보여 주는데 입찰 분석은 열려 있는 계정이 있었음.
--   입찰 분석은 서버 기록(company_verifications)으로 열리고, 마이페이지는 이 기기의 업체명으로 판단해서 어긋남.
--   016을 실행할 때 '그때 업체명이 있던 회원'을 대표자 대조 없이 확인됨으로 옮긴 기록도 섞여 있을 수 있음.
--   → 화면은 서버 기록을 그대로 보여 주고, 회원이 직접 '확인 해제' 후 다시 확인할 수 있게 함
--
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 본인 확인 기록만 지울 수 있게 (쓰기·고치기는 계속 서버 관리자 키만)
grant delete on public.company_verifications to authenticated;
drop policy if exists "own verification delete" on public.company_verifications;
create policy "own verification delete" on public.company_verifications for delete using (auth.uid() = user_id);

-- 점검: 지금 확인 기록 (가입 이메일·대표자명은 저장돼 있지 않음)
--   같은 시각에 여러 건이 한꺼번에 있으면 016 실행 때 옮긴 기록이에요
select corp_name, left(bizno, 3) || '-**-*****' as bizno, verified_at,
       count(*) over (partition by verified_at) as same_time
from public.company_verifications
order by verified_at desc;
