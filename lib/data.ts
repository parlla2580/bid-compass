/* =========================================================
 * 입찰나침반 — 데이터 타입과 기준 목록
 * 공고·계약·업종은 Supabase(수집 배치가 나라장터 API로 채움)에서 읽습니다.
 * ========================================================= */

export type BidType = '물품' | '용역' | '공사';
export type CompanySize = '중소기업' | '중견기업' | '대기업';

/** 나라장터 업종 (업종 및 근거법규서비스) */
export interface Industry {
  code: string;
  name: string;
}

/** 공고 면허제한 한 줄 — 같은 group은 모두 충족해야 하고, group 중 하나만 충족하면 참여 가능으로 봄 */
export interface LicenseLimit {
  group: string | null;
  name: string;
  code: string | null;
  /** 허용업종 "업종명/코드" */
  allowed: string[];
}

/** 품목 — 나라장터 세부품명번호(물품 10자리) 또는 공공조달분류번호(용역 8자리) */
export interface Product {
  code: string;
  name: string;
  /** nara: 나라장터 공급물품에서 자동, user: 직접 선택 */
  source?: 'nara' | 'user';
}

export interface Notice {
  id: number;
  bidNo: string;
  bidOrd: string;
  type: BidType;
  title: string;
  org: string;
  demandOrg: string | null;
  /** 계약체결방법 (예: 제한경쟁, 수의계약) */
  contract: string;
  /** 낙찰방법 (예: 적격심사제-…, 소액수의견적-…) */
  award: string;
  /** 추정가격(원, 부가가치세 제외) */
  estPrice: number;
  basePrice: number | null;
  reserveMin: number | null;
  reserveMax: number | null;
  floorRate: number | null;
  closesAt: Date;
  /** 마감까지 남은 일수 (음수 = 마감) */
  d: number;
  /** 참가가능지역 (null = 지역제한 없음) */
  regionLimit: string[] | null;
  regionBasis: string | null;
  licenseLimits: LicenseLimit[] | null;
  productName: string | null;
  /** 공고 품목 (물품: 구매대상 세부품명, 용역: 공공조달분류) */
  products: Product[];
  /** 공고종류 — 등록공고 / 변경공고 / 재공고 / 취소공고 */
  kind: string | null;
  /** 예정가격 결정방법 — 복수예가 / 단일예가 / 비예가 */
  prearng: string | null;
  /** 공고 원본의 업종제한여부 (Y면 면허 제한이 있는 공고) */
  industryLimited: boolean;
  url: string | null;
  postedAt: Date;
  /** 오늘 게시 */
  isNew: boolean;
}

export interface Profile {
  /** 사업자등록번호 (선택) */
  bizno: string | null;
  naraRegistered: boolean | null;
  corpName: string | null;
  /** 나라장터 업종 — null: 미입력, []: 업종 없이 시작 */
  industries: Industry[] | null;
  /** 소재지 — '경기도 용인시' 또는 '경기도'(시군구 미입력) */
  location: string | null;
  size: CompanySize | null;
  records: string;
  /** 매칭 선호도(F1-3) */
  types: BidType[];
  preferredOrgs: string[];
  priceRange: [number, number] | null;
  /** 주요 품목 — null: 미입력 */
  products: Product[] | null;
  /** 관심 없음 — 업종(실제로 하지 않는 면허)·품목·공고 */
  muted: MuteItem[];
  /** 꼭 볼 단어 / 빼고 싶은 단어 */
  keywords: Keywords;
}

export interface Keywords { plus?: string[]; minus?: string[] }

/** 공고 제목·품명에서 단어 찾기 (띄어쓰기·대소문자 무시) */
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
export function keywordHit(n: Pick<Notice, 'title' | 'products'>, words?: string[]): string | null {
  if (!words?.length) return null;
  const text = norm(`${n.title} ${n.products.map((p) => p.name).join(' ')}`);
  return words.find((w) => w.trim() && text.includes(norm(w))) ?? null;
}

export interface MuteItem {
  kind: 'industry' | 'product' | 'notice';
  code: string;
  name: string;
}

