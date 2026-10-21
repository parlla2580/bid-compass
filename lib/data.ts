/* =========================================================
 * 입찰나침반 — 더미 데이터
 * 2단계(나라장터 API 연동)에서 실제 데이터로 교체할 부분입니다.
 * ========================================================= */

export type BidType = '물품' | '용역' | '공사';
export type Law = '국가계약법' | '지방계약법';
export type Reason = '업종 일치' | '지역 일치' | '가격대 일치' | '실적 충족';

export interface Bid {
  id: number;
  type: BidType;
  title: string;
  org: string;
  /** 추정가격(원) */
  price: number;
  /** 마감까지 남은 일수 */
  d: number;
  /** 매칭율(%) */
  match: number;
  region: string;
  /** 참가 지역제한 (null = 제한 없음) */
  regionLimit: string | null;
  law: Law;
  /** 공기업 등 별도 계약규정 */
  lawNote?: string;
  award: string;
  no: string;
  period: string;
  license: string | null;
  /** 게시 후 경과일 */
  posted: number;
  reasons: Reason[];
}

export interface Company {
  name: string;
  ceo: string;
  bizNo: string;
  industry: string;
  address: string;
  email: string;
}

export interface Profile {
  types: BidType[];
  industry: [string, string, string];
  regions: string[];
  priceMin: number;
  priceMax: number;
  licenses: string[];
  records: string;
}

// 프로토타입 기준일 (D-day 계산 기준)
export const TODAY = new Date(2026, 9, 21);

export const COMPANY: Company = {
  name: '(주)테스트전자',
  ceo: '김희규',
  bizNo: '123-45-67890',
  industry: '제조업 / 전자부품',
  address: '서울특별시 강남구',
  email: 'contact@testelec.co.kr',
};

export const DEFAULT_PROFILE: Profile = {
  types: ['물품', '용역'],
  industry: ['제조업', '전자부품', '기타 전자부품'],
  regions: ['서울', '경기'],
  priceMin: 50_000_000,
  priceMax: 500_000_000,
  licenses: ['직접생산확인증명', 'ISO 9001'],
  records: '',
};

export const DEFAULT_SAVED = [3, 6, 7];

export const BIDS: Bid[] = [
  { id: 1, type: '물품', title: '사무용 컴퓨터 구매', org: '조달청', price: 120_000_000, d: 5, match: 92,
    region: '서울', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261021-0047',
    period: '계약 후 30일', license: null, posted: 0,
    reasons: ['업종 일치', '지역 일치', '가격대 일치'] },
  { id: 2, type: '용역', title: '정보시스템 유지보수', org: '서울시 교육청', price: 85_000_000, d: 3, match: 87,
    region: '서울', regionLimit: '서울', law: '지방계약법', award: '적격심사', no: '20261020-0312',
    period: '계약 후 12개월', license: '소프트웨어사업자 신고', posted: 1,
    reasons: ['업종 일치', '지역 일치', '가격대 일치'] },
  { id: 3, type: '물품', title: 'LED 조명기구 납품', org: '국방부', price: 340_000_000, d: 7, match: 83,
    region: '경기', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261019-1185',
    period: '계약 후 60일', license: null, posted: 2,
    reasons: ['업종 일치', '가격대 일치', '실적 충족'] },
  { id: 4, type: '용역', title: '홈페이지 재구축', org: '한국수자원공사', price: 210_000_000, d: 12, match: 78,
    region: '대전', regionLimit: null, law: '국가계약법', lawNote: '공기업·준정부기관 계약사무규칙', award: '협상에 의한 계약', no: '20261018-0921',
    period: '계약 후 6개월', license: '소프트웨어사업자 신고', posted: 3,
    reasons: ['업종 일치', '가격대 일치'] },
  { id: 5, type: '물품', title: '사무가구 구매', org: '경기도청', price: 56_000_000, d: 2, match: 72,
    region: '경기', regionLimit: '경기', law: '지방계약법', award: '적격심사', no: '20261020-0558',
    period: '계약 후 20일', license: null, posted: 1,
    reasons: ['지역 일치', '가격대 일치', '실적 충족'] },
  { id: 6, type: '용역', title: '보안관제 서비스', org: '한국전력공사', price: 480_000_000, d: 15, match: 68,
    region: '전남', regionLimit: null, law: '국가계약법', lawNote: '공기업·준정부기관 계약사무규칙', award: '적격심사', no: '20261017-2043',
    period: '계약 후 24개월', license: '정보보호전문서비스기업 지정', posted: 4,
    reasons: ['가격대 일치'] },
  { id: 7, type: '물품', title: '의료기기 소모품', org: '국립중앙의료원', price: 92_000_000, d: 4, match: 65,
    region: '서울', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261020-0077',
    period: '계약 후 14일', license: '의료기기 판매업 신고', posted: 1,
    reasons: ['지역 일치', '가격대 일치'] },
  { id: 8, type: '공사', title: '청사 리모델링', org: '강남구청', price: 730_000_000, d: 20, match: 55,
    region: '서울', regionLimit: '서울', law: '지방계약법', award: '적격심사', no: '20261016-0430',
    period: '착공 후 120일', license: '실내건축공사업 등록', posted: 5,
    reasons: ['지역 일치'] },
  { id: 9, type: '용역', title: '클라우드 인프라 구축', org: '과학기술정보통신부', price: 1_500_000_000, d: 8, match: 52,
    region: '세종', regionLimit: null, law: '국가계약법', award: '협상에 의한 계약', no: '20261015-1402',
    period: '계약 후 10개월', license: '소프트웨어사업자 신고', posted: 6,
    reasons: ['업종 일치'] },
  { id: 10, type: '물품', title: '네트워크 장비 교체', org: '관세청', price: 270_000_000, d: 6, match: 48,
    region: '인천', regionLimit: '인천', law: '국가계약법', award: '적격심사', no: '20261019-0815',
    period: '계약 후 45일', license: null, posted: 2,
    reasons: ['가격대 일치'] },
];

export const getBid = (id: number | string) => BIDS.find((b) => b.id === Number(id));

export const REASONS: Reason[] = ['업종 일치', '지역 일치', '가격대 일치', '실적 충족'];

export const REGIONS = ['서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '대구', '경북', '부산', '울산', '경남', '광주', '전북', '전남', '제주'];

// 업종 분류 (대분류 > 중분류 > 세분류) — 더미 분류
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

// 가격 슬라이더 단계 (1천만원 ~ 50억원)
export const PRICE_STEPS = [10e6, 30e6, 50e6, 1e8, 2e8, 3e8, 5e8, 7e8, 10e8, 20e8, 30e8, 50e8];
