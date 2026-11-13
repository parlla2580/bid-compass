import { SIZE_RANK, canonicalRegion, hasSigungu, splitLocation, type CompanySize, type LicenseLimit, type Notice, type Profile } from './data';

/* =========================================================
 * 참여 가능 판정 (기획서 v2.1 5.1)
 * 원칙: 명확히 충돌할 때만 '불가', 정보가 없으면 '확인 필요'
 * 판정에 쓰는 조건: 지역제한, 업종(면허)제한 — 공고 데이터로 읽을 수 있는 것만
 * 공고 API에 없는 조건(중소기업 제한, 직접생산확인)은 판정과 분리해 '원문 확인 항목'으로 안내
 * ========================================================= */

export type Status = 'eligible' | 'check' | 'ineligible';
export type RuleResult = 'pass' | 'check' | 'fail';
export type RuleId = 'region' | 'industry' | 'size';

/** '확인 필요'를 풀기 위해 사용자가 입력할 프로필 항목 */
export type ProfileNeed = 'location' | 'sigungu' | 'industries' | 'size';

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

/** 모든 공고에 공통으로 원문에서 확인할 항목 */
export const MANUAL_CHECKS = ['중소기업자 한정 여부', '직접생산확인 필요 여부', '실적·기술 등 세부 참가자격'];

/* ---------- 1. 지역제한 ---------- */
// 공고 지역 R, 회사 소재지 L: L이 R과 같거나 R 아래 지역이면 충족
const within = (loc: string, region: string) => {
  const l = canonicalRegion(loc), r = canonicalRegion(region);
  return l === r || l.startsWith(r + ' ');
};

function regionRule(n: Notice, p: Profile): Reason {
  const rule = 'region';
  if (!n.regionLimit) return { rule, result: 'pass', text: '지역제한 없음' };
  const area = n.regionLimit.join(', ');
  const basis = n.regionBasis ? ` (판단기준: ${n.regionBasis})` : '';
  if (!p.location) return { rule, result: 'check', text: `지역제한: ${area} — 소재지를 입력하면 판정됩니다`, need: 'location' };

  const hit = n.regionLimit.find((r) => within(p.location!, r));
  if (hit) return { rule, result: 'pass', text: `지역 조건 충족 (${hit})${basis}` };

  // 회사 소재지가 시도까지만 있고, 공고 제한이 그 시도 안의 시군구인 경우
  if (!hasSigungu(p.location) && n.regionLimit.some((r) => canonicalRegion(r).startsWith(canonicalRegion(p.location!) + ' '))) {
    return { rule, result: 'check', text: `지역제한: ${area} — 시군구를 입력하면 판정됩니다`, need: 'sigungu' };
  }
  return { rule, result: 'fail', text: `지역제한: ${area} 소재 업체만 / 귀사 소재지 ${p.location}${basis}` };
}

/* ---------- 2. 업종(면허)제한 ---------- */
const codeOf = (s: string) => /\/(\w+)$/.exec(s)?.[1] ?? null;
const nameOf = (s: string) => s.replace(/\/\w+$/, '');

function limitMet(l: LicenseLimit, codes: Set<string>) {
  if (l.code && codes.has(l.code)) return true;
  return l.allowed.some((a) => {
    const c = codeOf(a);
    return !!c && codes.has(c);
  });
}

