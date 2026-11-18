-- =========================================================
-- 030: 시장 분석 개편 — '그래서 어쩌라고'에 답하기 (2026-11-18 사용자 요청)
--  ① 맞대결 전적  my_h2h(p_bizs, p_years, p_market)
--      자주 만나는 회사(my_market 순위)마다: 함께 들어간 공고, 둘 다 순위가 있는 공고 중 우리가 앞선 수·그쪽이 앞선 수,
--      그 회사 낙찰 수 · 우리 낙찰 수. 경쟁사 투찰률·금액은 돌려주지 않음(민감 — 010 원칙 유지)
--      ※ 010에서 '승패는 계산하지 않음'으로 정했던 것을 '앞선 횟수(순위 비교)'로만 바꿈. 화면에서 우세·열세로 단정하지 않음
--  ② 놓친 공고  my_missed(p_days, p_market)
--      우리 시장(우리가 투찰한 공고의 품목·분류·면허, 023과 같은 기준) 공고 중 최근 p_days일에 개찰된 것:
--      전체 · 우리가 들어간 수 · 놓친 수, 놓친 공고가 많은 기관, 최근 놓친 공고(참가 수·낙찰 업체)
--      + 지금 마감 전인 우리 시장 공고 (바로 공고로)
--  회사 확인을 마친 본인 시장만 계산. 투찰 기록 표는 계속 직접 읽을 수 없음
-- 실행: Supabase 대시보드 > SQL Editor 에 전체를 붙여 넣고 Run. 여러 번 실행해도 됩니다.
-- =========================================================

-- 공고의 시장 키 (023 my_market과 같은 기준)
create or replace function public.notice_seg(p_type text, p_code text, s_code text, ind text)
returns text language sql immutable as $$
  select case
    when p_type = '물품' and p_code is not null then '물품:' || left(p_code, 6)
    when p_type = '용역' and s_code is not null then '용역:' || left(s_code, 6)
    when p_type = '공사' and ind is not null then '공사:' || ind
    else p_type
  end
$$;


