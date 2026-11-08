import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BookOpen, Info } from 'lucide-react';
import { BackHeader, Shell } from '@/components/layout';
import { Term } from '@/components/term';
import { DdayBadge, NewBadge, TypeTag } from '@/components/ui';
import { NOTICES, getNotice, type Award, type Contract } from '@/lib/data';
import { deadlineOf, fmtDate, fmtWon } from '@/lib/format';
import { eligibilitySummary, explain } from '@/lib/judge';
import type { TermKey } from '@/lib/terms';
import { DetailActions, JudgmentCard } from './client';

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return NOTICES.map((n) => ({ id: String(n.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const n = getNotice((await params).id);
  return { title: n?.title ?? '공고 상세' };
}

const termOf = (v: Contract | Award) => v as TermKey;

/** S4. 공고 상세 */
export default async function NoticeDetailPage({ params }: Props) {
  const n = getNotice((await params).id);
  if (!n) notFound();
  const ex = explain(n);
  const closed = n.d < 0;

  const rows: [React.ReactNode, React.ReactNode][] = [
    ['공고번호', n.no],
    ['발주기관', n.org],
    ['계약방식', <Term key="c" k={termOf(n.contract)} />],
    ['낙찰방식', <Term key="a" k={termOf(n.award)} />],
    ['참가자격', eligibilitySummary(n)],
    [<Term key="e" k="추정가격" />, <b key="p">{fmtWon(n.estPrice)}</b>],
    [<Term key="b" k="기초금액" />, fmtWon(n.basePrice)],
    [{ '물품': '납품기한', '용역': '용역기간', '공사': '공사기간' }[n.type], n.period],
    ['입찰마감', (
      <>
        {fmtDate(deadlineOf(n.d))} {n.closeTime}{' '}
        {!closed && <span className={`font-bold ${n.d <= 3 ? 'text-red-500' : 'text-primary'}`}>(D-{n.d})</span>}
      </>
    )],
  ];

  return (
    <Shell>
      <BackHeader title="공고 상세" />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <section>
          <div className="flex items-center gap-1.5">
            <TypeTag type={n.type} />
            <DdayBadge d={n.d} />
            {n.posted === 0 && <NewBadge />}
          </div>
          <h1 className="mt-2 text-xl font-bold leading-snug">{n.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{n.org}</p>
        </section>

        {closed && (
          <p className="flex items-center gap-2 rounded-lg bg-slate-200 px-3.5 py-3 text-sm font-medium text-slate-600">
            <Info className="h-4 w-4 shrink-0" />마감된 공고입니다. 참여 가능 판정과 추천에서 제외됩니다.
          </p>
        )}

        {/* 공고 해설 카드 (F2-3) */}
        <section className="rounded-card border border-blue-100 bg-blue-50/70 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-primary"><BookOpen className="h-4 w-4" />공고 해설</h2>
          <dl className="space-y-2.5 text-sm">
            {[
              ['누가 참여하나', ex.who, null],
              ['어떻게 뽑나', ex.how, null],
              ['어떤 법이 적용되나', ex.law, '추정'],
            ].map(([q, a, tag]) => (
              <div key={q}>
                <dt className="text-xs font-semibold text-slate-500">{q}</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {a}
                  {tag && <span className="ml-1.5 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">{tag}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 border-t border-blue-100 pt-3 text-xs leading-relaxed text-slate-600">
            계약방식과 낙찰방식은 별개입니다. 제한경쟁이라고 모두 적격심사는 아닙니다.
          </p>
        </section>

        {!closed && <JudgmentCard notice={n} />}

        <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold">공고 정보</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {rows.map(([k, v], i) => (
                <tr key={i}>
                  <th scope="row" className="w-28 bg-slate-50 px-4 py-3 text-left align-top font-medium text-slate-500">{k}</th>
                  <td className="px-4 py-3 text-slate-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <DetailActions notice={n} />
      </main>
    </Shell>
  );
}
