import type { Award, Notice, OrgType, Profile } from './data';

/* =========================================================
 * 참여 가능 판정 (기획서 v2 5.1)
 * 원칙: 명확히 충돌할 때만 '불가', 정보가 없으면 '확인 필요'
 * ========================================================= */

export type Status = 'eligible' | 'check' | 'ineligible';
export type RuleResult = 'pass' | 'check' | 'fail';
export type RuleId = 'region' | 'industry' | 'sme_only' | 'direct_product' | 'license';

/** '확인 필요'를 풀기 위해 사용자가 입력할 프로필 항목 */
export type ProfileNeed = 'location' | 'industry' | 'industryLeaf' | 'size' | 'directProducts' | 'licenses';

export interface Reason {
  rule: RuleId;
  result: RuleResult;
  text: string;
  need?: ProfileNeed;
}

export interface Judgment {
  status: Status;
  reasons: Reason[];
}

export const STATUS_LABEL: Record<Status, string> = {
  eligible: '참여 가능',
  check: '확인 필요',
  ineligible: '참여 불가',
};

const UNREADABLE = '공고문에서 조건을 읽지 못했습니다. 원문에서 확인하세요';

function regionRule(n: Notice, p: Profile): Reason {
  const rule = 'region';
  if (n.regionLimit === undefined) return { rule, result: 'check', text: `지역 조건: ${UNREADABLE}` };
  if (n.regionLimit === null) return { rule, result: 'pass', text: '지역제한 없음' };
  const area = n.regionLimit.join('·');
  if (!p.location) return { rule, result: 'check', text: `지역제한: ${area} 소재 업체만 — 소재지를 입력하면 판정됩니다`, need: 'location' };
  if (n.regionLimit.includes(p.location)) return { rule, result: 'pass', text: `지역 조건 충족 (${p.location})` };
  return { rule, result: 'fail', text: `지역제한: ${area} 소재 업체만 / 귀사 소재지 ${p.location}` };
}

function industryRule(n: Notice, p: Profile): Reason {
  const rule = 'industry';
  if (!n.industry) return { rule, result: 'pass', text: '업종 제한 없음' };
  const req = n.industry.leaf ? `${n.industry.mid} > ${n.industry.leaf}` : n.industry.mid;
  if (!p.industry) return { rule, result: 'check', text: `업종: ${req} — 업종을 입력하면 판정됩니다`, need: 'industry' };
  if (p.industry.mid !== n.industry.mid) return { rule, result: 'fail', text: `업종 불일치: ${req} 등록 필요` };
  if (!n.industry.leaf) return { rule, result: 'pass', text: `업종 일치 (${p.industry.mid})` };
  if (!p.industry.leaf) return { rule, result: 'check', text: `업종: ${req} — 세분류를 입력하면 판정이 정확해집니다`, need: 'industryLeaf' };
  if (p.industry.leaf === n.industry.leaf) return { rule, result: 'pass', text: `업종 일치 (${req})` };
  return { rule, result: 'fail', text: `업종 불일치: ${req} 등록 필요` };
}

function smeRule(n: Notice, p: Profile): Reason {
  const rule = 'sme_only';
  if (n.smeOnly === undefined) return { rule, result: 'check', text: `기업규모 조건: ${UNREADABLE}` };
  if (!n.smeOnly) return { rule, result: 'pass', text: '기업규모 제한 없음' };
  if (!p.size) return { rule, result: 'check', text: '중소기업자만 참여 가능 — 기업규모를 입력하면 판정이 정확해집니다', need: 'size' };
  if (p.size === '중소기업') return { rule, result: 'pass', text: '중소기업자 한정 — 충족' };
  return { rule, result: 'fail', text: '중소기업자만 참여 가능' };
}

function directProductRule(n: Notice, p: Profile): Reason {
  const rule = 'direct_product';
  if (!n.directProduct) return { rule, result: 'pass', text: '직접생산확인 대상 아님' };
  if (p.directProducts === null) {
    return { rule, result: 'check', text: `직접생산확인 필요: ${n.directProduct} — 보유 품목을 입력하면 판정됩니다`, need: 'directProducts' };
  }
  if (p.directProducts.includes(n.directProduct)) return { rule, result: 'pass', text: `직접생산확인 보유 (${n.directProduct})` };
  return { rule, result: 'fail', text: `직접생산확인 필요: ${n.directProduct}` };
}

