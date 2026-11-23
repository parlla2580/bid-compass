'use client';

import Link from 'next/link';
import { Bell, BellRing, Calculator, FileSearch, Info } from 'lucide-react';
import { Term } from '@/components/term';
import { Tip } from '@/components/tip';
import { useToast } from '@/components/feedback';
import { baseStatus, looksUnitPrice, previewBase, type Notice } from '@/lib/data';
import { fmtWon } from '@/lib/format';
import { useStore } from '@/lib/store';
import { calcBid } from './rules';

/*
 * 기초금액이 없는 공고 — 빈 계산기 대신 경우별 안내 (2026-11-18)
 *  공개 전(복수예가): 저장하면 공개될 때 알림 + 추정가격 × 1.1 미리보기(추정, 이 값으로 투찰 버튼 없음)
 *  비예가: 사정률 계산 대상이 아님을 설명
 *  단일예가·방식 없음: 공고문의 금액을 직접 넣도록
 *  단일예가 (2026-11-18 보강) — 지금 올라온 968건 대부분이 하한율 없는 최저가·협상·규격가격동시·수의시담
 *    하한율 있음: 예산(없으면 추정가격 + 부가세)을 예정가격으로 보고 '계산해 보기' (추정)
 *    하한율 없음: 하한선에 붙여 쓰는 계산이 맞지 않음 → 낙찰 방식 설명 + 예산 참고 금액, 계산 칸은 숨김
 */
export function BaseNotice({ notice, range, rate, budget = null, onEstimate }: {
  notice: Notice; range: number; rate: number;
  /** 배정예산 (부가세 포함) */
  budget?: number | null;
  /** 단일예가 + 하한율 공고 — 참고 금액을 예정가격으로 보고 계산 */
  onEstimate?: (plan: number) => void;
}) {
  const st = baseStatus(notice);
  const unit = st === 'ok' && looksUnitPrice(notice);
  if (st === 'ok' && !unit) return null;

  return (
    <div className="rounded-box bg-white px-5 py-4 text-[14px] leading-relaxed text-sub lg:col-span-2">
      {unit && <p><b className="font-semibold text-ink">단가 입찰로 보여요.</b> 기초금액({fmtWon(notice.basePrice!)})이 추정가격보다 훨씬 작아요. 1개·1회 단가 기준으로 계산돼요. (추정)</p>}
      {st === 'pending' && <Pending notice={notice} range={range} rate={rate} />}
      {st === 'noDraw' && (
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-mute" />
          <div>
            <p className="flex items-center gap-1"><b className="font-semibold text-ink"><Term k="비예가">비예가</Term> · 투찰금액 계산 대상 아님</b>
              <Tip title="비예가">예정가격을 추첨하지 않는 공고예요. 가격 평가 방법은 공고문을 확인하세요.</Tip></p>
            <p className="mt-1">{howWins(notice.award ?? '')}</p>
            <RefPrices notice={notice} budget={budget} />
            <DocLink url={notice.url} />
          </div>
        </div>
      )}
      {st === 'single' && <Single notice={notice} budget={budget} onEstimate={onEstimate} />}
      {st === 'catalog' && (
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-mute" />
          <div>
            <p className="flex items-center gap-1"><b className="font-semibold text-ink">쇼핑몰·단가계약 · 투찰금액 계산 대상 아님</b>
              <Tip title="쇼핑몰·단가계약">{/다수공급자|카탈로그/.test(notice.award)
                ? `${/다수공급자/.test(notice.award) ? '다수공급자계약(MAS)' : '카탈로그계약'}: 한 번의 입찰이 아니라, 계약한 업체 상품을 종합쇼핑몰에서 기관들이 골라 사는 방식이에요.`
                : '‘각 수요기관’ 공고: 조달청이 여러 기관이 쓸 물품을 한꺼번에 계약해요.'} 마감이 먼 경우가 많아요.</Tip></p>
            <p className="mt-1 text-[13px] text-mute">추정가격 = 계약 전체 규모 (업체별 금액 아님) · 참여 조건은 공고문</p>
            <DocLink url={notice.url} />
          </div>
        </div>
      )}
      {st === 'unknown' && <p><b className="font-semibold text-ink">기초금액 없음</b> · 공고문 값 직접 입력</p>}
    </div>
  );
}

