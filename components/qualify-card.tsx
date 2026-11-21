'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from './layout';
import { Tip } from './tip';
import type { Notice } from '@/lib/data';
import { fmtWon } from '@/lib/format';
import { useStore } from '@/lib/store';
import { amountAt, noticePass, tierOf } from '@/app/calculator/qualify';
import { fetchNoticeCost } from '@/lib/notices';

/*
 * 공고 상세 — 우리 회사 통과선 (로드맵 2, 2026-11-21)
 *  공사 적격심사 공고 + 계산기에서 저장한 점수(032) → 통과 투찰 비율 범위를 자동으로
 *  저장한 점수가 없으면 한 줄 안내(계산기 적격심사 탭으로)
 *  사정률 100% 가정 금액은 기초금액이 있을 때만 · A값은 계산기와 같은 값으로 반영(2026-11-22: 상세·계산기 금액 불일치 수정)
 */

const pct = (v: number) => `${v.toFixed(3)}%`;

export function QualifyCard({ n }: { n: Notice }) {
  const { profile } = useStore();
  const [a, setA] = useState(0);
  useEffect(() => {
    if (n.type !== '공사' || !n.basePrice) return;
    fetchNoticeCost(n.id).then((c) => setA(c?.aValue && c.aApply !== false ? c.aValue : 0)).catch(() => setA(0));
  }, [n.id, n.type, n.basePrice]);
  const eligible = n.type === '공사' && /적격심사/.test(n.award ?? '') && !!tierOf(n.estPrice);
  if (!eligible) return null;
  const href = `/calculator?from=${n.id}&tab=score`;
  const p = noticePass(n, profile.qualify);

  if (!p) {
    return (
      <Link href={href} className="flex items-center gap-3 rounded-box bg-white px-5 py-4 hover:bg-white/70">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">우리 회사 통과선</span>
          <span className="block text-[13px] text-mute">신용등급·실적 점수 저장 시 공사 공고마다 자동 계산</span>
        </span>
        <span className="flex shrink-0 items-center text-[14px] font-semibold text-brand">점수 입력<ChevronRight className="h-4 w-4" /></span>
      </Link>
    );
  }

  const { range, status, gap, floor, tier, nonPrice } = p;
  const badge = status === 'fail' ? { t: '통과 불가', c: 'bg-[#FEE2E2] text-bad' }
    : status === 'above' ? { t: `하한율 +${gap!.toFixed(3)}%p`, c: 'bg-[#FFF4E5] text-[#B45309]' }
      : { t: '하한율로 통과', c: 'bg-[#E7F6EC] text-ok' };
  const base = n.basePrice;

  return (
    <Card title={
      <span className="flex items-center gap-1">우리 회사 통과선
        <Tip title="계산 기준">행정안전부 시설공사 적격심사 세부기준 [별표 {tier.table}] · 적격통과 {tier.pass}점 · 저장한 점수로 가격 외 {nonPrice}점 → 가격점수 {range.need}점 필요. 투찰 비율 = (입찰가격 − A) ÷ (예정가격 − A).{p.local ? '' : ' 국가기관 공고: 조달청 기준표 원문 미확인(하한율 같으면 산식 같을 가능성 큼).'}</Tip>
      </span>}
      aside={<span className={`rounded-md px-2 py-0.5 text-[13px] font-semibold ${badge.c}`}>{badge.t}</span>}>
      {range.low === null ? (
        <p className="text-[15px] text-sub">가격점수 최고 {tier.price.max}점 · 가격 외 {Math.round((tier.pass - tier.price.max - nonPrice) * 1000) / 1000}점 부족</p>
      ) : (
        <>
          <p className="text-[12px] text-mute">통과 투찰 비율</p>
          <p className="mt-0.5 text-[24px] font-bold tabular-nums tracking-tight text-brand">
            {range.wide ? `${pct(range.low)} 이상` : `${pct(range.low)} ~ ${pct(range.high!)}`}
          </p>
          <p className="mt-0.5 text-[13px] tabular-nums text-mute">
            하한율 {pct(floor)}{!range.wide && ` · ${pct(range.high!)} 이상은 다시 미달`}
          </p>
          {base && (
            <p className="mt-2 text-[13px] text-sub">사정률 100% 가정 <b className="tabular-nums text-ink">{fmtWon(amountAt(base, range.low, a))}</b>{range.wide ? ' 이상' : ` ~ ${fmtWon(amountAt(base, range.high!, a))}`} <span className="text-mute">({a ? 'A값 반영' : 'A값 없음'})</span></p>
          )}
        </>
      )}
      {!p.local && <p className="mt-2 text-[12px] text-warn">국가기관 공고 · 기준표 원문 미확인</p>}
      <Link href={href} className="mt-3 inline-flex items-center text-[14px] font-semibold text-brand">계산기에서 조정<ChevronRight className="h-4 w-4" /></Link>
    </Card>
  );
}
