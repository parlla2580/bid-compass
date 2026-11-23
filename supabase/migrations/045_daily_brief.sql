-- =========================================================
-- 045: 일일 수집 브리핑 (2026-11-22) — 매일 09:00(한국시간) 데이터별 기간·건수·용량 + 이슈를 GitHub 이슈 댓글로
--  · ops_daily_brief(): 수집기(관리자 키)만 부를 수 있는 집계 함수. 하루 한 번 스냅샷을 ops_brief_log 에 남겨 전날과 비교
--  · trigger_workflow(): 039 의 수집 예약과 같은 토큰(Vault github_collect_token)으로 다른 워크플로도 실행 요청
--  · pg_cron 'brief-daily' 매일 00:00 UTC(= 09:00 한국시간) → .github/workflows/brief.yml
--  · 행 수: 큰 표(계약·계약 세부·투찰 순위)는 통계 추정치, 나머지는 정확한 수
--  · (11/23 수정) SQL 편집기는 전체를 한 묶음으로 실행해 마지막 미리 보기가 실패하면 함수까지 모두 취소됨 → 미리 보기 제거
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 날짜별 스냅샷 (전날 대비 증가량 계산용)
create table if not exists public.ops_brief_log (
  day date primary key,
  data jsonb not null,
  at timestamptz not null default now()
);
alter table public.ops_brief_log enable row level security;  -- 정책 없음 = 회원 접근 불가
revoke all on public.ops_brief_log from anon, authenticated;

-- 2. 집계
create or replace function public.ops_daily_brief()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t jsonb := '{}'::jsonb;
  r jsonb;
  est bigint;
  runs jsonb;
  bf jsonb;
  trig jsonb;
  out jsonb;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  -- 데이터별 건수·기간·크기
  select jsonb_build_object('rows', count(*), 'from', min(posted_at)::date, 'to', max(posted_at)::date,
         'bytes', pg_total_relation_size('public.notices')) into r from public.notices;
  t := t || jsonb_build_object('notices', r);
  select jsonb_build_object('rows', count(*), 'from', min(opened_at)::date, 'to', max(opened_at)::date,
         'bytes', pg_total_relation_size('public.openings'),
         'pending', count(*) filter (where not details_fetched and (status = '개찰완료' or status is null))) into r from public.openings;
  t := t || jsonb_build_object('openings', r);
  select greatest(reltuples, 0)::bigint into est from pg_class where oid = 'public.contracts'::regclass;
  t := t || jsonb_build_object('contracts', jsonb_build_object('rows', est, 'estimate', true,
         'from', (select min(contract_date) from public.contracts), 'to', (select max(contract_date) from public.contracts),
         'bytes', pg_total_relation_size('public.contracts')));
  r := null;
  select jsonb_build_object('rows', count(*), 'from', min(received_at)::date, 'to', max(received_at)::date,
         'bytes', pg_total_relation_size('public.prespecs')) into r from public.prespecs;
  t := t || jsonb_build_object('prespecs', r);
  -- 큰 표는 추정치 (정확한 수는 수십 초 걸릴 수 있음)
  select greatest(reltuples, 0)::bigint into est from pg_class where oid = 'public.contract_lines'::regclass;
  t := t || jsonb_build_object('contract_lines', jsonb_build_object('rows', est, 'estimate', true,
         'from', (select contract_date from public.contract_lines where contract_date is not null order by contract_date asc limit 1),
         'to', (select contract_date from public.contract_lines where contract_date is not null order by contract_date desc limit 1),
         'bytes', pg_total_relation_size('public.contract_lines')));
  select greatest(reltuples, 0)::bigint into est from pg_class where oid = 'public.bid_results'::regclass;
  t := t || jsonb_build_object('bid_results', jsonb_build_object('rows', est, 'estimate', true,
         'bytes', pg_total_relation_size('public.bid_results')));

  -- 최근 24시간 수집 실행
  select jsonb_build_object(
    'total', count(*),
    'ok', count(*) filter (where status = 'ok'),
    'partial', count(*) filter (where status = 'partial'),
    'failed', count(*) filter (where status = 'failed'),
    'running', count(*) filter (where status = 'running'),
    'api_calls', coalesce(sum(api_calls), 0),
    'errors', coalesce(jsonb_agg(left(message, 300) order by started_at desc) filter (where status in ('partial', 'failed')), '[]'::jsonb),
    'max_gap_min', (select round(max(g) / 60) from (
        select extract(epoch from started_at - lag(started_at) over (order by started_at)) as g
        from public.collect_runs where started_at > now() - interval '24 hours' and status in ('ok', 'partial')) x)
  ) into runs from public.collect_runs where started_at > now() - interval '24 hours';

  -- 과거분 받기 (043) — 없으면 null
  begin
    select to_jsonb(b) - 'id' into bf from public.backfill_state b where id = 1;
  exception when others then bf := null;
  end;

  -- 수집 예약 요청의 GitHub 응답 (pg_net 6시간 보관)
  begin
    select jsonb_build_object('total', count(*), 'bad', count(*) filter (where status_code is null or status_code >= 300))
      into trig from net._http_response where created > now() - interval '6 hours';
  exception when others then trig := null;
  end;

  out := jsonb_build_object(
    'day', today,
    'db_bytes', pg_database_size(current_database()),
    'tables', t,
    'runs', runs,
    'backfill', bf,
    'trigger', trig,
    'token', (select to_jsonb(x) from public.collect_token_expiry() x limit 1));

  -- 오늘 스냅샷 저장(같은 날 다시 부르면 덮어씀) + 전날 스냅샷 함께 돌려줌
  insert into public.ops_brief_log (day, data) values (today, out)
  on conflict (day) do update set data = excluded.data, at = now();
  return out || jsonb_build_object('prev', (select data from public.ops_brief_log where day < today order by day desc limit 1));
end $$;
revoke all on function public.ops_daily_brief() from anon, authenticated, public;
grant execute on function public.ops_daily_brief() to service_role;

-- 3. 워크플로 실행 요청 (039 trigger_collect 와 같은 토큰)
create or replace function public.trigger_workflow(p_file text, p_inputs jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare tok text; req bigint;
begin
  if p_file !~ '^[a-z0-9_-]+\.yml$' then raise exception '워크플로 파일 이름이 이상함: %', p_file; end if;
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'github_collect_token';
  if tok is null then raise notice 'github_collect_token 없음'; return null; end if;
  select net.http_post(
    url := 'https://api.github.com/repos/parlla2580/bid-compass/actions/workflows/' || p_file || '/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', p_inputs),
    headers := jsonb_build_object('Authorization', 'Bearer ' || tok, 'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28', 'User-Agent', 'bid-compass-scheduler', 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000) into req;
  return req;
end $$;
revoke all on function public.trigger_workflow(text, jsonb) from anon, authenticated, public;

-- 4. 매일 00:00 UTC = 09:00 한국시간
select cron.schedule('brief-daily', '0 0 * * *', $job$select public.trigger_workflow('brief.yml')$job$);

-- 확인: brief-daily · 0 0 * * * 한 줄이면 정상 (집계는 실행 뒤 GitHub 브리핑으로 확인)
select jobname, schedule, active from cron.job where jobname = 'brief-daily';
