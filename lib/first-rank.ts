import { bidOutcome, fetchMyBidList, fetchOpeningDetail, type MyBidItem } from './analysis';
import { getSupabase } from './supabase';

/*
 * A1 · 1순위 심사 중 (기획 16장)
 * 우리 회사가 1순위로 개찰됐지만 최종낙찰자가 아직 정해지지 않은 건 → 서류 제출 단계 안내
 *  - 적격심사 공고: 통보 후 7일 안에 심사서류 제출(지자체 예규·조달청 기술용역 기준, 기관마다 5~7일) → 개찰일 기준 D-day(추정)
 *  - 소액수의견적: 발주기관의 계약 서류 요청 확인
 *  - 협상에 의한 계약: 가격 순위가 낙찰을 정하지 않아 제외
 * 기한은 정확한 통보일을 모르므로 항상 '추정'으로 표시
 */

export type FirstRankKind = 'qual' | 'quote' | 'other';

export interface FirstRank {
  item: MyBidItem;
  kind: FirstRankKind;
  /** 적격심사 서류 기한(추정) — 개찰일 + 7일 */
  due: Date | null;
  noticeId: number | null;
  url: string | null;
  award: string | null;
}

const WINDOW_DAYS = 21; // 이보다 오래된 결정 전 건은 '결과 없음'에 가까워 제외
export const QUAL_DAYS = 7;

export function kindOf(award: string | null): FirstRankKind | 'nego' {
  if (!award) return 'other';
  if (/협상/.test(award)) return 'nego';
  if (/적격/.test(award)) return 'qual';
  if (/소액수의|견적/.test(award)) return 'quote';
  return 'other';
}

export async function fetchFirstRanks(): Promise<FirstRank[]> {
  const list = await fetchMyBidList();
  if (!list) return [];
  const now = Date.now();
  const pending = list
    .filter((i) => i.rank === 1 && bidOutcome(i) === 'pending' && now - new Date(i.opened_at).getTime() <= WINDOW_DAYS * 86400e3)
    .slice(0, 3);
  const out: FirstRank[] = [];
  for (const item of pending) {
    // 개찰 1건 → 공고번호 → 공고의 낙찰방법·원문 주소
    const d = await fetchOpeningDetail(item.id).catch(() => null);
    const o = d?.opening;
    let award: string | null = null, noticeId: number | null = null, url: string | null = null;
    if (o?.bid_no) {
      const { data } = await getSupabase().from('notices').select('id,award,url')
        .eq('bid_no', o.bid_no).order('bid_ord', { ascending: false }).limit(1).maybeSingle();
      award = data?.award ?? null; noticeId = data?.id ?? null; url = data?.url ?? null;
    }
    const k = kindOf(award);
    if (k === 'nego') continue;
    out.push({
      item, kind: k, award, noticeId, url,
      due: k === 'qual' ? new Date(new Date(item.opened_at).getTime() + QUAL_DAYS * 86400e3) : null,
    });
  }
  return out;
}

/** 적격심사 서류 공통 체크리스트 (조달청 적격심사 서식의 제출서류 목록 기준, 공고 세부기준마다 다름) */
export const QUAL_CHECKLIST = [
  { key: 'notice', label: '나라장터에서 적격심사 대상 통보 확인', hint: '기한은 통보일부터 세요' },
  { key: 'form', label: '적격심사신청서·자기평가표', hint: '공고 첨부 서식 사용' },
  { key: 'record', label: '납품·수행 실적 증명서', hint: '발주기관·조달청 발급' },
  { key: 'credit', label: '신용평가등급확인서', hint: '등급일자가 공고일 이전이어야 해요' },
  { key: 'tech', label: '기술능력·신인도(가점) 증빙', hint: '해당하는 것만' },
  { key: 'fix', label: '보완 요청 오면 기한 안에 다시 제출', hint: '보완은 1번뿐, 보통 3~7일' },
] as const;

export const QUOTE_CHECKLIST = [
  { key: 'notice', label: '나라장터·발주기관 안내 확인', hint: '견적 1순위 통보' },
  { key: 'docs', label: '발주기관이 요청한 계약 서류 준비', hint: '기관마다 다름' },
] as const;