export const EMPTY_PROFILE: Profile = {
  bizno: null,
  naraRegistered: null,
  corpName: null,
  industries: null,
  location: null,
  size: null,
  records: '',
  types: ['물품', '용역', '공사'],
  preferredOrgs: [],
  priceRange: null,
  products: null,
  muted: [],
  keywords: {},
};

export const SIZES: CompanySize[] = ['중소기업', '중견기업', '대기업'];

/* ---------- 공고 행 → 화면용 ---------- */
export interface NoticeRow {
  id: number;
  bid_no: string;
  bid_ord: string;
  bid_type: BidType;
  title: string;
  org: string;
  demand_org: string | null;
  contract: string;
  award: string;
  est_price: number;
  base_price: number | null;
  reserve_rate_min: number | null;
  reserve_rate_max: number | null;
  floor_rate: number | null;
  closes_at: string;
  region_limit: string[] | null;
  region_basis: string | null;
  license_limits: LicenseLimit[] | null;
  product_name: string | null;
  url: string | null;
  posted_at: string;
  /** 공고 원본에서 꺼낸 품목 필드 */
  p_code?: string | null;
  p_list?: string | null;
  s_code?: string | null;
  s_name?: string | null;
  kind?: string | null;
  prearng?: string | null;
  ind_lmt?: string | null;
}

export const NOTICE_COLUMNS =
  'id,bid_no,bid_ord,bid_type,title,org,demand_org,contract,award,est_price,base_price,reserve_rate_min,reserve_rate_max,floor_rate,closes_at,region_limit,region_basis,license_limits,product_name,url,posted_at,p_code:raw->>dtilPrdctClsfcNo,p_list:raw->>purchsObjPrdctList,s_code:raw->>pubPrcrmntClsfcNo,s_name:raw->>pubPrcrmntClsfcNm,kind:raw->>ntceKindNm,prearng:raw->>prearngPrceDcsnMthdNm,ind_lmt:raw->>indstrytyLmtYn';

/** '[1^1016170701^꽃꽂이],[2^…]' + 세부품명번호 + 공공조달분류 → 품목 목록 */
function noticeProducts(r: NoticeRow): Product[] {
  const out = new Map<string, Product>();
  for (const m of (r.p_list ?? '').matchAll(/\^(\d{8,10})\^([^\],]+)/g)) out.set(m[1], { code: m[1], name: m[2].trim() });
  if (r.p_code && /^\d{8,10}$/.test(r.p_code) && !out.has(r.p_code)) out.set(r.p_code, { code: r.p_code, name: r.product_name ?? r.p_code });
  if (r.s_code && /^\d{8,10}$/.test(r.s_code) && !out.has(r.s_code)) out.set(r.s_code, { code: r.s_code, name: r.s_name ?? r.s_code });
  return [...out.values()];
}

const DAY = 86400e3;
const kstDay = (d: Date) => Math.floor((d.getTime() + 9 * 3600e3) / DAY);

export function toNotice(r: NoticeRow, now = new Date()): Notice {
  const closesAt = new Date(r.closes_at);
  const postedAt = new Date(r.posted_at);
  return {
    id: r.id,
    bidNo: r.bid_no,
    bidOrd: r.bid_ord,
    type: r.bid_type,
    title: r.title,
    org: r.org,
    demandOrg: r.demand_org,
    contract: r.contract,
    award: r.award,
    estPrice: Number(r.est_price) || 0,
    basePrice: r.base_price === null ? null : Number(r.base_price),
    reserveMin: r.reserve_rate_min === null ? null : Number(r.reserve_rate_min),
    reserveMax: r.reserve_rate_max === null ? null : Number(r.reserve_rate_max),
    floorRate: r.floor_rate === null ? null : Number(r.floor_rate),
    closesAt,
    d: closesAt < now ? -1 : kstDay(closesAt) - kstDay(now),
    regionLimit: r.region_limit?.length ? r.region_limit.filter((x) => x !== '전국') : null,
    regionBasis: r.region_basis,
    licenseLimits: r.license_limits?.length ? r.license_limits : null,
    productName: r.product_name,
    products: noticeProducts(r),
    kind: r.kind ?? null,
    prearng: r.prearng || null,
    industryLimited: r.ind_lmt === 'Y',
    url: r.url,
    postedAt,
    isNew: kstDay(postedAt) === kstDay(now),
  };
}

