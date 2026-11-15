'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Bookmark, ChevronDown, ExternalLink } from 'lucide-react';
import { Card } from '@/components/layout';
import { Tip } from '@/components/tip';
import { BTN_PRIMARY } from '@/components/ui';
import { fmtShort, fmtNum } from '@/lib/format';
import { splitLocation } from '@/lib/data';
import { KIND_GROUPS, daysTo, fetchSalesContracts, groupByOrg, productCodes, type SalesContract, type SalesOrg } from '@/lib/sales';
import { useStore } from '@/lib/store';
import { useInbox, ORG_END_DAYS, type SavedOrg } from '@/lib/inbox';

/*
 * 입찰 분석 — 「영업 기회」 (기획 17.1 A)
 * 공고 없이(수의계약) 우리 품목을 산 기관 → 누가·얼마에·언제까지 계약했는지
 * 글보다 숫자·칩: 기관 한 줄 = 건수·금액·담당부서·계약 끝나는 날·지금 거래 업체
 */

type Scope = 'none' | 'sui' | 'all';
type Sort = 'count' | 'end' | 'recent';
const SOON = 90; // 이 안에 계약이 끝나면 강조
const PAGE = 15;

/** 기관의 진행 중 계약(끝나는 날 있음) → 알림용 목록 */
const watchOf = (o: SalesOrg): SavedOrg['watch'] => o.contracts
  .filter((c) => c.endDate && daysTo(c.endDate) >= 0)
  .sort((a, b) => a.endDate!.localeCompare(b.endDate!)).slice(0, 10)
  .map((c) => ({ id: c.id, title: c.title, end: c.endDate! }));

const sidoShort = (s: string) => s.replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, '');

