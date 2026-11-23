-- =========================================================
-- 047: 일일 브리핑 기간 바로잡기 (2026-11-23)
--  · 첫 브리핑에서 계약 기간이 1991 ~ 3026, 계약 세부가 ~ 2206 으로 보임 — 원본 자료의 날짜 오타
--  · 기간(from~to)은 2000-01-01 ~ 오늘+1년 안의 날짜로만, 벗어난 날짜는 '날짜 이상 N건'(odd)으로 따로 셈
--  · 데이터는 바꾸지 않음 (집계 함수만 교체). 오늘 집계도 바로 다시 만듦 (1분 안, 스스로 예약 삭제)
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 1. 집계 (045 와 같고, 기간은 2000-01-01 ~ 오늘+1년 안에서만 · 벗어난 날짜는 odd 로 셈)
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
  lo date := date '2000-01-01';          -- 이보다 이른 날짜는 원본 오타로 봄
  hi date;                               -- 오늘 + 1년보다 늦은 날짜도
begin
  hi := today + 365;
  -- 데이터별 건수·기간·크기
  select jsonb_build_object('rows', count(*),
         'from', min(posted_at) filter (where posted_at >= lo and posted_at < hi)::date,
         'to', max(posted_at) filter (where posted_at >= lo and posted_at < hi)::date,
         'odd', count(*) filter (where posted_at < lo or posted_at >= hi),
         'bytes', pg_total_relation_size('public.notices')) into r from public.notices;
  t := t || jsonb_build_object('notices', r);
  select jsonb_build_object('rows', count(*),
         'from', min(opened_at) filter (where opened_at >= lo and opened_at < hi)::date,
         'to', max(opened_at) filter (where opened_at >= lo and opened_at < hi)::date,
         'odd', count(*) filter (where opened_at < lo or opened_at >= hi),
         'bytes', pg_total_relation_size('public.openings'),
         'pending', count(*) filter (where not details_fetched and (status = '개찰완료' or status is null))) into r from public.openings;
  t := t || jsonb_build_object('openings', r);
  select greatest(reltuples, 0)::bigint into est from pg_class where oid = 'public.contracts'::regclass;
  t := t || jsonb_build_object('contracts', jsonb_build_object('rows', est, 'estimate', true,
         'from', (select min(contract_date) from public.contracts where contract_date >= lo),
         'to', (select max(contract_date) from public.contracts where contract_date < hi),
         'odd', (select count(*) from public.contracts where contract_date < lo or contract_date >= hi),
         'bytes', pg_total_relation_size('public.contracts')));
  r := null;
  select jsonb_build_object('rows', count(*),
         'from', min(received_at) filter (where received_at >= lo and received_at < hi)::date,
         'to', max(received_at) filter (where received_at >= lo and received_at < hi)::date,
         'odd', count(*) filter (where received_at < lo or received_at >= hi),
         'bytes', pg_total_relation_size('public.prespecs')) into r from public.prespecs;
  t := t || jsonb_build_object('prespecs', r);
  -- 큰 표는 추정치 (정확한 수는 수십 초 걸릴 수 있음)
  select greatest(reltuples, 0)::bigint into est from pg_class where oid = 'public.contract_lines'::regclass;
  t := t || jsonb_build_object('contract_lines', jsonb_build_object('rows', est, 'estimate', true,
         'from', (select min(contract_date) from public.contract_lines where contract_date >= lo),
         'to', (select max(contract_date) from public.contract_lines where contract_date < hi),
         'odd', (select count(*) from public.contract_lines where contract_date < lo or contract_date >= hi),
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

-- 2. 오늘 집계 다시 (다음 1분 안에 실행 후 스스로 지움)
select cron.schedule('brief-snapshot-now', '* * * * *',
  $job$select public.ops_daily_brief(); select cron.unschedule('brief-snapshot-now');$job$);

-- 확인: brief-snapshot-now 한 줄 (1~2분 뒤 사라짐)
select jobname, schedule, active from cron.job where jobname like 'brief-snapshot%' order by jobname;