/* ---------- 시도·시군구 (2026년 기준) ----------
 * 시군구 목록은 공고 참가가능지역 이름과 맞추기 위한 것입니다.
 * 행정구역 개편이 있으면 갱신해야 합니다 (예: 인천 2026년 개편 반영 여부 확인 필요).
 */
export const SIGUNGU: Record<string, string[]> = {
  '서울특별시': ['종로구', '중구', '용산구', '성동구', '광진구', '동대문구', '중랑구', '성북구', '강북구', '도봉구', '노원구', '은평구', '서대문구', '마포구', '양천구', '강서구', '구로구', '금천구', '영등포구', '동작구', '관악구', '서초구', '강남구', '송파구', '강동구'],
  '부산광역시': ['중구', '서구', '동구', '영도구', '부산진구', '동래구', '남구', '북구', '해운대구', '사하구', '금정구', '강서구', '연제구', '수영구', '사상구', '기장군'],
  '대구광역시': ['중구', '동구', '서구', '남구', '북구', '수성구', '달서구', '달성군', '군위군'],
  '인천광역시': ['제물포구', '영종구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '서구', '검단구', '강화군', '옹진군', '중구', '동구'],
  '대전광역시': ['동구', '중구', '서구', '유성구', '대덕구'],
  '울산광역시': ['중구', '남구', '동구', '북구', '울주군'],
  '세종특별자치시': [],
  '경기도': ['수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시', '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시', '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시', '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군'],
  '강원특별자치도': ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  '충청북도': ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  '충청남도': ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  '전북특별자치도': ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
  // 광주광역시 + 전라남도 통합 (공고 데이터에서 '전남광주통합특별시' 확인). 하위 지역 명칭 변경 여부는 확인 필요
  '전남광주통합특별시': ['동구', '서구', '남구', '북구', '광산구', '목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  '경상북도': ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  '경상남도': ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
  '제주특별자치도': ['제주시', '서귀포시'],
};

export const SIDO = Object.keys(SIGUNGU);

/** 행정구역 통합 전 이름 → 현재 이름. 공고·업체 주소에 예전 이름이 섞여 와도 같은 지역으로 비교 */
const REGION_ALIASES: Record<string, string> = {
  '광주광역시': '전남광주통합특별시',
  '전라남도': '전남광주통합특별시',
};

export function canonicalRegion(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  return [REGION_ALIASES[first] ?? first, ...rest].join(' ');
}

/** '경기도 용인시' → { sido: '경기도', sigungu: '용인시' } */
export function splitLocation(loc: string | null): { sido: string | null; sigungu: string | null } {
  if (!loc) return { sido: null, sigungu: null };
  const [sido, ...rest] = canonicalRegion(loc).split(/\s+/);
  return { sido, sigungu: rest.join(' ') || null };
}

/** 시군구까지 입력했는지 (세종은 시군구 없음) */
export const hasSigungu = (loc: string | null) => {
  const { sido, sigungu } = splitLocation(loc);
  return !!sigungu || (!!sido && SIGUNGU[sido]?.length === 0);
};

// 추정가격 범위 슬라이더 단계 (1천만원 ~ 50억원)
export const PRICE_STEPS = [10e6, 30e6, 50e6, 1e8, 2e8, 3e8, 5e8, 7e8, 10e8, 20e8, 30e8, 50e8];

/** 기초금액이 추정가격보다 훨씬 작으면 단가(1개·1회 기준) 입찰로 보임 — 추정 */
export const looksUnitPrice = (n: Pick<Notice, 'basePrice' | 'estPrice'>) =>
  !!n.basePrice && n.estPrice > 0 && n.basePrice < n.estPrice * 0.2;
