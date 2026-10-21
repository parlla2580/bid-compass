import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calculator, Scale } from 'lucide-react';
import { BackHeader, Shell } from '@/components/layout';
import { BTN_PRIMARY, DdayBadge, MatchBadge, TypeTag } from '@/components/ui';
import { BIDS, getBid } from '@/lib/data';
import { deadlineOf, fmtDate, fmtWon } from '@/lib/format';
import { DetailActions, QualificationCard } from './client';

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return BIDS.map((b) => ({ id: String(b.id) }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const bid = getBid((await params).id);
  return { title: bid?.title ?? '공고 상세' };
}

const PERIOD_LABEL = { '물품': '납품기한', '용역': '용역기간', '공사': '공사기간' } as const;

export default async function BidDetailPage({ params }: Props) {
  const b = getBid((await params).id);
  if (!b) notFound();

  const rows: [string, React.ReactNode][] = [
    ['발주기관', b.org],
    ['공고번호', b.no],
    ['입찰방법', '전자입찰'],
    ['계약방식', b.regionLimit ? `제한경쟁 (${b.regionLimit} 지역제한)` : '일반경쟁'],
    ['낙찰방식', b.award],
    ['추정가격', <b key="p">{fmtWon(b.price)}</b>],
    [PERIOD_LABEL[b.type], b.period],
    ['입찰마감', (
      <>
        {fmtDate(deadlineOf(b.d))} 18:00{' '}
        <span className={`font-bold ${b.d <= 3 ? 'text-red-500' : 'text-primary'}`}>(D-{b.d})</span>
      </>
    )],
  ];
  const lawName = b.lawNote ? `${b.lawNote}(국가계약법 준용)` : b.law;
  const calcHref = `/calculator?price=${b.price}&type=${encodeURIComponent(b.type)}&law=${b.law === '지방계약법' ? 'local' : 'national'}&from=${b.id}`;

  return (
    <Shell>
      <BackHeader title="공고 상세" />
      <main className="space-y-4 px-4 pb-28 pt-4">
        <section>
          <div className="flex items-center gap-1.5">
            <TypeTag type={b.type} />
            <DdayBadge d={b.d} />
          </div>
          <h1 className="mt-2 text-xl font-bold leading-snug">{b.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{b.org}</p>
          <div className="mt-3"><MatchBadge match={b.match} size="lg" /></div>
        </section>

        <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-bold">기본 정보</h2>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row" className="w-28 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500">{k}</th>
                  <td className="px-4 py-3 text-slate-800">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-r-lg border-l-4 border-primary bg-blue-50 px-4 py-3.5 text-sm leading-relaxed text-slate-700">
          <div className="mb-1 flex items-center gap-1.5 font-bold text-primary"><Scale className="h-4 w-4" />적용 법률 안내</div>
          이 공고는 <b>{lawName}</b>이 적용되며, <b>{b.award}</b> 방식으로 낙찰자가 결정됩니다.
        </section>

        <QualificationCard bid={b} />

        <section className="space-y-2.5 pt-1">
          <Link href={calcHref} className={BTN_PRIMARY}><Calculator className="h-5 w-5" />적격심사 계산기</Link>
          <DetailActions bidId={b.id} />
        </section>
      </main>
    </Shell>
  );
}
