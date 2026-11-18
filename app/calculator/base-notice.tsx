'use client';

import Link from 'next/link';
import { Bell, BellRing, FileSearch, Info } from 'lucide-react';
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
 */
export function BaseNotice({ notice, range, rate }: { notice: Notice; range: number; rate: number }) {
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
            {notice.url && <a href={notice.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 font-semibold text-brand"><FileSearch className="h-4 w-4" />공고문 보기</a>}
          </div>
        </div>
      )}
      {st === 'single' && (
        <p><b className="font-semibold text-ink"><Term k="단일예가">단일예가</Term> 공고예요.</b> 예정가격을 추첨 없이 하나로 정해서 기초금액이 공개되지 않는 경우가 많아요. 공고문에 금액이 있으면 직접 넣어 주세요. 사정률 분포는 보여 드리지 않아요.</p>
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
