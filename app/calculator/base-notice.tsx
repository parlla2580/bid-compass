'use client';

import Link from 'next/link';
import { Bell, BellRing, Calculator, FileSearch, Info } from 'lucide-react';
import { Term } from '@/components/term';
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
            <p><b className="font-semibold text-ink">이 공고는 <Term k="비예가">비예가</Term> 방식이라 투찰금액 계산 대상이 아니에요.</b></p>
            <p className="mt-1">예정가격을 추첨하지 않아서 기초금액·<Term k="사정률" />로 금액을 정하지 않아요.
              {/협상/.test(notice.award) ? ' 협상에 의한 계약이라 제안서의 기술·가격 평가로 낙찰자를 정해요.' : ''} 가격 평가 방법은 공고문에서 확인하세요.</p>
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
            <p><b className="font-semibold text-ink">쇼핑몰·단가계약 공고라 투찰금액 계산 대상이 아니에요.</b></p>
            <p className="mt-1">{/다수공급자|카탈로그/.test(notice.award)
              ? `${/다수공급자/.test(notice.award) ? '다수공급자계약(MAS)' : '카탈로그계약'}은 한 번의 입찰로 낙찰자를 정하지 않고, 조건을 갖춘 업체와 계약해 제품을 나라장터 종합쇼핑몰에 올리면 수요기관이 골라 사는 방식이에요.`
              : '수요기관이 ‘각 수요기관’인 공고는 조달청이 여러 기관이 쓸 물품을 한꺼번에 계약하는 공고예요. 한 번의 입찰로 낙찰자를 정하는 일반 공고와 달라요.'} 계약 기간 동안 받는 공고라 마감이 먼 경우가 많아요.</p>
            <p className="mt-1 text-[13px] text-mute">추정가격은 계약 전체 규모로 보여요. 한 업체가 받는 금액과는 달라요. 참여 조건은 공고문에서 확인하세요.</p>
            <DocLink url={notice.url} />
          </div>
        </div>
      )}
      {st === 'unknown' && <p><b className="font-semibold text-ink">공고에 기초금액이 없어요.</b> 공고문에서 확인한 값을 직접 넣어 주세요.</p>}
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
          <p><b className="font-semibold text-ink"><Term k="기초금액" />은 아직 공개 전이에요.</b></p>
          <p className="mt-1">이 공고는 기초금액이 공고보다 늦게, 보통 마감 며칠 전에 공개돼요. 공개되면 알림함으로 바로 알려 드릴게요.</p>
          {on ? (
            <p className="mt-2 inline-flex items-center gap-1 font-semibold text-ok"><BellRing className="h-4 w-4" />저장했어요 — 공개되면 알려 드려요</p>
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
          <p className="mt-0.5 text-ink">그렇다면 투찰 하한은 대략 <b className="tabular-nums">{fmtWon(r.floor[0])} ~ {fmtWon(r.floor[1])}</b></p>
          <p className="mt-2 text-[12px] leading-relaxed text-mute">
            지금 올라온 공고로 보면 실제 기초금액이 이 값의 ±2% 안에 든 비율이 공사 96%·용역 85%·물품 78%예요(2026-11-18 실측). 단가 입찰은 맞지 않아요.
            예산을 가늠하는 용도로만 쓰고, 투찰은 실제 기초금액이 나온 뒤 다시 계산하세요.
          </p>
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
  if (/협상/.test(award)) return '제안서의 기술·가격 평가로 순위를 정하고 협상해서 계약해요.';
  if (/수의/.test(award)) return '경쟁 입찰 없이 가격을 협의해 계약하는 방식이에요.';
  if (/규격가격|2단계/.test(award)) return '규격(제안)을 먼저 통과한 업체 중 예정가격 이하로 가장 낮게 쓴 업체가 낙찰돼요.';
  if (/최저가/.test(award)) return '예정가격 이하로 쓴 업체 중 가장 낮은 금액이 낙찰돼요. 하한선이 없어요.';
  return '낙찰 방법은 공고문에서 확인하세요.';
}

function Single({ notice, budget, onEstimate }: { notice: Notice; budget: number | null; onEstimate?: (plan: number) => void }) {
  const ref = refPrice(notice, budget);
  const rate = notice.floorRate;
  return (
    <div className="flex gap-3">
      <Info className="mt-0.5 h-5 w-5 shrink-0 text-mute" />
      <div className="min-w-0 flex-1">
        <p><b className="font-semibold text-ink"><Term k="단일예가">단일예가</Term> 공고예요.</b> 예정가격을 추첨 없이 하나로 정해서 기초금액·<Term k="사정률" />이 없어요. 예정가격은 보통 개찰 전까지 공개되지 않아요.</p>
        {rate ? (
          <>
            <p className="mt-1">이 공고는 <Term k="낙찰하한율" /> {rate}%가 있어요. 예정가격을 아래 예산 금액으로 가정하면 하한선은 약 <b className="tabular-nums text-ink">{ref ? fmtWon(Math.ceil(ref * rate / 100)) : '—'}</b>이에요. (추정)</p>
            <RefPrices notice={notice} budget={budget} />
            {ref && onEstimate && (
              <button type="button" onClick={() => onEstimate(ref)}
                className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-btn bg-ink px-4 text-[14px] font-semibold text-white active:scale-[.98]">
                <Calculator className="h-4 w-4" />이 금액을 예정가격으로 보고 계산하기
              </button>
            )}
            <p className="mt-2 text-[12px] text-mute">실제 예정가격은 예산보다 낮을 수 있어요. 그러면 하한선도 내려가요. 공고문에 금액이 있으면 그 값을 넣으세요.</p>
          </>
        ) : (
          <>
            <p className="mt-1">{howWins(notice.award ?? '')} 그래서 ‘하한선에 붙여 쓰는’ 투찰금액 계산은 이 공고에 맞지 않아요.</p>
            <RefPrices notice={notice} budget={budget} />
            <p className="mt-2 text-[12px] text-mute">예산은 발주처가 이 계약에 잡아 둔 금액이에요. 예정가격을 가늠하는 참고로만 쓰세요.</p>
          </>
        )}
        <DocLink url={notice.url} />
      </div>
    </div>
  );
}
