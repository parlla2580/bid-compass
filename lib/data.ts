/* =========================================================
 * 입찰나침반 — 목데이터 (기획서 v2 7장 데이터 모델 기준)
 * 나라장터 API 연동 단계에서 실제 데이터로 교체합니다.
 * ========================================================= */

export type BidType = '물품' | '용역' | '공사';
export type OrgType = '국가기관' | '지방자치단체' | '공기업·준정부기관';
export type Contract = '일반경쟁' | '제한경쟁' | '지명경쟁' | '수의계약';
export type Award = '적격심사' | '최저가' | '협상에 의한 계약';
export type CompanySize = '중소기업' | '중견기업' | '대기업';

export interface Notice {
  id: number;
  /** 공고번호-차수 */
  no: string;
  type: BidType;
  title: string;
  org: string;
  orgType: OrgType;
  contract: Contract;
  award: Award;
  /** 추정가격(원, 부가가치세 제외) */
  estPrice: number;
  /** 기초금액(원) */
  basePrice: number;
  /** 마감까지 남은 일수 (음수 = 마감됨) */
  d: number;
  /** 마감 시각 */
  closeTime: string;
  /** 납품·용역·공사 기간 */
  period: string;
  /** 참가 가능 지역 — null: 제한 없음, undefined: 공고에서 읽지 못함 */
  regionLimit?: string[] | null;
  /** 요구 업종 — null: 제한 없음 */
  industry: { mid: string; leaf?: string } | null;
  /** 중소기업자 한정 — undefined: 공고에서 읽지 못함 */
  smeOnly?: boolean;
  /** 직접생산확인 필요 품목 (중소기업자간 경쟁제품) */
  directProduct: string | null;
  /** 요구 면허 (공사) */
  license: string | null;
  /** 게시 후 경과일 (0 = 오늘 신규) */
  posted: number;
}

export interface Profile {
  /** 간편 시작(F1-1)에서 받는 2개 항목 */
  industry: { big: string; mid: string; leaf: string | null } | null;
  location: string | null;
  /** 점진 입력(F1-2) — null은 미입력, []는 '없음'으로 입력함 */
  size: CompanySize | null;
  licenses: string[] | null;
  directProducts: string[] | null;
  records: string;
  /** 매칭 선호도(F1-3) */
  types: BidType[];
  preferredOrgs: string[];
  priceRange: [number, number] | null;
}

export const EMPTY_PROFILE: Profile = {
  industry: null,
  location: null,
  size: null,
  licenses: null,
  directProducts: null,
  records: '',
  types: ['물품', '용역', '공사'],
  preferredOrgs: [],
  priceRange: null,
};

/** 이메일 로그인 시 불러오는 데모 프로필 */
export const DEMO_PROFILE: Profile = {
  ...EMPTY_PROFILE,
  industry: { big: '제조업', mid: '전자부품', leaf: null },
  location: '서울',
};

// 목데이터 기준일 (D-day 계산 기준)
export const TODAY = new Date(2026, 10, 9);