function industryRule(n: Notice, p: Profile): Reason {
  const rule = 'industry';
  if (!n.licenseLimits) {
    // 공고 원본은 '업종 제한 있음'인데 제한 내용을 아직 못 받은 경우 — '제한 없음'으로 오판하지 않음
    if (n.industryLimited) return { rule, result: 'check', text: '업종(면허) 제한이 있는 공고예요. 제한 내용을 받는 중이라 원문에서 확인해 주세요' };
    return { rule, result: 'pass', text: '업종(면허) 제한 없음' };
  }
  const label = (l: LicenseLimit) => `${l.name}${l.code ? `(${l.code})` : ''}`;
  const required = n.licenseLimits.map(label).join(', ');
  if (p.industries === null || p.industries.length === 0) {
    return { rule, result: 'check', text: `업종 제한: ${required} — 업종을 입력하면 판정됩니다`, need: 'industries' };
  }
  const codes = new Set(p.industries.map((i) => i.code));
  // 제한그룹별로 묶어서 한 그룹이라도 전부 충족하면 통과
  const groups = new Map<string, LicenseLimit[]>();
  n.licenseLimits.forEach((l) => groups.set(l.group ?? '1', [...(groups.get(l.group ?? '1') ?? []), l]));
  for (const ls of groups.values()) {
    if (ls.every((l) => limitMet(l, codes))) {
      return { rule, result: 'pass', text: `업종 조건 충족 (${ls.map((l) => l.name).join(', ')})` };
    }
  }
  const allowedNames = n.licenseLimits.flatMap((l) => l.allowed.map(nameOf)).slice(0, 3);
  const extra = allowedNames.length ? ` 또는 허용업종(${allowedNames.join(', ')}${n.licenseLimits.some((l) => l.allowed.length > 3) ? ' 등' : ''})` : '';
  return { rule, result: 'fail', text: `업종 불일치: ${required}${extra} 등록 필요` };
}

/* ---------- 3. 기업규모 (추정) ----------
 * 공고 API에 '중소기업 한정' 항목이 없어 법령의 금액 기준으로 추정한다.
 * 판로지원법 시행령 제2조의2(중소기업자와의 우선조달계약): 물품·용역 추정가격
 *   1억 원 미만 → 소기업·소상공인 간 제한경쟁 / 고시금액(국가 2.3억 원) 미만 → 중소기업자 간 제한경쟁
 *   (예외: 참가 가능 업체가 적은 경우 등. 지방계약 기준금액 상향 개정은 2026-11 입법예고 중 → 보수적으로 2.3억 사용)
 * 그래서 계약방법이 '제한경쟁'인 물품·용역 공고에만 적용하고, 맞지 않아도 '불가'가 아닌 '확인 필요'로 둔다.
 */
export const SME_LIMIT = { small: 1e8, sme: 2.3e8 };

/** 이 공고에 추정되는 기업규모 제한 — 없으면 null */
export function sizeLimitOf(n: Notice): { need: CompanySize; label: string } | null {
  if ((n.type !== '물품' && n.type !== '용역') || !n.contract.startsWith('제한경쟁') || !(n.estPrice > 0)) return null;
  if (n.estPrice < SME_LIMIT.small) return { need: '소기업·소상공인', label: '소기업·소상공인' };
  if (n.estPrice < SME_LIMIT.sme) return { need: '중소기업', label: '중소기업' };
  return null;
}

function sizeRule(n: Notice, p: Profile): Reason | null {
  const lim = sizeLimitOf(n);
  if (!lim) return null;
  const rule = 'size';
  const what = `추정가격 ${n.estPrice < 1e8 ? '1억 원' : '2.3억 원'} 미만 제한경쟁 — ${lim.label}만 참여하는 공고일 가능성이 높아요(추정)`;
  if (!p.size) return { rule, result: 'pass', text: `${what}. 기업규모를 넣으면 맞춰 드려요`, need: 'size' };
  if (SIZE_RANK[p.size] <= SIZE_RANK[lim.need]) return { rule, result: 'pass', text: `${lim.label} 제한 추정 공고 — 우리 회사(${p.size}) 해당` };
  // 이미 입력한 규모와 안 맞는 경우 — 입력 요청(need)이 아니라 공고문 확인 안내 (홈 '입력하면 판정' 배너에 세지 않음)
  return { rule, result: 'check', text: `${what}. 우리 회사는 ${p.size}라 참여가 어려울 수 있어요. 공고문 참가자격을 확인하세요` };
}

const RULES: ((n: Notice, p: Profile) => Reason | null)[] = [regionRule, industryRule, sizeRule];