export function SalesSection({ focus }: { focus?: string | null }) {
  const { profile } = useStore();
  const { savedOrgs, isSavedOrg, saveOrg, unsaveOrg } = useInbox();
  const [onlySaved, setOnlySaved] = useState(false);
  const codes = useMemo(() => productCodes(profile.products, profile.muted), [profile.products, profile.muted]);
  const [list, setList] = useState<SalesContract[] | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('none');
  const [sort, setSort] = useState<Sort>('count');
  const [mine, setMine] = useState(false);
  const [small, setSmall] = useState(false);
  const [kind, setKind] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(focus ?? null);

  useEffect(() => {
    if (!codes.size) { setList(null); return; }
    setList(undefined); setErr(null);
    fetchSalesContracts(codes).then(setList).catch((e: Error) => { setErr(e.message); setList(null); });
  }, [codes]);

  const sido = splitLocation(profile.location).sido;
  const orgs = useMemo(() => {
    if (!list) return [];
    const short = sido ? sidoShort(sido) : null;
    const g = KIND_GROUPS.find((k) => k.key === kind);
    const f = list.filter((c) =>
      (scope === 'all' || (scope === 'sui' ? c.method === '수의계약' : c.noNotice))
      && (!small || c.amount <= 2e7)
      && (!mine || !short || c.buyer.startsWith(short))
      && (!g || g.test(c.buyerKind))
      && (!onlySaved || isSavedOrg(c.buyer)));
    const rows = groupByOrg(f);
    const end = (o: SalesOrg) => (o.nextEnd ? Date.parse(o.nextEnd) : Infinity);
    return rows.sort((a, b) => sort === 'end' ? end(a) - end(b) || b.count - a.count
      : sort === 'recent' ? String(b.last ?? '').localeCompare(String(a.last ?? ''))
      : b.count - a.count || b.amount - a.amount);
  }, [list, scope, small, mine, kind, sort, sido, onlySaved, isSavedOrg]);

  useEffect(() => { setShown(PAGE); setOpen(null); }, [scope, small, mine, kind, sort, onlySaved]);

  // 알림에서 들어오면 그 기관을 맨 위로 펼쳐 보여줌
  useEffect(() => {
    if (!focus || !list) return;
    document.getElementById(`org-${focus}`)?.scrollIntoView({ block: 'center' });
  }, [focus, list]);

  // 저장한 기관의 진행 중 계약 목록을 최신으로 (새 계약이 들어오면 알림 대상에 추가)
  useEffect(() => {
    if (!list || !savedOrgs.length) return;
    const all = groupByOrg(list);
    for (const s of savedOrgs) {
      const o = all.find((x) => x.name === s.org);
      if (!o) continue;
      const w = watchOf(o);
      if (JSON.stringify(w) !== JSON.stringify(s.watch)) saveOrg({ org: s.org, kind: s.kind, watch: w });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const toggleSave = (o: SalesOrg) => isSavedOrg(o.name) ? unsaveOrg(o.name) : saveOrg({ org: o.name, kind: o.kind, watch: watchOf(o) });

  const head = (
    <div className="px-1 pt-4">
      <h2 className="text-[20px] font-bold">영업 기회</h2>
      <p className="mt-0.5 text-[14px] text-mute">공고 없이 우리 품목을 산 기관이에요. 다음 구매 전에 먼저 찾아갈 곳을 골라 보세요</p>
    </div>
  );

  if (!codes.size) {
    return (
      <section className="space-y-3">
        {head}
        <div className="rounded-box bg-white px-6 py-10 text-center">
          <p className="text-[17px] font-bold">주요 품목을 등록하면 찾아드려요</p>
          <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-relaxed text-sub">계약의 품목 코드와 우리 품목을 맞춰, 우리 품목을 산 기관을 보여드려요.</p>
          <div className="mx-auto mt-5 max-w-[320px]"><Link href="/mypage?edit=company" className={BTN_PRIMARY}>주요 품목 등록하기</Link></div>
        </div>
      </section>
    );
  }
  if (list === undefined) return <section className="space-y-3">{head}<div className="h-48 animate-pulse rounded-box bg-white" /></section>;
  if (err || !list) return <section className="space-y-3">{head}<p className="rounded-box bg-white p-5 text-[15px] text-bad">불러오지 못했어요{err ? `: ${err}` : ''}</p></section>;

  const contracts = orgs.reduce((a, o) => a + o.count, 0);
  const amount = orgs.reduce((a, o) => a + o.amount, 0);
  const soon = orgs.filter((o) => o.nextEnd && daysTo(o.nextEnd) <= SOON).length;
  const chip = (on: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition ${on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`;
  const seg = (on: boolean) => `flex-1 rounded-[10px] px-3 py-1.5 text-[14px] font-semibold transition lg:flex-none ${on ? 'bg-white text-ink shadow-sm' : 'text-mute'}`;

  return (
    <section className="space-y-3 lg:space-y-4">
      {head}

      {/* 한눈에 */}
      <div className="grid grid-cols-3 gap-2 rounded-box bg-white p-5 lg:p-6">
        <Stat label="기관" value={orgs.length} unit="곳" tone="text-brand" />
        <Stat label={scope === 'none' ? '공고 없이 계약' : scope === 'sui' ? '수의계약' : '계약'} value={contracts} unit="건" />
        <Stat label="합계" text={amount ? fmtShort(amount) : '–'} />
        {soon > 0 && (
          <button type="button" onClick={() => setSort('end')} className="col-span-3 mt-2 rounded-2xl bg-warn/10 px-4 py-2.5 text-left text-[14px] text-sub">
            <b className="font-semibold text-warn">{soon}곳</b>은 {SOON}일 안에 지금 계약이 끝나요 · 끝나는 순으로 보기
          </button>
        )}
      </div>

      {/* 거르기 */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 rounded-btn bg-line/60 p-1 lg:flex-none" role="tablist">
            {([['none', '공고 없이'], ['sui', '수의계약 전체'], ['all', '모든 계약']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={seg(scope === k)}>{l}</button>
            ))}
          </div>
          <Tip title="공고 없이">수의계약 중 나라장터 입찰·견적 공고 없이 맺은 계약이에요. 입찰정보 서비스에는 보이지 않는 구매예요. &apos;수의계약 전체&apos;는 견적 공고를 낸 수의계약까지 포함해요.</Tip>
        </div>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          {savedOrgs.length > 0 && <button type="button" onClick={() => setOnlySaved((v) => !v)} className={chip(onlySaved)}>저장한 기관 {savedOrgs.length}</button>}
          {sido && <button type="button" onClick={() => setMine((v) => !v)} className={chip(mine)}>우리 지역({sidoShort(sido)})</button>}
          <button type="button" onClick={() => setSmall((v) => !v)} className={chip(small)}>2천만 원 이하</button>
          {KIND_GROUPS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(kind === k.key ? null : k.key)} className={chip(kind === k.key)}>{k.label}</button>
          ))}
        </div>
      </div>

      <Card title={`기관 ${orgs.length.toLocaleString()}곳`} aside={
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="정렬" className="h-9 rounded-btn bg-fill px-2 text-[14px] font-semibold text-sub">
          <option value="count">많이 산 순</option>
          <option value="end">계약 끝나는 순</option>
          <option value="recent">최근 계약 순</option>
        </select>
      }>
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

      <p className="px-1 text-[12px] leading-relaxed text-mute">
        나라장터 계약 정보의 품목 코드(물품분류번호·공공조달분류)를 주요 품목 {codes.size}개와 맞췄어요. 품목 코드는 2026년 11월 15일부터 모으기 시작해 아직 기간이 짧아요.
        저장한 기관은 진행 중 계약이 끝나기 {ORG_END_DAYS}일 전과 새 공고를 낼 때 알림함으로 알려드려요.
        조달청이 대신 계약한 건은 실제로 산 기관(수요기관)으로 묶었고, 조달청 단가계약은 뺐어요. &apos;우리 지역&apos;은 기관 이름으로 추정해요.
      </p>
    </section>
  );
}

function Stat({ label, value, unit, text, tone = 'text-ink' }: { label: string; value?: number; unit?: string; text?: string; tone?: string }) {
  return (
    <div>
      <p className="text-[12px] text-mute">{label}</p>
      <p className={`mt-0.5 text-[24px] font-bold tabular-nums lg:text-[28px] ${tone}`}>
        {text ?? (value ?? 0).toLocaleString()}{unit && <span className="ml-0.5 text-[14px] font-medium text-mute">{unit}</span>}
      </p>
    </div>
  );
}

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
            {o.count}건 · {o.amount ? fmtShort(o.amount) : '금액 없음'}{o.last ? ` · 최근 ${o.last.slice(5).replace('-', '.')}` : ''}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1.5 text-[12px]">
            {left !== null && (
              <span className={`rounded-full px-2 py-0.5 font-semibold ${left <= SOON ? 'bg-warn/10 text-warn' : 'bg-fill text-sub'}`}>
                계약 끝 {o.nextEnd!.slice(2).replaceAll('-', '.')} · D-{left}
              </span>
            )}
            {o.depts.map((d) => <span key={d} className="rounded-full bg-brand-soft px-2 py-0.5 text-brand">{d}</span>)}
            {o.vendors[0] && <span className="rounded-full bg-fill px-2 py-0.5 text-sub">지금 거래 {o.vendors[0].name}{o.vendors.length > 1 ? ` 외 ${o.vendors.length - 1}` : ''}</span>}
          </span>
        </span>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-mute transition ${open ? 'rotate-180' : ''}`} />
      </button>
      <button type="button" onClick={onSave} aria-pressed={saved} aria-label={saved ? '저장 해제' : '기관 저장'}
        className={`-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${saved ? 'text-brand' : 'text-mute hover:text-sub'}`}>
        <Bookmark className={`h-5 w-5 ${saved ? 'fill-current' : ''}`} />
      </button>
      </div>
      {open && (
        <ul className="mt-3 space-y-2">
          {o.contracts.slice(0, 10).map((c) => (
            <li key={c.id} className="rounded-2xl bg-fill/70 px-3.5 py-3">
              <p className="text-[14px] font-medium leading-snug">{c.title}</p>
              <p className="mt-1 text-[12px] tabular-nums text-mute">
                {c.kind} · {c.date ? c.date.replaceAll('-', '.') : '계약일 없음'} · {c.amount ? `${fmtNum(c.amount)}원` : '금액 없음'}
                {c.endDate ? ` · ${c.endDate.replaceAll('-', '.')}까지` : ''}
              </p>
              <p className="mt-1 text-[12px] text-sub">
                {c.vendors.length ? `업체 ${c.vendors.slice(0, 2).join(', ')}${c.vendors.length > 2 ? ` 외 ${c.vendors.length - 2}` : ''}` : ''}
                {c.matched.length ? `${c.vendors.length ? ' · ' : ''}품목 ${c.matched.slice(0, 2).join(', ')}` : ''}
              </p>
              {c.items.filter((i) => i.unitPrice).slice(0, 2).map((i, k) => (
                <p key={k} className="mt-0.5 truncate text-[12px] tabular-nums text-mute">· {i.name} — 단가 {fmtNum(i.unitPrice!)}원{i.qty ? ` × ${fmtNum(i.qty)}` : ''}</p>
              ))}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                {c.noNotice && <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-brand">공고 없이</span>}
                {c.basis && <span className="rounded bg-white px-1.5 py-0.5 text-sub">{c.basis.length > 28 ? `${c.basis.slice(0, 28)}…` : c.basis}</span>}
                {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-sub underline">나라장터<ExternalLink className="h-3 w-3" /></a>}
              </div>
            </li>
          ))}
          {o.contracts.length > 10 && <li className="text-center text-[12px] text-mute">최근 10건만 보여드려요 (전체 {o.contracts.length}건)</li>}
        </ul>
      )}
    </li>
  );
}