export const NOTICES: Notice[] = [
  { id: 1, no: '20261109001-00', type: '물품', title: '사무용 컴퓨터 구매', org: '조달청', orgType: '국가기관',
    contract: '일반경쟁', award: '적격심사', estPrice: 120_000_000, basePrice: 132_000_000, d: 5, closeTime: '18:00',
    period: '계약 후 30일', regionLimit: null, industry: null, smeOnly: false, directProduct: null, license: null, posted: 1 },
  { id: 2, no: '20261109015-00', type: '물품', title: 'CCTV 카메라 모듈 납품', org: '서울특별시', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 98_000_000, basePrice: 107_800_000, d: 3, closeTime: '10:00',
    period: '계약 후 45일', regionLimit: ['서울'], industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 0 },
  { id: 3, no: '20261106033-00', type: '물품', title: 'LED 조명기구 납품', org: '국방부', orgType: '국가기관',
    contract: '제한경쟁', award: '적격심사', estPrice: 340_000_000, basePrice: 374_000_000, d: 7, closeTime: '18:00',
    period: '계약 후 60일', regionLimit: null, industry: { mid: '전자부품', leaf: '표시장치(LED·LCD)' }, smeOnly: true,
    directProduct: 'LED조명기구', license: null, posted: 3 },
  { id: 4, no: '20261105021-00', type: '용역', title: '정보시스템 유지보수', org: '서울특별시교육청', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 85_000_000, basePrice: 93_500_000, d: 3, closeTime: '10:00',
    period: '계약 후 12개월', regionLimit: ['서울'], industry: { mid: 'IT서비스' }, smeOnly: false, directProduct: null, license: null, posted: 4 },
  { id: 5, no: '20261106008-00', type: '물품', title: '사무가구 구매', org: '경기도청', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 56_000_000, basePrice: 61_600_000, d: 2, closeTime: '18:00',
    period: '계약 후 20일', regionLimit: ['경기'], industry: { mid: '가구' }, smeOnly: true, directProduct: '사무용가구', license: null, posted: 3 },
  { id: 6, no: '20261104017-00', type: '물품', title: '전자칠판 구매', org: '부산광역시교육청', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 230_000_000, basePrice: 253_000_000, d: 9, closeTime: '18:00',
    period: '계약 후 40일', regionLimit: ['부산'], industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 5 },
  { id: 7, no: '20261103042-00', type: '물품', title: '인쇄회로기판(PCB) 시험장비', org: '한국전력공사', orgType: '공기업·준정부기관',
    contract: '일반경쟁', award: '적격심사', estPrice: 180_000_000, basePrice: 198_000_000, d: 10, closeTime: '18:00',
    period: '계약 후 90일', regionLimit: null, industry: { mid: '전자부품', leaf: '인쇄회로기판' }, directProduct: null, license: null, posted: 6 },
  { id: 8, no: '20261106052-00', type: '물품', title: '네트워크 장비 교체', org: '관세청', orgType: '국가기관',
    contract: '제한경쟁', award: '적격심사', estPrice: 270_000_000, basePrice: 297_000_000, d: 6, closeTime: '18:00',
    period: '계약 후 45일', regionLimit: null, industry: null, smeOnly: true, directProduct: null, license: null, posted: 3 },
  { id: 9, no: '20261102011-00', type: '용역', title: '홈페이지 재구축', org: '한국수자원공사', orgType: '공기업·준정부기관',
    contract: '일반경쟁', award: '협상에 의한 계약', estPrice: 210_000_000, basePrice: 231_000_000, d: 12, closeTime: '14:00',
    period: '계약 후 6개월', regionLimit: null, industry: { mid: 'IT서비스' }, smeOnly: false, directProduct: null, license: null, posted: 7 },
  { id: 10, no: '20261102027-00', type: '공사', title: '청사 LED 조명 교체공사', org: '강남구청', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 730_000_000, basePrice: 803_000_000, d: 20, closeTime: '10:00',
    period: '착공 후 120일', regionLimit: ['서울'], industry: null, smeOnly: false, directProduct: null, license: '전기공사업', posted: 7 },
  { id: 11, no: '20261105036-00', type: '물품', title: '의료기기 소모품', org: '보건복지부', orgType: '국가기관',
    contract: '제한경쟁', award: '적격심사', estPrice: 92_000_000, basePrice: 101_200_000, d: 4, closeTime: '18:00',
    period: '계약 후 14일', industry: null, smeOnly: false, directProduct: null, license: null, posted: 4 },
  { id: 12, no: '20261107019-00', type: '물품', title: '디스플레이 패널 부품', org: '한국철도공사', orgType: '공기업·준정부기관',
    contract: '일반경쟁', award: '적격심사', estPrice: 450_000_000, basePrice: 495_000_000, d: 8, closeTime: '18:00',
    period: '계약 후 50일', regionLimit: null, industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 2 },
  { id: 13, no: '20261108004-00', type: '용역', title: '전자부품 품질검사 용역', org: '조달청', orgType: '국가기관',
    contract: '일반경쟁', award: '적격심사', estPrice: 60_000_000, basePrice: 66_000_000, d: 11, closeTime: '18:00',
    period: '계약 후 3개월', regionLimit: null, industry: null, smeOnly: false, directProduct: null, license: null, posted: 1 },
  { id: 14, no: '20261108013-00', type: '물품', title: '반도체 검사용 소모품', org: '과학기술정보통신부', orgType: '국가기관',
    contract: '일반경쟁', award: '최저가', estPrice: 35_000_000, basePrice: 38_500_000, d: 1, closeTime: '10:00',
    period: '계약 후 10일', regionLimit: null, industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 1 },
  { id: 15, no: '20261109024-00', type: '물품', title: '태양광 LED 가로등', org: '인천광역시', orgType: '지방자치단체',
    contract: '제한경쟁', award: '적격심사', estPrice: 150_000_000, basePrice: 165_000_000, d: 14, closeTime: '18:00',
    period: '계약 후 60일', regionLimit: ['인천', '서울', '경기'], industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 0 },
  { id: 16, no: '20261028009-00', type: '물품', title: '무정전전원장치(UPS) 구매', org: '국토교통부', orgType: '국가기관',
    contract: '일반경쟁', award: '적격심사', estPrice: 110_000_000, basePrice: 121_000_000, d: -2, closeTime: '18:00',
    period: '계약 후 30일', regionLimit: null, industry: { mid: '전자부품' }, smeOnly: false, directProduct: null, license: null, posted: 12 },
];

export const getNotice = (id: number | string) => NOTICES.find((n) => n.id === Number(id));

/** 마감 전 공고만 (판정·추천 대상) */
export const OPEN_NOTICES = NOTICES.filter((n) => n.d >= 0);

export const REGIONS = ['서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '대구', '경북', '부산', '울산', '경남', '광주', '전북', '전남', '제주'];

export const SIZES: CompanySize[] = ['중소기업', '중견기업', '대기업'];

// 업종 분류 (대분류 > 중분류 > 세분류) — 목데이터용 분류
export const INDUSTRY: Record<string, Record<string, string[]>> = {
  '제조업': {
    '전자부품': ['반도체', '인쇄회로기판', '표시장치(LED·LCD)', '기타 전자부품'],
    '컴퓨터·주변기기': ['컴퓨터', '주변기기'],
    '가구': ['사무용 가구', '기타 가구'],
  },
  '정보통신업': {
    '소프트웨어': ['시스템 소프트웨어', '응용 소프트웨어'],
    'IT서비스': ['시스템 통합(SI)', '유지보수', '클라우드'],
  },
  '건설업': {
    '종합건설': ['건축', '토목'],
    '전문건설': ['실내건축', '전기', '정보통신'],
  },
};

/** 검색형 업종 선택용 (대분류 > 중분류) */
export const INDUSTRY_OPTIONS = Object.entries(INDUSTRY).flatMap(([big, mids]) =>
  Object.keys(mids).map((mid) => ({ big, mid, label: `${big} > ${mid}` })),
);

// 추정가격 범위 슬라이더 단계 (1천만원 ~ 50억원)
export const PRICE_STEPS = [10e6, 30e6, 50e6, 1e8, 2e8, 3e8, 5e8, 7e8, 10e8, 20e8, 30e8, 50e8];
