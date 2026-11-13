'use client';

import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { QUAL_CHECKLIST, QUAL_DAYS, QUOTE_CHECKLIST, fetchNoticeMeta, kindOf } from '@/lib/first-rank';
import { useInbox } from '@/lib/inbox';

/*
 * 입찰 진행 추적 (기획 16장 A1) — 개찰 상세 화면
 *  투찰 → 개찰(1순위) → 서류 제출 → 심사 → 결과
 *  1순위로 결정 전이면 서류 체크리스트 + [제출했어요]. 체크·제출 상태는 알림함 상태(019)에 저장
 */

type Step = { label: string; sub?: string; state: 'done' | 'now' | 'todo' };

export function BidTracker({ openingId, bidNo, openedAt, rank, won, decided }: {
  openingId: number; bidNo: string; openedAt: string; rank: number | null; won: boolean; decided: boolean;
}) {
  const { state, setDone, toggleCheck } = useInbox();
  const [meta, setMeta] = useState<{ award: string | null; url: string | null } | null>(null);
  useEffect(() => { fetchNoticeMeta(bidNo).then(setMeta).catch(() => setMeta({ award: null, url: null })); }, [bidNo]);

  if (!(rank === 1 || won)) return null; // 1순위였거나 낙찰한 건만
  const kind = kindOf(meta?.award ?? null);
  if (meta && kind === 'nego' && !won) return null;
  const key = `first:${openingId}`;
  const s = state(key);
  const submitted = !!s.done_at;
  const list = kind === 'qual' ? QUAL_CHECKLIST : kind === 'quote' ? QUOTE_CHECKLIST : null;
  const due = kind === 'qual' ? new Date(new Date(openedAt).getTime() + QUAL_DAYS * 86400e3) : null;
  const left = due ? Math.ceil((due.getTime() - Date.now()) / 86400e3) : null;

  const steps: Step[] = [
    { label: '투찰', state: 'done' },
    { label: '개찰', sub: rank === 1 ? '1순위' : rank ? `${rank}위` : undefined, state: 'done' },
    ...(list ? [{ label: '서류 제출', sub: submitted || decided ? '제출함' : left !== null ? (left >= 0 ? `D-${left}` : '기한 지남?') : undefined, state: (submitted || decided ? 'done' : 'now') as Step['state'] }] : []),
    { label: '심사', state: (decided ? 'done' : submitted || !list ? 'now' : 'todo') as Step['state'] },
    { label: '결과', sub: decided ? (won ? '낙찰' : '다른 회사') : undefined, state: (decided ? 'done' : 'todo') as Step['state'] },
  ];

  return (
    <section className="rounded-box bg-white p-5 lg:p-6">
      <h2 className="text-[17px] font-bold">입찰 진행</h2>
      <ol className="mt-4 flex items-start">
        {steps.map((st, i) => (
          <li key={st.label} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={`absolute right-1/2 top-[13px] h-0.5 w-full ${st.state === 'todo' ? 'bg-line' : 'bg-brand'}`} />}
            <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold ${
              st.state === 'done' ? 'bg-brand text-white' : st.state === 'now' ? 'bg-white text-brand ring-2 ring-brand' : 'bg-fill text-mute'}`}>
              {st.state === 'done' ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[13px] font-semibold ${st.state === 'todo' ? 'text-mute' : 'text-ink'}`}>{st.label}</span>
            {st.sub && <span className={`text-[12px] tabular-nums ${st.state === 'now' && left !== null && left <= 2 ? 'font-bold text-bad' : 'text-mute'}`}>{st.sub}</span>}
          </li>
        ))}
      </ol>

      {list && !decided && (
        <div className="mt-5">
          {!submitted ? (
            <>
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-sub">{kind === 'qual' ? '적격심사 서류' : '확인할 일'}</span>
                <span className="tabular-nums text-mute">{list.filter((c) => s.checks.includes(c.key)).length}/{list.length}</span>
              </div>
              <ul className="mt-2 divide-y divide-line rounded-2xl bg-fill/60">
                {list.map((c) => {
                  const on = s.checks.includes(c.key);
                  return (
                    <li key={c.key}>
                      <button type="button" onClick={() => toggleCheck(key, c.key)} aria-pressed={on} className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left">
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
              <button type="button" onClick={() => setDone(key, true)} className="mt-3 h-12 w-full rounded-btn bg-brand text-[15px] font-semibold text-white active:scale-[.99]">
                제출했어요
              </button>
            </>
          ) : (
            <div className="flex items-center justify-between rounded-2xl bg-brand-soft px-4 py-3 text-[14px]">
              <span className="font-semibold text-brand">서류를 제출했어요. 심사 결과를 기다려요</span>
              <button type="button" onClick={() => setDone(key, false)} className="text-[13px] text-sub underline">되돌리기</button>
            </div>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-mute">
            {kind === 'qual'
              ? `기한은 개찰일+${QUAL_DAYS}일로 추정했어요. 실제로는 나라장터 통보일부터 세고, 기관에 따라 5~7일이에요. 놓치면 차순위로 넘어가요.`
              : '1순위라도 낙찰이 확정된 건 아니에요. 발주기관 안내를 확인하세요.'}
          </p>
        </div>
      )}

      {meta?.url && !decided && (
        <a href={meta.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 items-center gap-1 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white">
          나라장터에서 확인<ExternalLink className="h-4 w-4" />
        </a>
      )}
    </section>
  );
}