export function judge(n: Notice, p: Profile): Judgment {
  const reasons = RULES.map((r) => r(n, p)).filter((r): r is Reason => !!r);
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
  const met = j.reasons.filter((r) => !/없음/.test(r.text));
  return met.length ? met.map((r) => r.text).join(' · ') : '지역·업종 제한 없음';
}

/* =========================================================
 * 관련도 정렬 (F3-3)
 * 업종 일치도 → 선호 추정가격 범위 → 선호 발주기관 → 마감 임박 순으로 가중. 운영하며 조정.
 * ========================================================= */
export function relevance(n: Notice, p: Profile, j: Judgment): number {
  let score = 0;
  const ind = j.reasons.find((r) => r.rule === 'industry');
  if (ind?.result === 'pass' && n.licenseLimits) score += 40; // 내 업종을 요구하는 공고
  else if (!n.licenseLimits) score += 10;

  if (p.priceRange) {
    const [lo, hi] = p.priceRange;
    if (n.estPrice >= lo && n.estPrice <= hi) score += 25;
  } else score += 10;

  if (p.preferredOrgs.some((o) => n.org.includes(o) || n.demandOrg?.includes(o))) score += 15;
  if (p.types.includes(n.type)) score += 5;
  score += n.d <= 3 ? 10 : n.d <= 7 ? 6 : n.d <= 14 ? 3 : 0;
  return score;
}

/* =========================================================
 * 공고 해설 카드 (5.2)
 * 낙찰방법 실제 값 → 해설 문구 매핑. 매핑에 없으면 원래 값을 그대로 보여줌
 * ========================================================= */
const AWARD_MAP: [RegExp, string, string][] = [
  [/적격심사/, '적격심사', '가격과 수행능력을 점수로 심사해 기준점 이상인 업체 중 낮은 가격 순으로 결정'],
  [/소액수의견적/, '소액 수의계약(견적)', '견적서를 받아 낮은 가격 순으로 계약 상대자를 정함'],
  [/제한적최저가/, '제한적 최저가', '낙찰하한율 이상 가격 중 가장 낮은 가격을 쓴 업체'],
  [/협상/, '협상에 의한 계약', '제안서를 평가한 뒤 협상으로 계약자 결정'],
  [/종합심사/, '종합심사', '가격·공사수행능력·사회적 책임 등을 합산해 결정'],
  [/최저가/, '최저가', '예정가격 이하로 가장 낮은 가격을 쓴 업체'],
];

export function awardInfo(award: string): { label: string; desc: string | null } {
  const m = AWARD_MAP.find(([re]) => re.test(award));
  return m ? { label: m[1], desc: m[2] } : { label: award, desc: null };
}

/** 적용 법률 추정 — 발주기관 이름으로만 추정 가능한 경우에만 표시 */
export function lawGuess(n: Notice): string | null {
  const org = `${n.org} ${n.demandOrg ?? ''}`;
  if (/(특별시|광역시|특별자치시|특별자치도|도|시|군|구)\s|교육청|교육지원청|(시|군|구)청/.test(org) && !/공사|공단|진흥원|조달청/.test(n.org)) {
    return '지방계약법 적용(지자체·교육청 발주로 추정)';
  }
  if (/조달청|부$|처$|청$|위원회$|군$/.test(n.org.split(' ')[0])) return '국가계약법 적용(국가기관 발주로 추정)';
  return null;
}

export function eligibilitySummary(n: Notice): string {
  const parts: string[] = [];
  if (n.regionLimit) parts.push(`${n.regionLimit.join('·')} 소재 업체`);
  if (n.licenseLimits) parts.push(`${n.licenseLimits.map((l) => l.name).join('·')} 등록 업체`);
  return parts.length ? parts.join(', ') : '지역·업종 제한 없음';
}

export function explain(n: Notice) {
  const a = awardInfo(n.award);
  return {
    who: `${n.contract} — ${eligibilitySummary(n)}`,
    how: a.desc ? `${a.label} — ${a.desc}` : a.label,
    law: lawGuess(n),
  };
}

export { splitLocation };