function licenseRule(n: Notice, p: Profile): Reason {
  const rule = 'license';
  if (!n.license) return { rule, result: 'pass', text: '면허 요건 없음' };
  if (p.licenses === null) return { rule, result: 'check', text: `면허 필요: ${n.license} — 보유 면허를 입력하면 판정됩니다`, need: 'licenses' };
  if (p.licenses.includes(n.license)) return { rule, result: 'pass', text: `면허 보유 (${n.license})` };
  return { rule, result: 'fail', text: `면허 필요: ${n.license}` };
}

/** 판정 규칙 — 기획서 표의 순서대로 적용 */
const RULES = [regionRule, industryRule, smeRule, directProductRule, licenseRule];

export function judge(n: Notice, p: Profile): Judgment {
  const reasons = RULES.map((r) => r(n, p));
  const status: Status = reasons.some((r) => r.result === 'fail')
    ? 'ineligible'
    : reasons.some((r) => r.result === 'check')
      ? 'check'
      : 'eligible';
  return { status, reasons };
}

/** 카드에 쓰는 사유 1줄 요약 */
export function summarize(j: Judgment): string {
  const key = j.status === 'ineligible' ? 'fail' : j.status === 'check' ? 'check' : null;
  if (key) return j.reasons.find((r) => r.result === key)!.text;
  const met = j.reasons.filter((r) => !/없음|아님/.test(r.text));
  return met.length ? met.map((r) => r.text).join(' · ') : '참가 제한 조건 없음';
}

/* =========================================================
 * 관련도 정렬 (F3-3)
 * 업종 일치도 → 선호 추정가격 범위 → 선호 발주기관 → 마감 임박 순으로 가중.
 * 가중치는 운영하면서 조정한다.
 * ========================================================= */
export function relevance(n: Notice, p: Profile): number {
  let score = 0;
  if (!n.industry) score += 15;
  else if (p.industry?.mid === n.industry.mid) score += n.industry.leaf && p.industry.leaf !== n.industry.leaf ? 30 : 40;

  if (p.priceRange) {
    const [lo, hi] = p.priceRange;
    if (n.estPrice >= lo && n.estPrice <= hi) score += 25;
  } else score += 10;

  if (p.preferredOrgs.includes(n.org)) score += 15;
  // 관심 사업유형(F1-3)은 선호 기관보다 낮은 가중치로 반영
  if (p.types.includes(n.type)) score += 5;

  score += n.d <= 3 ? 10 : n.d <= 7 ? 6 : n.d <= 14 ? 3 : 0;
  return score;
}

/* =========================================================
 * 공고 해설 카드 (기획서 v2 5.2)
 * ========================================================= */
const LAW_BY_ORG: Record<OrgType, string> = {
  '국가기관': '국가계약법',
  '지방자치단체': '지방계약법',
  '공기업·준정부기관': '공기업·준정부기관 계약사무규칙',
};

const ORG_SHORT: Record<OrgType, string> = {
  '국가기관': '국가기관',
  '지방자치단체': '지자체',
  '공기업·준정부기관': '공기업·준정부기관',
};

const AWARD_DESC: Record<Award, string> = {
  '적격심사': '점수가 기준점 이상인 업체 중 최저가',
  '최저가': '예정가격 이하로 가장 낮은 가격을 쓴 업체',
  '협상에 의한 계약': '제안서를 평가한 뒤 협상으로 계약자 결정',
};

/** 참가자격 요약 — 해설 카드 1줄과 공고 정보 표에 사용 */
export function eligibilitySummary(n: Notice): string {
  if (n.regionLimit === undefined || n.smeOnly === undefined) return '참가자격은 공고문 원문 확인 필요';
  const who = n.smeOnly ? '중소기업' : '업체';
  const parts: string[] = [];
  if (n.regionLimit) parts.push(`${n.regionLimit.join('·')} 소재 ${who}만`);
  else if (n.smeOnly) parts.push('중소기업만');
  if (n.directProduct) parts.push(`직접생산확인(${n.directProduct}) 필요`);
  if (n.license) parts.push(`${n.license} 면허 필요`);
  if (n.industry) parts.push(`${n.industry.leaf ?? n.industry.mid} 업종`);
  return parts.length ? parts.join(', ') : '자격을 갖춘 업체 누구나';
}

export function explain(n: Notice) {
  return {
    who: `${n.contract} — ${eligibilitySummary(n)}`,
    how: `${n.award} — ${AWARD_DESC[n.award]}`,
    law: `${LAW_BY_ORG[n.orgType]} 적용(${ORG_SHORT[n.orgType]} 발주)`,
  };
}

export const lawOf = (n: Notice) => LAW_BY_ORG[n.orgType];
