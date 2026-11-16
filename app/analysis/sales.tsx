'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, ChevronDown, ExternalLink, SlidersHorizontal } from 'lucide-react';
import { Card } from '@/components/layout';
import { Tip } from '@/components/tip';
import { BTN_PRIMARY } from '@/components/ui';
import { fmtShort, fmtNum } from '@/lib/format';
import { splitLocation } from '@/lib/data';
import { KIND_GROUPS, daysTo, fetchSalesContracts, groupByOrg, productCodes, type SalesContract, type SalesOrg } from '@/lib/sales';
import { useStore } from '@/lib/store';
import { useInbox, ORG_END_DAYS, type SavedOrg } from '@/lib/inbox';

/*
 * 입찰 분석 — 「영업」 (기획 17.1 A, 2026-11-15 개편)
 * 담당자가 월요일 아침에 묻는 것: "이번 주 어디에 연락하지?"
 *  ① 이번 주 연락해 볼 기관 5곳 — 이유 한 문장 + [저장] [계약 보기]
 *  ② 저장한 기관의 다가오는 일정 — 계약 끝나는 날
 *  ③ 전체 목록은 접어 둠 — 보이는 거르기 3개, 나머지는 [조건]
 */

type Scope = 'none' | 'sui' | 'all';
type Sort = 'count' | 'end' | 'recent';
const SOON = 90; // 이 안에 계약이 끝나면 강조
const PICKS = 5;
const PAGE = 15;

/** 기관의 진행 중 계약(끝나는 날 있음) → 알림용 목록 */
const watchOf = (o: SalesOrg): SavedOrg['watch'] => o.contracts
  .filter((c) => c.endDate && daysTo(c.endDate) >= 0)
  .sort((a, b) => a.endDate!.localeCompare(b.endDate!)).slice(0, 10)
  .map((c) => ({ id: c.id, title: c.title, end: c.endDate! }));

const sidoShort = (s: string) => s.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;
const short = (t: string, n = 24) => (t.length > n ? `${t.slice(0, n)}…` : t);

/** 다시 맺는 일이 많은 계약 — 유지보수·운영·임차·구독 등 (끝나는 날이 곧 다음 구매 시점일 가능성이 큼) */
const RECUR = /유지보수|유지관리|임차|임대|구독|라이선스|라이센스|연간|단가계약|위탁운영|운영위탁|운영\s*(용역|대행|지원)/;
const ONEOFF = /채용|시험|행사|축제|대회|박람회|엑스포|BIXPO|설명회|공모전|훈련|공연|페스티벌|기념식/i;
const recurring = (o: SalesOrg) => o.contracts.some((c) => c.endDate === o.nextEnd && RECUR.test(c.title) && !ONEOFF.test(c.title));

/** 추천 점수 — 반복 계약이 곧 끝남 > 여러 번 삼 > 우리 지역 > 소액(혼자 견적 가능성). 경험 규칙이라 반응 보고 조정 */
function pickScore(o: SalesOrg, region: string | null) {
  const d = o.nextEnd ? daysTo(o.nextEnd) : null;
  const end = d !== null && d <= SOON ? (10 + 40 * (1 - d / SOON)) * (recurring(o) ? 1 : 0.3) : 0;
  const repeat = Math.min(o.count, 5) * 6;
  const local = region && o.name.startsWith(region) ? 10 : 0;
  const small = (o.contracts.filter((c) => c.amount > 0 && c.amount <= 2e7).length / o.count) * 10;
  return end + repeat + local + small;
}

/** 추천 이유 한 문장 */
function reason(o: SalesOrg): { text: string; tone: 'warn' | 'ink'; recur?: boolean } {
  const d = o.nextEnd ? daysTo(o.nextEnd) : null;
  const soon = d !== null && d <= SOON;
  const endC = soon ? o.contracts.find((x) => x.endDate === o.nextEnd)! : null;
  if (endC && recurring(o)) return { text: `'${short(endC.title, 20)}' 계약이 ${md(o.nextEnd!)}에 끝나요 (D-${d})`, tone: 'warn', recur: true };
  if (o.count >= 2) return { text: `우리 품목을 공고 없이 ${o.count}번 샀어요${endC ? ` · ${md(o.nextEnd!)}에 계약 끝` : ''}`, tone: 'ink' };
  if (endC) return { text: `'${short(endC.title)}' 계약이 ${md(o.nextEnd!)}에 끝나요 (D-${d})`, tone: 'warn' };
  return { text: `최근 '${short(o.contracts[0].title)}'을 공고 없이 샀어요`, tone: 'ink' };
}

