-- =========================================================
-- 005: 계약 중복 저장 방지
-- 같은 계약이 통합계약번호(id)만 다르게 두 번 등록되는 경우가 있어(나라장터 계약번호 동일),
-- 나라장터 계약번호(contract_no) 기준으로 한 건만 남기고 앞으로도 한 건만 저장합니다.
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 계약번호 칸 추가 (상세 주소의 ctrtNo, 없으면 통합계약번호)
alter table public.contracts add column if not exists contract_no text;

update public.contracts
set contract_no = coalesce(substring(detail_url from 'ctrtNo=([^&]+)'), id)
where contract_no is null;

-- 2. 이미 저장된 중복 정리 — 같은 계약번호 중 가장 나중에 등록된 한 건만 남김
delete from public.contracts c
using public.contracts d
where c.contract_no = d.contract_no
  and c.id <> d.id
  and (coalesce(c.registered_at, '-infinity') < coalesce(d.registered_at, '-infinity')
       or (coalesce(c.registered_at, '-infinity') = coalesce(d.registered_at, '-infinity') and c.id < d.id));

-- 3. 앞으로 같은 계약번호는 한 건만 (수집 배치가 이 기준으로 덮어씀)
alter table public.contracts alter column contract_no set not null;
create unique index if not exists contracts_contract_no_key on public.contracts (contract_no);

-- 확인: 남은 중복 수 (0이어야 정상)
select count(*) - count(distinct contract_no) as remaining_duplicates from public.contracts;
