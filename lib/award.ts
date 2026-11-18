/*
 * 낙찰 방식 배지 — "이 공고는 가격 싸움인가, 제안서 싸움인가"를 목록에서 바로 (2026-11-18)
 *  나라장터 낙찰방법명(sucsfbidMthdNm, 공고의 award 앞부분)을 무엇으로 겨루는지 기준으로 묶음
 *  지금 올라온 공고 1만 4,783건 실측: 협상 4,954 · 적격심사 3,556 · 소액수의견적 3,097 · 규격가격동시 1,646 ·
 *  제한적최저가 468 · 최저가 258 · 수의시담 242 · 다수공급자 153 · 2단계 103 · 설계공모 82 · 종합심사·평가 등 100여 건
 *  설명은 낙찰방법 이름에서 바로 읽히는 범위만 — 세부 평가 기준은 공고문 확인
 */

export type AwardKind = 'price' | 'priceNoFloor' | 'proposal' | 'spec' | 'direct' | 'catalog';

export interface AwardInfo {
  kind: AwardKind;
  /** 목록 배지 (짧게) */
  label: string;
  /** 무엇으로 겨루는지 한 줄 */
  desc: string;
}

const RULES: [RegExp, AwardInfo][] = [
  [/^적격심사/, { kind: 'price', label: '적격심사', desc: '하한선 위 가장 낮은 금액이 1순위, 수행능력 점수를 합쳐 통과하면 낙찰' }],
  [/^제한적최저가/, { kind: 'price', label: '하한율 최저가', desc: '하한선 위 가장 낮은 금액이 낙찰' }],
  [/^소액수의견적/, { kind: 'price', label: '소액 견적', desc: '견적 금액으로 겨루는 소액 계약 — 하한율이 있으면 그 위 가장 낮은 금액' }],
  [/^최저가낙찰제/, { kind: 'priceNoFloor', label: '최저가', desc: '예정가격 이하 가장 낮은 금액이 낙찰 (하한선 없음)' }],
  [/^복수견적|^희망수량/, { kind: 'priceNoFloor', label: '최저가', desc: '가격으로 겨루는 방식 — 세부는 공고문 확인' }],
  [/^협상에의한계약/, { kind: 'proposal', label: '협상·제안서', desc: '제안서의 기술·가격 평가로 순위를 정하고 협상' }],
  [/^(종합심사|종합평가|종합낙찰)/, { kind: 'proposal', label: '종합심사', desc: '가격과 수행능력·기술을 함께 평가' }],
  [/^(설계공모|일괄입찰|실시설계기술제안)/, { kind: 'proposal', label: '설계·기술제안', desc: '설계안·기술제안 평가로 정함' }],
  [/^(규격가격동시입찰|2단계경쟁입찰)/, { kind: 'spec', label: '규격+가격', desc: '규격(제안)을 먼저 통과한 업체끼리 가격으로 겨룸' }],
  [/^수의시담/, { kind: 'direct', label: '수의 협의', desc: '경쟁 입찰 없이 가격을 협의해 계약' }],
  [/^(다수공급자계약|카탈로그계약)/, { kind: 'catalog', label: '쇼핑몰·단가계약', desc: '한 번의 입찰이 아니라, 계약 업체 제품을 종합쇼핑몰에서 기관들이 골라 사는 계약' }],
];

export function awardInfo(award: string | null | undefined): AwardInfo | null {
  const a = (award ?? '').trim();
  if (!a) return null;
  return RULES.find(([re]) => re.test(a))?.[1] ?? null;
}

/** 필터용 묶음 */
export const AWARD_GROUPS: { label: string; kinds: AwardKind[] }[] = [
  { label: '가격으로 겨룸', kinds: ['price', 'priceNoFloor'] },
  { label: '제안서·기술 평가', kinds: ['proposal'] },
  { label: '규격 먼저, 가격으로', kinds: ['spec'] },
  { label: '수의·쇼핑몰', kinds: ['direct', 'catalog'] },
];

/** 배지 색 — 가격 싸움은 파랑 계열, 제안서 싸움은 주황 계열, 그 밖은 회색 */
export const awardTone = (k: AwardKind) =>
  k === 'price' || k === 'priceNoFloor' ? 'bg-brand-soft text-brand' : k === 'proposal' ? 'bg-[#FFF4E5] text-[#B45309]' : 'bg-fill text-sub';

const CATALOG: AwardInfo = { kind: 'catalog', label: '쇼핑몰·단가계약', desc: '조달청이 여러 기관이 쓸 물품을 한꺼번에 계약 — 한 번의 입찰로 낙찰자를 정하는 공고가 아니에요' };

/** 공고 배지 — 낙찰방법 + '각 수요기관' 단가계약까지 */
export function noticeAward(n: { award: string | null; demandOrg?: string | null }): AwardInfo | null {
  const a = awardInfo(n.award);
  if (a) return a;
  return /^각\s*수요기관/.test(n.demandOrg ?? '') ? CATALOG : null;
}
