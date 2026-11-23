-- =========================================================
-- 049: 시장 분석·영업 시간 초과 고치기 (2026-11-23)
--  · 과거분이 쌓이며 시장 분석(my_market·my_missed)이 API 제한 8초를 넘어 실패, 영업(계약 세부 조회)도 실패
--  · 시장 분석: 업계 비교(038)처럼 결과를 회사별로 저장해 두고 바로 돌려줌
--      - DB 예약 'analysis-cache' 가 매시 37분에 회사 확인 회원 결과를 미리 계산 (DB 안 예약은 시간 제한 없음)
--      - 시장 분석 20시간 · 놓친 공고(지금 열린 공고 포함) 3시간 지나면 다시 계산
--  · 영업: 계약 세부에 (품목 코드, 계약일) 색인 — 만드는 데 몇 분 걸려 DB 예약으로 한 번 실행
--  · 예약 계산은 회원 로그인 없이 돌아야 해서 my_verified_bizno() 가 'DB 관리자 세션 + app.as_bizno 설정'일 때만 그 값을 씀
--    (회원 요청은 세션이 authenticator 라 이 길로 들어올 수 없음)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 회사 확인 번호 — 예약 계산용 우회 (postgres 세션에서만)
create or replace function public.my_verified_bizno()
returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(
    case when session_user = 'postgres' then nullif(current_setting('app.as_bizno', true), '')::bigint end,
    (select nullif(regexp_replace(v.bizno, '\D', '', 'g'), '')::bigint
     from company_verifications v
     join company_profiles p on p.user_id = v.user_id
     where v.user_id = auth.uid()
       and regexp_replace(coalesce(p.bizno, ''), '\D', '', 'g') = regexp_replace(v.bizno, '\D', '', 'g')))
$$;
revoke all on function public.my_verified_bizno() from anon, public;
grant execute on function public.my_verified_bizno() to authenticated;

-- 2. 원래 계산 함수는 이름만 바꿔 보관 (회원은 직접 못 부름)
do $$
begin
  if to_regprocedure('public.my_market_live(int, text)') is null and to_regprocedure('public.my_market(int, text)') is not null then
    alter function public.my_market(int, text) rename to my_market_live;
  end if;
  if to_regprocedure('public.my_missed_live(int, text)') is null and to_regprocedure('public.my_missed(int, text)') is not null then
    alter function public.my_missed(int, text) rename to my_missed_live;
  end if;
end $$;
revoke all on function public.my_market_live(int, text) from anon, authenticated, public;
revoke all on function public.my_missed_live(int, text) from anon, authenticated, public;

-- 3. 저장소
create table if not exists public.analysis_cache (
  bizno  bigint not null,
  kind   text not null,          -- market | missed
  arg    text not null,          -- '3|' · '3|물품:432115' · '90|' ...
  result jsonb not null,
  at     timestamptz not null default now(),
  primary key (bizno, kind, arg)
);
alter table public.analysis_cache enable row level security;  -- 정책 없음 = 회원 직접 접근 불가 (함수만)
revoke all on public.analysis_cache from anon, authenticated;

-- 4. 회원이 부르는 함수 (이름·인자 그대로 — 화면 코드 변경 없음)
create or replace function public.my_market(p_years int default 3, p_market text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me bigint := my_verified_bizno(); k text := p_years || '|' || coalesce(p_market, ''); r jsonb;
begin
  if me is null then return jsonb_build_object('verified', false); end if;
  select result into r from analysis_cache where bizno = me and kind = 'market' and arg = k and at > now() - interval '20 hours';
  if r is not null then return r; end if;
  r := my_market_live(p_years, p_market);               -- 저장된 게 없으면 바로 계산 (큰 회사는 시간 초과될 수 있음 → 예약 계산이 채움)
  insert into analysis_cache (bizno, kind, arg, result) values (me, 'market', k, r)
  on conflict (bizno, kind, arg) do update set result = excluded.result, at = now();
  return r;
end $$;
revoke all on function public.my_market(int, text) from anon, public;
grant execute on function public.my_market(int, text) to authenticated;

create or replace function public.my_missed(p_days int default 90, p_market text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me bigint := my_verified_bizno(); k text := p_days || '|' || coalesce(p_market, ''); r jsonb;
begin
  if me is null then return jsonb_build_object('verified', false); end if;
  select result into r from analysis_cache where bizno = me and kind = 'missed' and arg = k and at > now() - interval '3 hours';
  if r is not null then return r; end if;
  r := my_missed_live(p_days, p_market);
  insert into analysis_cache (bizno, kind, arg, result) values (me, 'missed', k, r)
  on conflict (bizno, kind, arg) do update set result = excluded.result, at = now();
  return r;
end $$;
revoke all on function public.my_missed(int, text) from anon, public;
grant execute on function public.my_missed(int, text) to authenticated;

-- 5. 미리 계산 — 회사 확인 회원마다 전체 시장 + 시장별(최대 8개)
create or replace function public.refresh_analysis_cache()
returns int language plpgsql volatile security definer set search_path = public as $$
declare b bigint; r jsonb; m text; n int := 0;
begin
  for b in select distinct nullif(regexp_replace(bizno, '\D', '', 'g'), '')::bigint from company_verifications where bizno is not null loop
    continue when b is null;
    perform set_config('app.as_bizno', b::text, true);
    if not exists (select 1 from analysis_cache where bizno = b and kind = 'market' and arg = '3|' and at > now() - interval '20 hours') then
      r := my_market_live(3, null);
      insert into analysis_cache values (b, 'market', '3|', r, now()) on conflict (bizno, kind, arg) do update set result = excluded.result, at = now();
      for m in select x->>'key' from jsonb_array_elements(coalesce(r->'markets', '[]'::jsonb)) x loop
        insert into analysis_cache values (b, 'market', '3|' || m, my_market_live(3, m), now())
        on conflict (bizno, kind, arg) do update set result = excluded.result, at = now();
      end loop;
      n := n + 1;
    end if;
    if not exists (select 1 from analysis_cache where bizno = b and kind = 'missed' and arg = '90|' and at > now() - interval '2 hours') then
      insert into analysis_cache values (b, 'missed', '90|', my_missed_live(90, null), now())
      on conflict (bizno, kind, arg) do update set result = excluded.result, at = now();
    end if;
  end loop;
  perform set_config('app.as_bizno', '', true);
  return n;
end $$;
revoke all on function public.refresh_analysis_cache() from anon, authenticated, public;

select cron.schedule('analysis-cache', '37 * * * *', $job$select public.refresh_analysis_cache()$job$);
-- 지금 한 번 (1분 안, 스스로 예약 삭제)
select cron.schedule('analysis-cache-now', '* * * * *',
  $job$select public.refresh_analysis_cache(); select cron.unschedule('analysis-cache-now');$job$);

-- 6. 영업 — 계약 세부 (품목 코드, 계약일) 색인 (한 번만, 스스로 예약 삭제)
select cron.schedule('idx-contract-lines', '* * * * *',
  $job$create index if not exists contract_lines_code_date_idx on public.contract_lines (code, contract_date desc); select cron.unschedule('idx-contract-lines');$job$);

-- 확인: 예약 3줄(analysis-cache · analysis-cache-now · idx-contract-lines). now·idx 는 몇 분 뒤 사라짐
select jobname, schedule from cron.job where jobname in ('analysis-cache', 'analysis-cache-now', 'idx-contract-lines') order by jobname;