function Pending({ notice, range, rate }: { notice: Notice; range: number; rate: number }) {
  const { account, saved, toggleSaved } = useStore();
  const toast = useToast();
  const on = saved.includes(notice.id);
  const pre = previewBase(notice);
  const r = pre && rate ? calcBid(pre, range / 100, rate) : null;
  return (
    <div>
      <div className="flex gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1"><b className="font-semibold text-ink"><Term k="기초금액" /> 공개 전</b>
            <Tip title="기초금액 공개 전">기초금액은 보통 마감 며칠 전에 공개돼요. 공고를 저장해 두면 공개될 때 알려 드려요.</Tip></p>
          <p className="mt-1">공개 시 알림함으로 알림</p>
          {on ? (
            <p className="mt-2 inline-flex items-center gap-1 font-semibold text-ok"><BellRing className="h-4 w-4" />저장됨 · 공개 시 알림</p>
          ) : account ? (
            <button type="button" onClick={() => { toggleSaved(notice.id); toast('저장했어요. 기초금액이 나오면 알려 드릴게요'); }}
              className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white active:scale-[.98]">
              <Bell className="h-4 w-4" />저장하고 공개 알림 받기
            </button>
          ) : (
            <Link href={`/bids/${notice.id}`} className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white">
              <Bell className="h-4 w-4" />가입하고 공개 알림 받기
            </Link>
          )}
        </div>
      </div>
      {pre && r && (
        <div className="mt-4 rounded-xl bg-fill px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-warn">미리보기 · 추정</p>
          <p className="mt-1 text-ink"><Term k="추정가격" /> {fmtWon(notice.estPrice)} × 1.1(부가세) ≒ 기초금액 <b className="tabular-nums">{fmtWon(pre)}</b></p>
          <p className="mt-0.5 text-ink">투찰 하한 약 <b className="tabular-nums">{fmtWon(r.floor[0])} ~ {fmtWon(r.floor[1])}</b></p>
          <p className="mt-2 flex items-center gap-1 text-[12px] text-mute">±2% 안 적중: 공사 96% · 용역 85% · 물품 78%
            <Tip title="미리보기 정확도">지난 공고에서 실제 기초금액이 이 추정의 ±2% 안에 든 비율이에요. 예산을 가늠하는 용도이니, 투찰은 기초금액이 나온 뒤 다시 계산하세요.</Tip></p>
        </div>
      )}
    </div>
  );
}

const DocLink = ({ url }: { url: string | null }) => url
  ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-brand"><FileSearch className="h-4 w-4" />공고문 보기</a>
  : null;

/** 예정가격을 가늠할 참고 금액 — 배정예산(공고 원본), 없으면 추정가격 + 부가세 */
const refPrice = (n: Notice, budget: number | null) => budget ?? (n.estPrice > 0 ? Math.round(n.estPrice * 1.1) : null);

function RefPrices({ notice, budget }: { notice: Notice; budget: number | null }) {
  if (!budget && !(notice.estPrice > 0)) return null;
  return (
    <dl className="mt-3 space-y-1 rounded-xl bg-fill px-4 py-3 text-[14px]">
      {budget && <div className="flex justify-between gap-3"><dt className="text-mute">예산 (부가세 포함)</dt><dd className="font-semibold tabular-nums text-ink">{fmtWon(budget)}</dd></div>}
      {notice.estPrice > 0 && Math.abs((budget ?? 0) - notice.estPrice * 1.1) > 1000 && <div className="flex justify-between gap-3"><dt className="text-mute"><Term k="추정가격" /> + 부가세</dt><dd className="tabular-nums text-ink">{fmtWon(Math.round(notice.estPrice * 1.1))}</dd></div>}
      {notice.award && <div className="flex justify-between gap-3"><dt className="shrink-0 text-mute">낙찰 방법</dt><dd className="text-right text-ink">{notice.award.split('-')[0]}</dd></div>}
    </dl>
  );
}

function howWins(award: string): string {
  if (/협상/.test(award)) return '낙찰: 제안서 기술·가격 평가 후 협상';
  if (/수의/.test(award)) return '낙찰: 수의 가격 협의';
  if (/규격가격|2단계/.test(award)) return '낙찰: 규격 통과 업체 중 예정가격 이하 최저가';
  if (/최저가/.test(award)) return '낙찰: 예정가격 이하 최저가 · 하한선 없음';
  return '낙찰 방법: 공고문 확인';
}

function Single({ notice, budget, onEstimate }: { notice: Notice; budget: number | null; onEstimate?: (plan: number) => void }) {
  const ref = refPrice(notice, budget);
  const rate = notice.floorRate;
  return (
    <div className="flex gap-3">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-mute" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1"><b className="font-semibold text-ink"><Term k="단일예가">단일예가</Term> · 기초금액·사정률 없음</b>
          <Tip title="단일예가">예정가격을 추첨하지 않고 하나로 정하는 공고예요. 예정가격은 보통 개찰 때 공개돼요.</Tip></p>
        {rate ? (
          <>
            <p className="mt-1"><Term k="낙찰하한율" /> {rate}% · 예산 기준 하한선 약 <b className="tabular-nums text-ink">{ref ? fmtWon(Math.ceil(ref * rate / 100)) : '—'}</b> <span className="text-mute">(추정)</span></p>
            <RefPrices notice={notice} budget={budget} />
            {ref && onEstimate && (
              <button type="button" onClick={() => onEstimate(ref)}
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white active:scale-[.98]">
                <Calculator className="h-4 w-4" />이 금액을 예정가격으로 보고 계산하기
              </button>
            )}
            <p className="mt-2 flex items-center gap-1 text-[12px] text-mute">예산 = 예정가격 가정
              <Tip title="예산 기준 추정">실제 예정가격은 예산보다 낮을 수 있고, 그러면 하한선도 내려가요. 공고문에 금액이 있으면 그 값을 넣으세요.</Tip></p>
          </>
        ) : (
          <>
            <p className="mt-1">{howWins(notice.award ?? '')} · 투찰금액 계산 대상 아님</p>
            <RefPrices notice={notice} budget={budget} />
            <p className="mt-2 text-[12px] text-mute">예산 = 발주처 배정 금액 · 참고용</p>
          </>
        )}
        <DocLink url={notice.url} />
      </div>
    </div>
  );
}
