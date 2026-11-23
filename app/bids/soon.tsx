'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Tip } from '@/components/tip';
import { fmtShort } from '@/lib/format';
import { fetchPrespecs, matchPrespecs, type Prespec, type PrespecMatch, type PrespecStatus } from '@/lib/prespecs';
import { useStore } from '@/lib/store';
import { LoadingBox } from '@/components/loading';

/*
 * 공고 › 곧 나올 공고 (사전규격, 022)
 * 담당자의 질문: "곧 나올 우리 일은? 미리 준비하거나 규격에 의견을 낼 수 있나?"
 *  상태 3가지 — 의견 낼 수 있어요(의견 마감 전) / 공고 기다리는 중 / 공고 나왔어요(→ 공고 상세)
 */

export function useSoon() {
  const { profile, stats } = useStore();
  const [list, setList] = useState<Prespec[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchPrespecs().then(setList).catch((e: Error) => setError(e.message)); }, []);
  const matches = useMemo(() => (list ? matchPrespecs(list, profile, stats) : null), [list, profile, stats]);
  return { list, matches, error };
}

const STATUS: Record<Exclude<PrespecStatus, 'closed'>, { label: string; c: string }> = {
  opinion: { label: '의견 낼 수 있어요', c: 'bg-brand-soft text-brand' },
  waiting: { label: '공고 기다리는 중', c: 'bg-fill text-sub' },
  noticed: { label: '공고 나왔어요', c: 'bg-ink text-white' },
};
const ORDER: Exclude<PrespecStatus, 'closed'>[] = ['opinion', 'waiting', 'noticed'];
const PAGE = 30;

const dLeft = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400e3);
const md = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`;

export function SoonList({ list, matches, error }: ReturnType<typeof useSoon>) {
  const { profile } = useStore();
  const [st, setSt] = useState<PrespecStatus | null>(null);
  const [everything, setEverything] = useState(false);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [st, everything]);

  if (error) { console.warn('곧 나올 공고 불러오기 실패:', error); return <p className="rounded-box bg-white p-5 text-[15px] text-sub">잠시 뒤 다시 시도해 주세요 <span className="text-mute">· 곧 나올 공고 불러오기 실패</span></p>; }
  if (!list || !matches) return <LoadingBox className="h-40" />;

  const base: PrespecMatch[] = everything ? list.filter((p) => p.status !== 'closed').map((p) => ({ p, why: '', sim: 0 })) : matches;
  const count = (s: PrespecStatus) => base.filter((m) => m.p.status === s).length;
  const rows = base.filter((m) => !st || m.p.status === st).sort((a, b) =>
    ORDER.indexOf(a.p.status as never) - ORDER.indexOf(b.p.status as never)
    || (a.p.status === 'opinion' ? (a.p.opinionClose?.getTime() ?? 0) - (b.p.opinionClose?.getTime() ?? 0) : (b.p.receivedAt?.getTime() ?? 0) - (a.p.receivedAt?.getTime() ?? 0)));
  const chip = (on: boolean) => `h-9 shrink-0 rounded-full px-3.5 text-[14px] font-semibold transition ${on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-1 rounded-box bg-white px-5 py-4 text-[14px] leading-relaxed text-sub">
        <p className="flex-1">
          {everything ? '최근 30일 사전규격 전체예요.' : <>정식 공고 전에 규격서와 예산을 먼저 공개한 사업 중 <b className="font-semibold text-ink">우리 일과 맞는 {matches.length.toLocaleString()}건</b>이에요.</>}
          {' '}미리 준비하고, 의견 마감 전이면 규격에 의견을 낼 수 있어요.
        </p>
        <Tip title="사전규격">공고 전에 기관이 규격과 예산을 미리 공개하는 단계예요. 실제 공고가 안 나거나 내용이 바뀔 수 있어요.</Tip>
      </div>

      {!profile.products?.length && !everything && (
        <Link href="/mypage?edit=company" className="flex items-center gap-3 rounded-box bg-white px-5 py-4 text-[15px] hover:bg-white/70">
          <span className="flex-1 text-sub"><b className="font-semibold text-ink">주요 품목</b>을 넣으면 우리 일과 맞는 사전규격을 골라 드려요</span>
          <ChevronRight className="h-5 w-5 text-mute" />
        </Link>
      )}

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 lg:mx-0 lg:px-0">
        <button type="button" onClick={() => setSt(null)} className={chip(!st)}>전체 {base.length.toLocaleString()}</button>
        {ORDER.map((s) => <button key={s} type="button" onClick={() => setSt(st === s ? null : s)} className={chip(st === s)}>{STATUS[s].label} {count(s).toLocaleString()}</button>)}
      </div>

      {rows.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-box bg-white">
          {rows.slice(0, shown).map((m) => <Row key={m.p.id} m={m} />)}
        </ul>
      ) : <p className="rounded-box bg-white px-5 py-12 text-center text-[15px] text-mute">{everything ? '해당하는 사전규격이 없어요' : '지금은 우리 일과 맞는 사전규격이 없어요'}</p>}
      {rows.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="h-11 w-full rounded-btn bg-white text-[14px] font-semibold text-sub">더 보기 ({(rows.length - shown).toLocaleString()}건)</button>
      )}

      <button type="button" onClick={() => { setEverything((v) => !v); setSt(null); }} className="w-full py-2 text-center text-[14px] font-semibold text-sub underline">
        {everything ? '우리 일과 맞는 것만 보기' : `사전규격 전체 ${list.filter((p) => p.status !== 'closed').length.toLocaleString()}건 보기`}
      </button>
    </div>
  );
}

