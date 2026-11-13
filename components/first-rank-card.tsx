'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, ExternalLink, Trophy } from 'lucide-react';
import { fmtDate } from '@/lib/format';
import { QUAL_CHECKLIST, QUOTE_CHECKLIST, fetchFirstRanks, type FirstRank } from '@/lib/first-rank';
import { useStore } from '@/lib/store';

/*
 * 홈 맨 위 — "1순위예요! 적격심사 서류를 준비하세요" (기획 16장 A1)
 * 회사 확인 회원만. 체크 상태는 이 기기에만 저장(편의 기능)
 */

const KEY = 'bc3:firstrank-checks';
const readChecks = (): Record<string, string[]> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
};
const writeChecks = (v: Record<string, string[]>) => {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* 저장소를 못 써도 화면은 동작 */ }
};

export function FirstRankCards() {
  const { account, profile } = useStore();
  const [items, setItems] = useState<FirstRank[]>([]);
  const [checks, setChecks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!account || !profile.corpName) { setItems([]); return; }
    setChecks(readChecks());
    fetchFirstRanks().then(setItems).catch(() => setItems([]));
  }, [account, profile.corpName]);

  if (!items.length) return null;

  const toggle = (id: number, key: string) => {
    const cur = new Set(checks[id] ?? []);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    const next = { ...checks, [id]: [...cur] };
    setChecks(next);
    writeChecks(next);
  };

  return (
    <section className="mt-5 space-y-3" aria-label="1순위 심사 중">
      {items.map((f) => <FirstRankCard key={f.item.id} f={f} done={new Set(checks[f.item.id] ?? [])} onToggle={(k) => toggle(f.item.id, k)} />)}
    </section>
  );
}

export function FirstRankCard({ f, done, onToggle }: { f: FirstRank; done: Set<string>; onToggle: (key: string) => void }) {
  const list = f.kind === 'quote' ? QUOTE_CHECKLIST : f.kind === 'qual' ? QUAL_CHECKLIST : null;
  const left = f.due ? Math.ceil((f.due.getTime() - Date.now()) / 86400e3) : null;
  const title = f.kind === 'qual' ? '1순위예요! 적격심사 서류를 준비하세요'
    : f.kind === 'quote' ? '견적 1순위예요! 계약 서류 요청을 확인하세요'
      : '1순위예요! 낙찰자 결정을 기다리는 중이에요';
  const doneCount = list ? list.filter((c) => done.has(c.key)).length : 0;

  return (
    <article className="rounded-box bg-white p-5 ring-2 ring-brand/30 lg:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"><Trophy className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold leading-snug">{title}</p>
          <Link href={`/analysis/${f.item.id}`} className="mt-1 line-clamp-2 block text-[14px] text-sub hover:underline">{f.item.title}</Link>
          <p className="mt-0.5 text-[13px] text-mute">{f.item.org ?? ''} · 개찰 {fmtDate(new Date(f.item.opened_at))}{f.item.rate ? ` · 투찰률 ${f.item.rate}%` : ''}</p>
        </div>
        {left !== null && (
          <div className="shrink-0 text-right">
            <p className={`text-[22px] font-bold tabular-nums ${left <= 2 ? 'text-bad' : 'text-brand'}`}>{left >= 0 ? `D-${left}` : '기한 지남?'}</p>
            <p className="text-[11px] text-mute">개찰일+{7}일(추정)</p>
          </div>
        )}
      </div>

      {list && (
        <>
          <div className="mt-4 flex items-center justify-between text-[13px]">
            <span className="font-semibold text-sub">준비할 서류</span>
            <span className="tabular-nums text-mute">{doneCount}/{list.length}</span>
          </div>
          <ul className="mt-2 divide-y divide-line rounded-2xl bg-fill/60">
            {list.map((c) => {
              const on = done.has(c.key);
              return (
                <li key={c.key}>
                  <button type="button" onClick={() => onToggle(c.key)} aria-pressed={on} className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left">
                    {on ? <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" /> : <Circle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-mute" />}
                    <span className="min-w-0">
                      <span className={`block text-[14px] ${on ? 'text-mute line-through' : 'font-medium text-ink'}`}>{c.label}</span>
                      <span className="block text-[12px] text-mute">{c.hint}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {f.url && (
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white">
            나라장터에서 확인<ExternalLink className="h-4 w-4" />
          </a>
        )}
        <Link href={`/analysis/${f.item.id}`} className="inline-flex h-10 items-center gap-0.5 rounded-btn bg-fill px-4 text-[14px] font-semibold text-sub">
          개찰 결과<ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-mute">
        {f.kind === 'qual'
          ? '기한은 발주기관 기준에 따라 5~7일이고, 나라장터 통보일부터 세요. 놓치면 차순위로 넘어가요. 공고의 적격심사 세부기준을 꼭 확인하세요.'
          : '1순위라도 낙찰이 확정된 건 아니에요. 발주기관 안내를 확인하세요.'}
      </p>
    </article>
  );
}