export function SalesSection({ focus }: { focus?: string | null }) {
  const { profile } = useStore();
  const { savedOrgs, isSavedOrg, saveOrg, unsaveOrg } = useInbox();
  const codes = useMemo(() => productCodes(profile.products, profile.muted, profile.industries), [profile.products, profile.muted, profile.industries]);
  const [list, setList] = useState<SalesContract[] | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  // 전체 목록
  const [all, setAll] = useState(!!focus);
  const [cond, setCond] = useState(false);
  const [scope, setScope] = useState<Scope>('none');
  const [sort, setSort] = useState<Sort>('count');
  const [mine, setMine] = useState(false);
  const [small, setSmall] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(focus ?? null);

  useEffect(() => {
    if (!codes.size) { setList(null); return; }
    setList(undefined); setErr(null);
    fetchSalesContracts(codes).then(setList).catch((e: Error) => { setErr(e.message); setList(null); });
  }, [codes]);

  const sido = splitLocation(profile.location).sido;
  const region = sido ? sidoShort(sido) : null;

  // 기본(공고 없이) 기관 묶음 — 추천·일정에 사용
  const base = useMemo(() => (list ? groupByOrg(list.filter((c) => c.noNotice)) : []), [list]);
  const picks = useMemo(() => base.filter((o) => !isSavedOrg(o.name))
    .map((o) => ({ o, s: pickScore(o, region) })).sort((a, b) => b.s - a.s).slice(0, PICKS).map((x) => x.o), [base, region, isSavedOrg]);

  // 저장한 기관의 다가오는 일정
  const upcoming = useMemo(() => savedOrgs.flatMap((s) => s.watch.map((w) => ({ org: s.org, ...w })))
    .filter((w) => daysTo(w.end) >= 0).sort((a, b) => a.end.localeCompare(b.end)).slice(0, 5), [savedOrgs]);

  const orgs = useMemo(() => {
    if (!list) return [];
    const g = KIND_GROUPS.find((k) => k.key === kind);
    const f = list.filter((c) =>
      (scope === 'all' || (scope === 'sui' ? c.method === '수의계약' : c.noNotice))
      && (!small || c.amount <= 2e7)
      && (!mine || !region || c.buyer.startsWith(region))
      && (!g || g.test(c.buyerKind))
      && (!onlySaved || isSavedOrg(c.buyer)));
    const end = (o: SalesOrg) => (o.nextEnd ? Date.parse(o.nextEnd) : Infinity);
    return groupByOrg(f).sort((a, b) => sort === 'end' ? end(a) - end(b) || b.count - a.count
      : sort === 'recent' ? String(b.last ?? '').localeCompare(String(a.last ?? ''))
      : b.count - a.count || b.amount - a.amount);
  }, [list, scope, small, mine, kind, sort, region, onlySaved, isSavedOrg]);

  useEffect(() => { setShown(PAGE); }, [scope, small, mine, kind, sort, onlySaved]);

  // 알림에서 들어오면 전체 목록에서 그 기관을 펼쳐 보여줌
  useEffect(() => {
    if (!focus || !list) return;
    setAll(true); setOpen(focus);
    setTimeout(() => document.getElementById(`org-${focus}`)?.scrollIntoView({ block: 'center' }), 50);
  }, [focus, list]);

  // 저장한 기관의 진행 중 계약 목록을 최신으로 (새 계약이 들어오면 알림 대상에 추가)
  useEffect(() => {
    if (!list || !savedOrgs.length) return;
    const groups = groupByOrg(list);
    for (const s of savedOrgs) {
      const o = groups.find((x) => x.name === s.org);
      if (!o) continue;
      const w = watchOf(o);
      if (JSON.stringify(w) !== JSON.stringify(s.watch)) saveOrg({ org: s.org, kind: s.kind, watch: w });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const toggleSave = (o: SalesOrg) => (isSavedOrg(o.name) ? unsaveOrg(o.name) : saveOrg({ org: o.name, kind: o.kind, watch: watchOf(o) }));

  const head = (sub: string) => (
    <div className="px-1 pt-4">
      <h2 className="text-[20px] font-bold">영업</h2>
      <p className="mt-0.5 text-[14px] text-mute">{sub}</p>
    </div>
  );

  if (!codes.size) {
    return (
      <section className="space-y-3">
        {head('공고 없이 우리 품목을 사는 기관을 찾아드려요')}
        <div className="rounded-box bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-bold">주요 품목을 등록하면 찾아드려요</p>
          <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-relaxed text-sub">계약의 품목 코드와 우리 품목을 맞춰, 우리 품목을 산 기관을 보여드려요.</p>
          <div className="mx-auto mt-5 max-w-[320px]"><Link href="/mypage?edit=company" className={BTN_PRIMARY}>주요 품목 등록하기</Link></div>
        </div>
      </section>
    );
  }
  if (list === undefined) return <section className="space-y-3">{head('우리 품목을 산 기관을 찾는 중이에요')}<div className="h-48 animate-pulse rounded-box bg-white" /></section>;
  if (err || !list) return <section className="space-y-3">{head('')}<p className="rounded-box bg-white p-5 text-[15px] text-bad">불러오지 못했어요{err ? `: ${err}` : ''}</p></section>;

  const chip = (on: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition ${on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`;
  const condOn = scope !== 'none' || !!kind || sort !== 'count';

  return (
    <section className="space-y-3 lg:space-y-4">
      {head(`공고 없이 우리 품목을 산 기관 ${base.length.toLocaleString()}곳을 찾았어요`)}

      {/* ① 이번 주 연락해 볼 기관 */}
      <Card title="이번 주 연락해 볼 기관" aside={<Tip title="어떻게 골랐나요">공고 없이(수의계약) 우리 품목을 산 기관 중 ① 지금 계약이 곧 끝나는 곳 ② 여러 번 산 곳 ③ 우리 지역 ④ 2천만 원 이하 소액 계약이 많은 곳을 위로 올렸어요. 저장한 기관은 아래 일정에서 보여드려요.</Tip>}>
        {picks.length ? (
          <ol className="-my-1 divide-y divide-line">
            {picks.map((o, i) => <Pick key={o.name} n={i + 1} o={o} saved={isSavedOrg(o.name)} onSave={() => toggleSave(o)} />)}
          </ol>
        ) : <p className="py-6 text-center text-[14px] text-mute">추천할 기관을 모두 저장했어요</p>}
      </Card>

      {/* ② 저장한 기관의 다가오는 일정 */}
      {savedOrgs.length > 0 && (
        <Card title={`저장한 기관 ${savedOrgs.length}곳`} aside={
          <button type="button" onClick={() => { setAll(true); setOnlySaved(true); setTimeout(() => document.getElementById('sales-all')?.scrollIntoView({ block: 'start' }), 50); }} className="text-[14px] font-semibold text-brand">모두 보기</button>
        }>
          {upcoming.length ? (
            <ul className="space-y-2.5">
              {upcoming.map((w) => {
                const d = daysTo(w.end);
                return (
                  <li key={`${w.org}-${w.id}`} className="flex items-center gap-3 text-[14px]">
                    <span className={`w-12 shrink-0 text-center font-bold tabular-nums ${d <= ORG_END_DAYS ? 'text-warn' : 'text-sub'}`}>{md(w.end)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{w.org}</span>
                      <span className="block truncate text-[12px] text-mute">{w.title} 계약 끝</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-mute">D-{d}</span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="py-4 text-center text-[14px] text-mute">다가오는 계약 종료가 없어요. 새 공고를 내면 알려드려요</p>}
          <p className="mt-3 text-[12px] text-mute">계약이 끝나기 {ORG_END_DAYS}일 전과 새 공고를 낼 때 알림함으로 알려드려요.</p>
        </Card>
      )}

      {/* ③ 전체 목록 (접힘) */}
      <div id="sales-all">
        {!all ? (
          <button type="button" onClick={() => setAll(true)} className="flex w-full items-center justify-between rounded-box bg-white px-5 py-4 text-left text-[15px] font-semibold hover:bg-white/70">
            <span>우리 품목을 산 기관 전체 보기 <span className="text-mute">{base.length.toLocaleString()}곳</span></span>
            <ChevronDown className="h-5 w-5 text-mute" />
          </button>
        ) : (
          <Card title={`기관 ${orgs.length.toLocaleString()}곳`} aside={
            <button type="button" onClick={() => setCond((v) => !v)} aria-expanded={cond} className={`flex h-9 items-center gap-1 rounded-btn px-3 text-[14px] font-semibold ${condOn ? 'bg-ink text-white' : 'bg-fill text-sub'}`}>
              <SlidersHorizontal className="h-4 w-4" />조건
            </button>
          }>
            <div className="-mx-5 -mt-1 mb-3 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
              {region && <button type="button" onClick={() => setMine((v) => !v)} className={chip(mine)}>우리 지역({region})</button>}
              <button type="button" onClick={() => setSmall((v) => !v)} className={chip(small)}>2천만 원 이하</button>
              {savedOrgs.length > 0 && <button type="button" onClick={() => setOnlySaved((v) => !v)} className={chip(onlySaved)}>저장한 기관</button>}
            </div>

            {cond && (
              <div className="mb-4 space-y-3 rounded-2xl bg-fill/70 p-4 text-[14px]">
                <Field label="어떤 계약">
                  {([['none', '공고 없이', '수의계약 중 입찰·견적 공고 없이 맺은 계약'], ['sui', '수의계약 전체', '견적 공고를 낸 수의계약까지'], ['all', '모든 계약', '경쟁입찰 포함']] as const).map(([k, l, h]) => (
                    <label key={k} className="flex cursor-pointer items-start gap-2 py-1">
                      <input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} className="mt-1" />
                      <span><b className="font-semibold">{l}</b> <span className="text-mute">· {h}</span></span>
                    </label>
                  ))}
                </Field>
                <Field label="기관 유형">
                  <div className="flex flex-wrap gap-2">
                    {KIND_GROUPS.map((k) => <button key={k.key} type="button" onClick={() => setKind(kind === k.key ? null : k.key)} className={chip(kind === k.key)}>{k.label}</button>)}
                  </div>
                </Field>
                <Field label="순서">
                  <div className="flex flex-wrap gap-2">
                    {([['count', '많이 산 순'], ['end', '계약 끝나는 순'], ['recent', '최근 계약 순']] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setSort(k)} className={chip(sort === k)}>{l}</button>)}
                  </div>
                </Field>
              </div>
            )}

            {orgs.length ? (
              <ul className="-my-1 divide-y divide-line">
                {(focus ? [...orgs.filter((o) => o.name === focus), ...orgs.filter((o) => o.name !== focus)] : orgs).slice(0, shown).map((o) => (
                  <OrgRow key={o.name} o={o} open={open === o.name} onToggle={() => setOpen(open === o.name ? null : o.name)}
                    saved={isSavedOrg(o.name)} onSave={() => toggleSave(o)} />
                ))}
              </ul>
            ) : <p className="py-8 text-center text-[14px] text-mute">조건에 맞는 기관이 없어요</p>}
            {orgs.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 h-11 w-full rounded-btn bg-fill text-[14px] font-semibold text-sub">
                더 보기 ({(orgs.length - shown).toLocaleString()}곳)
              </button>
            )}
          </Card>
        )}
      </div>

      <p className="flex items-start gap-1 px-1 text-[12px] leading-relaxed text-mute">
        <span>나라장터 계약의 품목·공종 코드를 우리 품목·업종 {codes.size}개와 맞췄어요. 2026년 11월 15일부터 모으기 시작해 아직 기간이 짧아요.</span>
        <Tip title="기준">조달청이 대신 계약한 건은 실제로 산 기관(수요기관)으로 묶었고, 조달청 단가계약(3자단가·다수공급자)은 뺐어요. &apos;우리 지역&apos;은 기관 이름으로 추정해요. 계약이 끝나는 날은 다시 발주하는 날이 아니라 확인해 볼 시점이에요.</Tip>
      </p>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 text-[12px] font-semibold text-mute">{label}</p>{children}</div>;
}

function SaveBtn({ saved, onSave, label }: { saved: boolean; onSave: () => void; label?: boolean }) {
  return (
    <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? '저장 해제' : '기관 저장'}
      className={label
        ? `inline-flex h-9 items-center gap-1 rounded-btn px-3 text-[14px] font-semibold ${saved ? 'bg-brand-soft text-brand' : 'bg-ink text-white'}`
        : `-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${saved ? 'text-brand' : 'text-mute hover:text-sub'}`}>
      <Bookmark className={`${label ? 'h-4 w-4' : 'h-5 w-5'} ${saved ? 'fill-current' : ''}`} />{label && (saved ? '저장됨' : '저장')}
    </button>
  );
}

/** 추천 1곳 — 이유 한 문장 + 근거 한 줄 + [저장] [계약 보기] */
function Pick({ n, o, saved, onSave }: { n: number; o: SalesOrg; saved: boolean; onSave: () => void }) {
  const [open, setOpen] = useState(false);
  const r = reason(o);
  const facts = [
    `${o.count}건 · ${o.amount ? fmtShort(o.amount) : '금액 없음'}`,
    o.vendors[0] ? `지금 ${o.vendors[0].name}` : null,
    o.depts[0] ?? null,
  ].filter(Boolean).join(' · ');
  return (
    <li className="py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand">{n}</span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-bold">{o.name}</span>
            {o.kind && <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-mute">{o.kind}</span>}
          </p>
          <p className={`mt-1 text-[15px] font-semibold leading-snug ${r.tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{r.text}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-mute">
            {r.recur && <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[11px] font-semibold text-warn">다시 맺는 계약</span>}
            <span className="truncate">{facts}</span>
          </p>
          <div className="mt-2.5 flex gap-2">
            <SaveBtn saved={saved} onSave={onSave} label />
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex h-9 items-center gap-1 rounded-btn bg-fill px-3 text-[14px] font-semibold text-sub">
              계약 보기<ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
          {open && <Contracts o={o} />}
        </div>
      </div>
    </li>
  );
}

/** 전체 목록 한 줄 — 이름 / 건수·금액·계약 끝 한 줄, 나머지는 펼쳐서 */
function OrgRow({ o, open, onToggle, saved, onSave }: { o: SalesOrg; open: boolean; onToggle: () => void; saved: boolean; onSave: () => void }) {
  const left = o.nextEnd ? daysTo(o.nextEnd) : null;
  return (
    <li className="py-3" id={`org-${o.name}`}>
      <div className="flex items-start gap-1">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">{o.name}</span>
              {o.kind && <span className="shrink-0 rounded bg-fill px-1.5 py-0.5 text-[11px] text-mute">{o.kind}</span>}
            </span>
            <span className="mt-0.5 block text-[13px] tabular-nums text-sub">
              {o.count}건 · {o.amount ? fmtShort(o.amount) : '금액 없음'}
              {left !== null && <> · <span className={left <= SOON ? 'font-semibold text-warn' : ''}>계약 끝 {md(o.nextEnd!)} (D-{left})</span></>}
            </span>
          </span>
          <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-mute transition ${open ? 'rotate-180' : ''}`} />
        </button>
        <SaveBtn saved={saved} onSave={onSave} />
      </div>
      {open && (
        <div className="mt-2">
          {(o.depts.length > 0 || o.vendors.length > 0) && (
            <p className="text-[13px] text-sub">
              {o.depts.length > 0 && <>담당 {o.depts.join(', ')}</>}
              {o.depts.length > 0 && o.vendors.length > 0 && ' · '}
              {o.vendors.length > 0 && <>거래 업체 {o.vendors.map((v) => v.name).join(', ')}</>}
            </p>
          )}
          <Contracts o={o} />
        </div>
      )}
    </li>
  );
}

function Contracts({ o }: { o: SalesOrg }) {
  return (
    <ul className="mt-2.5 space-y-2">
      {o.contracts.slice(0, 10).map((c) => (
        <li key={c.id} className="rounded-2xl bg-fill/70 px-3.5 py-3">
          <p className="text-[14px] font-medium leading-snug">{c.title}</p>
          <p className="mt-1 text-[12px] tabular-nums text-mute">
            {c.date ? c.date.replaceAll('-', '.') : '계약일 없음'} · {c.amount ? `${fmtNum(c.amount)}원` : '금액 없음'}
            {c.endDate ? ` · ${c.endDate.replaceAll('-', '.')}까지` : ''}
            {c.vendors.length ? ` · ${c.vendors[0]}${c.vendors.length > 1 ? ` 외 ${c.vendors.length - 1}` : ''}` : ''}
          </p>
          {c.items.filter((i) => i.unitPrice).slice(0, 2).map((i, k) => (
            <p key={k} className="mt-0.5 truncate text-[12px] tabular-nums text-mute">· {i.name} — 단가 {fmtNum(i.unitPrice!)}원{i.qty ? ` × ${fmtNum(i.qty)}` : ''}</p>
          ))}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            {c.basis && <span className="rounded bg-white px-1.5 py-0.5 text-sub">{short(c.basis, 28)}</span>}
            {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sub underline">나라장터<ExternalLink className="h-3 w-3" /></a>}
          </div>
        </li>
      ))}
      {o.contracts.length > 10 && <li className="text-center text-[12px] text-mute">최근 10건만 보여드려요 (전체 {o.contracts.length}건)</li>}
    </ul>
  );
}