function Row({ m }: { m: PrespecMatch }) {
  const [open, setOpen] = useState(false);
  const p = m.p;
  const s = STATUS[p.status as Exclude<PrespecStatus, 'closed'>];
  const left = p.opinionClose ? dLeft(p.opinionClose) : null;
  const meta = [p.demandOrg ?? p.org, p.kind, p.budget ? `예산 ${fmtShort(p.budget)}원` : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-fill/50">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${s.c}`}>{s.label}{p.status === 'opinion' && left !== null ? ` · D-${Math.max(0, left)}` : ''}</span>
            {p.sw && <span className="rounded bg-fill px-1.5 py-0.5 text-[11px] text-mute">SW사업</span>}
          </span>
          <span className="mt-1 line-clamp-2 block text-[15px] font-semibold leading-snug">{p.title}</span>
          <span className="mt-0.5 block truncate text-[13px] text-mute">{meta}</span>
          {m.why && <span className="mt-0.5 block truncate text-[12px] text-brand">{m.why}</span>}
        </span>
        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-mute transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 px-5 pb-4 text-[13px]">
          <dl className="grid grid-cols-[88px_1fr] gap-y-1 rounded-2xl bg-fill/70 px-4 py-3">
            {p.org && p.demandOrg && p.org !== p.demandOrg && <><dt className="text-mute">발주기관</dt><dd>{p.org}</dd></>}
            {p.receivedAt && <><dt className="text-mute">공개</dt><dd className="tabular-nums">{md(p.receivedAt)}</dd></>}
            {p.opinionClose && <><dt className="text-mute">의견 마감</dt><dd className="tabular-nums">{md(p.opinionClose)}{left !== null && left >= 0 ? ` (D-${left})` : ' (지남)'}</dd></>}
            {p.deliveryUntil && <><dt className="text-mute">납품기한</dt><dd className="tabular-nums">{p.deliveryUntil.replaceAll('-', '.')}</dd></>}
            {p.products.length > 0 && <><dt className="text-mute">품목</dt><dd className="truncate">{p.products.slice(0, 3).map((x) => x.name).join(', ')}</dd></>}
          </dl>
          <div className="flex flex-wrap gap-2">
            {p.noticeId && (
              <Link href={`/bids/${p.noticeId}`} className="inline-flex h-9 items-center gap-1 rounded-btn bg-ink px-3 font-semibold text-white">공고 보기<ChevronRight className="h-4 w-4" /></Link>
            )}
            {p.files.slice(0, 3).map((f, i) => (
              <a key={f} href={f} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1 rounded-btn bg-fill px-3 font-semibold text-sub">
                <Download className="h-4 w-4" />규격서{p.files.length > 1 ? ` ${i + 1}` : ''}
              </a>
            ))}
          </div>
          {p.status === 'opinion' && <p className="text-[12px] text-mute">규격 의견은 나라장터 사전규격 화면에서 등록해요.</p>}
        </div>
      )}
    </li>
  );
}