-- ① 맞대결 전적
create or replace function public.my_h2h(p_bizs bigint[], p_years int default 3, p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  since timestamptz := now() - make_interval(years => p_years);
begin
  if me is null then return jsonb_build_object('verified', false); end if;

  return jsonb_build_object('verified', true, 'rivals', coalesce((
    with mine as (
      select o.id, o.winner_bizno, r.rank as my_rank
      from bid_results r
      join openings o on o.id = r.opening_id
      left join lateral (
        select x.p_code, x.s_code, x.industry_mid from notices x where x.bid_no = o.bid_no order by x.bid_ord desc limit 1
      ) n on true
      where r.bizno = me and o.opened_at >= since
        and (p_market is null or notice_seg(o.bid_type, n.p_code, n.s_code, n.industry_mid) = p_market)
    ),
    h as (
      select b.bizno,
             count(*) as met,
             count(*) filter (where m.my_rank is not null and b.rank is not null and m.my_rank < b.rank) as i_ahead,
             count(*) filter (where m.my_rank is not null and b.rank is not null and b.rank < m.my_rank) as they_ahead,
             count(*) filter (where m.winner_bizno = b.bizno) as their_wins,
             count(*) filter (where m.winner_bizno = me) as my_wins
      from mine m join bid_results b on b.opening_id = m.id
      where b.bizno = any(p_bizs[1:10]) and b.bizno <> me
      group by b.bizno
    )
    select jsonb_agg(jsonb_build_object('bizno', h.bizno, 'name', coalesce(c.name, '업체명 미상'), 'met', h.met,
             'i_ahead', h.i_ahead, 'they_ahead', h.they_ahead, 'their_wins', h.their_wins, 'my_wins', h.my_wins)
             order by array_position(p_bizs, h.bizno))
    from h left join bid_companies c on c.bizno = h.bizno
  ), '[]'::jsonb));
end $$;

revoke all on function public.my_h2h(bigint[], int, text) from anon, public;
grant execute on function public.my_h2h(bigint[], int, text) to authenticated;


-- ② 놓친 공고 + 지금 열린 우리 시장 공고
create or replace function public.my_missed(p_days int default 90, p_market text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := my_verified_bizno();
  segs text[];
  result jsonb;
begin
  if me is null then return jsonb_build_object('verified', false); end if;

  -- 우리 시장 = 최근 3년 우리가 투찰한 공고의 시장 키 (p_market이 있으면 그 시장만)
  select array_agg(distinct s) into segs from (
    select notice_seg(o.bid_type, n.p_code, n.s_code, n.industry_mid) as s
    from bid_results r join openings o on o.id = r.opening_id
    left join lateral (
      select x.p_code, x.s_code, x.industry_mid from notices x where x.bid_no = o.bid_no order by x.bid_ord desc limit 1
    ) n on true
    where r.bizno = me and o.opened_at >= now() - interval '3 years'
  ) t
  where s like '%:%' and (p_market is null or s = p_market);  -- 분류 없는 '물품'·'공사' 같은 넓은 키는 빼야 시장이 뭉개지지 않음

  if segs is null then return jsonb_build_object('verified', true, 'total', 0); end if;

  with nt as (
    -- 최근 p_days일에 마감된 우리 시장 공고 (공고번호별 마지막 차수)
    select distinct on (n.bid_no) n.bid_no, n.title, coalesce(n.demand_org, n.org) as org, n.closes_at
    from notices n
    where n.posted_at >= now() - make_interval(days => p_days + 30)
      and n.closes_at >= now() - make_interval(days => p_days) and n.closes_at < now()
      and notice_seg(n.bid_type, n.p_code, n.s_code, n.industry_mid) = any(segs)
    order by n.bid_no, n.bid_ord desc
  ),
  op as (
    -- 개찰된 것만 (유찰·결과 없음 제외), 우리가 들어갔는지
    select nt.*, o.id as opening_id, o.participants, o.winner_bizno, o.opened_at,
           exists (select 1 from bid_results r where r.opening_id = o.id and r.bizno = me) as joined
    from nt
    join lateral (
      select * from openings o where o.bid_no = nt.bid_no and o.participants > 0 order by o.opened_at desc limit 1
    ) o on true
  ),
  missed as (select * from op where not joined),
  open_now as (
    select distinct on (n.bid_no) n.id, n.title, coalesce(n.demand_org, n.org) as org, n.closes_at
    from notices n
    where n.source = 'api' and n.closes_at >= now()
      and notice_seg(n.bid_type, n.p_code, n.s_code, n.industry_mid) = any(segs)
    order by n.bid_no, n.bid_ord desc
  )
  select jsonb_build_object(
    'verified', true,
    'days', p_days,
    'total', (select count(*) from op),
    'joined', (select count(*) from op where joined),
    'missed', (select count(*) from missed),
    'missed_avg_participants', (select round(avg(participants)) from missed),
    'joined_avg_participants', (select round(avg(participants)) from op where joined),
    'missed_orgs', coalesce((
      select jsonb_agg(jsonb_build_object('org', org, 'n', n, 'avg_participants', ap) order by n desc)
      from (select org, count(*) n, round(avg(participants)) ap from missed group by org order by count(*) desc limit 5) t), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('opening_id', m.opening_id, 'title', m.title, 'org', m.org, 'opened_at', m.opened_at,
               'participants', m.participants, 'winner', c.name) order by m.opened_at desc)
      from (select * from missed order by opened_at desc limit 5) m left join bid_companies c on c.bizno = m.winner_bizno), '[]'::jsonb),
    'open_now', (select count(*) from open_now),
    'open_list', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'org', org, 'closes_at', closes_at) order by closes_at)
      from (select * from open_now order by closes_at limit 3) t), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function public.my_missed(int, text) from anon, public;
grant execute on function public.my_missed(int, text) to authenticated;

-- 확인: 함수 3개
select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('notice_seg', 'my_h2h', 'my_missed') order by 1;
