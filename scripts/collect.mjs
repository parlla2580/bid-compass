// =========================================================
// 나라장터 공고·계약 수집 (GitHub Actions에서 주기 실행)
//
// 환경변수
//   NARA_API_KEY          공공데이터포털 일반 인증키
//   SUPABASE_URL          Supabase 프로젝트 주소
//   SUPABASE_SECRET_KEY   Supabase 관리자 키 (sb_secret_...) — 없으면 저장하지 않고 결과만 출력
//   COLLECT_HOURS         수집 구간(시간, 예약 실행 3 · 수동 기본 6) — 등록일시 기준
//   COLLECT_FROM/TO       과거 기간 거슬러 받기 (한국시간 날짜 YYYY-MM-DD, TO 포함). 있으면 HOURS 대신 사용
//
// 실행: node scripts/collect.mjs [--dry]
// 실행 결과는 Supabase collect_runs 테이블에 기록됩니다.
// =========================================================
import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const KEY = process.env.NARA_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const HOURS = Number(process.env.COLLECT_HOURS || 6);
// 거슬러 받기 — 날짜 범위 (한국시간 0시 기준, 끝 날짜 하루 전체 포함)
//  2026-10-27 · 20261027 · 2026.10.27 · 2026/10/27 모두 받음. 값이 있는데 날짜가 아니면 평소 수집으로 넘어가지 않고 멈춤
//  (2026-11-18: from 칸에 '2', to 칸에 '20261027'이 들어가 조용히 평소 6시간 수집만 돈 일이 있었음)
function parseDay(name) {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return null;
  const m = /^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/.exec(raw);
  const d = m && new Date(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+09:00`);
  if (!d || Number.isNaN(d.getTime()) || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) {
    console.error(`::error::${name === 'COLLECT_FROM' ? '거슬러 받기 시작일(from)' : '끝날(to)'} 칸의 '${raw}'은(는) 날짜가 아니에요. 2026-10-27처럼 넣어 주세요. 수집하지 않고 멈춥니다.`);
    process.exit(1);
  }
  return d;
}
const RANGE_FROM = parseDay('COLLECT_FROM');
const RANGE_TO_DAY = parseDay('COLLECT_TO');
const RANGE_TO = RANGE_TO_DAY ? new Date(RANGE_TO_DAY.getTime() + 86400e3) : null;
if (RANGE_TO && !RANGE_FROM) {
  console.error('::error::끝날(to)만 있고 거슬러 받기 시작일(from)이 비어 있어요. 두 번째 칸(from)에 시작일을 넣어 주세요. 수집하지 않고 멈춥니다.');
  process.exit(1);
}
const LONG = HOURS > 24 || !!RANGE_FROM;
const CATCHUP_MAX_H = 48; // 빈틈 메우기 최대 시간
// snapshot: 수집 없이 공고 목록 스냅샷만 다시 만듦 (수동 실행용)
const MODE = process.env.COLLECT_MODE || 'full';
const DRY = process.argv.includes('--dry') || !SB_KEY;

const BID = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService02';
const CNT = 'https://apis.data.go.kr/1230000/ao/CntrctInfoService';
const SCS = 'https://apis.data.go.kr/1230000/as/ScsbidInfoService';
// 개찰순위 상세 조회는 공고번호마다 1회 — 낙찰정보서비스 운영계정 전환(2026-11-09) 후 상한 상향
// 2026-11-22: 모든 API 운영계정 전환(사용자 확인) + 039 매시 실행 → 실행당 3,000
//   매시 24회 × 3,000 = 최대 72,000회/일 + 목록 조회 (운영계정 하루 최대 10만 건 안) · 밀린 순위 약 15만 건을 2~3일에
const DETAIL_CAP = Number(process.env.BID_DETAIL_CAP || 3000);
const DETAIL_PARALLEL = 4;
// 실행 시간 제한(150분) 안에서 여유 있게 멈춤. 예약 실행은 매시라 40분에서 끊고 다음 실행이 이어 받음
const DETAIL_TIME_LIMIT = (LONG ? 100 : 40) * 60e3;
const IND = 'https://apis.data.go.kr/1230000/ao/IndstrytyBaseLawrgltInfoService/getIndstrytyBaseLawrgltInfoList';
// 사전규격 (022) — 정식 공고 전 규격·배정예산 공개 → '곧 나올 공고'
const HRC = 'https://apis.data.go.kr/1230000/ao/HrcspSsstndrdInfoService';
const ROWS = 999;
const TYPES = [
  { name: '물품', bid: 'Thng', cnt: 'Thng' },
  { name: '용역', bid: 'Servc', cnt: 'Servc' },
  { name: '공사', bid: 'Cnstwk', cnt: 'Cnstwk' },
];

if (!KEY) {
  console.error('NARA_API_KEY가 없습니다. GitHub 저장소 Settings > Secrets and variables > Actions 에 등록하세요.');
  process.exit(1);
}
if (!DRY && !SB_URL) {
  console.error('SUPABASE_URL이 없습니다.');
  process.exit(1);
}

let apiCalls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- 날짜 (나라장터는 한국시간 기준 YYYYMMDDHHmm) ---------- */
const kst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString();
const ymdhm = (d) => kst(d).slice(0, 16).replace(/[-T:]/g, '');
/** "2026-11-12 10:00:00" (한국시간) → ISO */
const kstIso = (s) => (s ? `${s.trim().replace(' ', 'T')}${s.length <= 10 ? 'T00:00:00' : ''}+09:00` : null);
const num = (s) => (s === undefined || s === null || s === '' ? null : Number(String(s).replace(/,/g, '')));
/** 원 단위 금액(DB bigint) — 단가 입찰은 소수점(예: 1138.06원)이 있어 반올림 */
const won = (s) => { const n = num(s); return n === null || Number.isNaN(n) ? null : Math.round(n); };

/*
 * 공사 A값·순공사비·기초금액 공개일 (026) — 기초금액 API에 함께 옴
 *  A값 = 국민연금 + 건강보험 + 퇴직공제부금 + 노인장기요양 + 산업안전보건관리비 + 안전관리비 + 품질관리비(대상일 때)
 *  A값 대상 공고의 투찰 하한 = (예정가격 − A) × 낙찰하한율 + A  (인포21C·비드큐 안내, 시설공사 적격심사)
 *  026 실행 전에는 열이 없으므로 저장하지 않음 (hasCostCols)
 */
const A_KEYS = { npnInsrprm: '국민연금', mrfnHealthInsrprm: '건강보험', rtrfundNon: '퇴직공제부금', odsnLngtrmrcprInsrprm: '노인장기요양',
  sftyMngcst: '산업안전보건관리비', sftyChckMngcst: '안전관리비', qltyMngcst: '품질관리비' };
let hasCostCols = false;
function costCols(b) {
  if (!hasCostCols || !b) return {};
  const parts = {};
  for (const [k, label] of Object.entries(A_KEYS)) {
    if (k === 'qltyMngcst' && b.qltyMngcstAObjYn === 'N') continue;
    const v = won(b[k]);
    if (v && v > 0) parts[label] = v;
  }
  const sum = Object.values(parts).reduce((a, x) => a + x, 0);
  return {
    a_value: sum || null,
    a_apply: b.bidPrceCalclAYn === 'Y' ? true : b.bidPrceCalclAYn === 'N' ? false : null,
    a_parts: sum ? parts : null,
    net_cost: won(b.bssAmtPurcnstcst) || null,
    base_open_at: kstIso(b.bssamtOpenDt) ?? (b.bssamt ? kstIso(b.inptDt) : null),
  };
}

/* ---------- API 호출 (재시도 + 페이지 넘김) ---------- */
async function call(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    apiCalls++;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      const text = await res.text();
      const json = JSON.parse(text);
      if (json.response?.header?.resultCode === '00') return json.response.body;
      const err = json.response?.header?.resultMsg ?? json['nkoneps.com.response.ResponseError']?.header?.resultMsg
        ?? json.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnAuthMsg ?? text.slice(0, 200);
      throw new Error(`API 오류: ${err}`);
    } catch (e) {
      if (attempt === 4 || /서비스키|SERVICE_KEY/.test(e.message)) throw e;
      await sleep(2000 * attempt);
    }
  }
}

const MAX_PAGES = 50;
class TooMany extends Error {}

/** 페이지를 이어 받음. 전체 건수가 50쪽(49,950건)을 넘으면 strict일 때 첫 쪽에서 TooMany, 아니면 잘린다고 경고 */
async function fetchAll(base, params, { strict = false } = {}) {
  const out = [];
  let total = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const qs = new URLSearchParams({ serviceKey: KEY, pageNo: page, numOfRows: ROWS, type: 'json', ...params });
    const body = await call(`${base}?${qs}`);
    total = Number(body.totalCount ?? 0);
    if (page === 1 && strict && total > MAX_PAGES * ROWS) throw new TooMany(String(total));
    const items = body.items ?? [];
    out.push(...(Array.isArray(items) ? items : items.item ? [].concat(items.item) : []));
    if (out.length >= total || !items.length) break;
  }
  if (total > out.length + ROWS) console.log(`  ⚠ ${base.split('/').pop()}: ${total}건 중 ${out.length}건만 받음 (페이지 상한)`);
  return out;
}

/** 구간이 너무 크면(50쪽 초과) 반으로 나눠 받음 — 하루치 계약 세부 물품이 5만 행을 넘는 날이 있음 (2026-11-18 확인) */
async function fetchAllSplit(base, extra, from, to) {
  try {
    return await fetchAll(base, { ...extra, inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) }, { strict: to - from > 3600e3 });
  } catch (e) {
    if (!(e instanceof TooMany)) throw e;
    const mid = new Date(from.getTime() + Math.round((to - from) / 2 / 3600e3) * 3600e3);
    console.log(`  ${base.split('/').pop()}: ${e.message}건이라 ${ymdhm(from)}~${ymdhm(mid)}~${ymdhm(to)}로 나눠 받음`);
    return [...await fetchAllSplit(base, extra, from, mid), ...await fetchAllSplit(base, extra, mid, to)];
  }
}

/* ---------- 공고 ---------- */
async function collectNotices(from, to) {
  const period = { inqryDiv: '1', inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) };

  // 참가가능지역·면허제한은 업무 구분 없이 한 번에 조회
  const [regions, licenses] = await Promise.all([
    fetchAll(`${BID}/getBidPblancListInfoPrtcptPsblRgn02`, period),
    fetchAll(`${BID}/getBidPblancListInfoLicenseLimit02`, period),
  ]);
  const key = (r) => `${r.bidNtceNo}-${r.bidNtceOrd}`;
  const regionMap = new Map();
  for (const r of regions) {
    const list = regionMap.get(key(r)) ?? [];
    if (r.prtcptPsblRgnNm && !list.includes(r.prtcptPsblRgnNm)) list.push(r.prtcptPsblRgnNm);
    regionMap.set(key(r), list);
  }
  const licenseMap = new Map();
  for (const l of licenses) {
    // "식품판매업(집단급식소식품판매업)/5246" → 이름·코드 분리
    const m = /^(.*)\/(\w+)$/.exec(l.lcnsLmtNm ?? '');
    const list = licenseMap.get(key(l)) ?? [];
    list.push({
      group: l.lmtGrpNo ?? null,
      name: m ? m[1] : l.lcnsLmtNm,
      code: m ? m[2] : null,
      allowed: (l.permsnIndstrytyList ?? '').match(/\[[^\]]+\]/g)?.map((s) => s.slice(1, -1)) ?? [],
    });
    licenseMap.set(key(l), list);
  }

  const rows = [];
  const allBases = [];
  for (const t of TYPES) {
    const [items, bases] = await Promise.all([
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}02`, period),
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}BsisAmount02`, period).catch(() => []),
    ]);
    allBases.push(...bases);
    // 기초금액은 공고번호+차수로 맞춤 (번호만으로 맞추면 다른 차수 값이 섞임)
    const baseMap = new Map(bases.map((b) => [`${b.bidNtceNo}|${b.bidNtceOrd ?? '000'}`, b]));
    for (const it of items) {
      const k = key(it);
      const base = baseMap.get(`${it.bidNtceNo}|${it.bidNtceOrd ?? '000'}`);
      const regionList = regionMap.get(k) ?? null;
      const licenseList = licenseMap.get(k) ?? null;
      rows.push({
        bid_no: it.bidNtceNo,
        bid_ord: it.bidNtceOrd,
        title: it.bidNtceNm || '(공고명 없음)',
        org: it.ntceInsttNm,
        demand_org: it.dminsttNm || null,
        org_type: null,
        bid_type: t.name,
        contract: it.cntrctCnclsMthdNm || '미상',
        award: it.sucsfbidMthdNm || '미상',
        est_price: won(it.presmptPrce) ?? 0,
        base_price: won(base?.bssamt),
        reserve_rate_min: num(base?.rsrvtnPrceRngBgnRate),
        reserve_rate_max: num(base?.rsrvtnPrceRngEndRate),
        ...costCols(base),
        floor_rate: num(it.sucsfbidLwltRate),
        closes_at: kstIso(it.bidClseDt) ?? kstIso(it.opengDt) ?? new Date().toISOString(),
        period: it.dlvrTmlmtDt ? `납품기한 ${it.dlvrTmlmtDt.slice(0, 10)}` : it.dlvrDaynum ? `납품일수 ${it.dlvrDaynum}일` : null,
        region_parsed: true,
        region_limit: regionList,
        region_basis: it.rgnLmtBidLocplcJdgmBssNm || null,
        industry_mid: licenseList?.[0]?.name ?? null,
        industry_leaf: null,
        license_limits: licenseList,
        sme_only: null, // 공고 API에 필드 없음 → 판정 시 '확인 필요'
        direct_product: null,
        license: null,
        product_name: it.dtilPrdctClsfcNoNm || null,
        url: it.bidNtceDtlUrl || it.bidNtceUrl || null,
        raw: it,
        posted_at: kstIso(it.bidNtceDt) ?? new Date().toISOString(),
        source: 'api',
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`  공고 ${t.name}: ${items.length}건 (기초금액 ${bases.length}건)`);
  }
  console.log(`  참가가능지역 ${regions.length}행, 면허제한 ${licenses.length}행`);

  // 기초금액·지역·면허는 공고보다 늦게 등록되기도 함 → 이번 구간에 공고가 없으면 이미 저장된 공고에 덧붙임
  const rowKeys = new Set(rows.map((r) => `${r.bid_no}-${r.bid_ord}`));
  const rowNos = new Set(rows.map((r) => r.bid_no));
  const updates = [];
  for (const [k, list] of regionMap) {
    if (rowKeys.has(k)) continue;
    const [bid_no, bid_ord] = k.split('-');
    updates.push({ match: { bid_no, bid_ord }, set: { region_limit: list } });
  }
  for (const [k, list] of licenseMap) {
    if (rowKeys.has(k)) continue;
    const [bid_no, bid_ord] = k.split('-');
    updates.push({ match: { bid_no, bid_ord }, set: { license_limits: list, industry_mid: list[0]?.name ?? null } });
  }
  for (const b of allBases) {
    if (rowNos.has(b.bidNtceNo)) continue;
    updates.push({
      match: { bid_no: b.bidNtceNo, bid_ord: b.bidNtceOrd ?? '000' },
      set: { base_price: won(b.bssamt), reserve_rate_min: num(b.rsrvtnPrceRngBgnRate), reserve_rate_max: num(b.rsrvtnPrceRngEndRate), ...costCols(b) },
    });
  }

  // 같은 공고번호·차수가 여러 번 나오면 마지막 것만.
  // 이미 마감된 공고는 원본(raw)에서 분석에 쓰는 항목만 남겨 저장 (2026-11-17 결정 B — 거슬러 받기 용량 절약)
  //  · 품목·분류·면허·공고종류·사전규격번호 등은 남김 → 시장 나누기·사전규격 연결·이력 비슷한 공고에 사용
  const now = Date.now();
  const unique = [...new Map(rows.map((r) => [`${r.bid_no}-${r.bid_ord}`, r])).values()];
  let slim = 0;
  for (const r of unique) {
    if (new Date(r.closes_at).getTime() >= now) continue;
    r.raw = Object.fromEntries(RAW_KEEP.filter((k) => r.raw?.[k] !== undefined && r.raw[k] !== '').map((k) => [k, r.raw[k]]));
    slim++;
  }
  if (slim) console.log(`  이미 마감된 공고 ${slim}건은 필요한 항목만 저장`);
  return { rows: unique, updates };
}

/** 마감 공고에서 남길 원본 항목 — 화면·DB 함수(014 자동 계산 열, 022 pre_no)가 읽는 것 */
const RAW_KEEP = [
  'dtilPrdctClsfcNo', 'purchsObjPrdctList', 'pubPrcrmntClsfcNo', 'pubPrcrmntClsfcNm', 'ntceKindNm', 'prearngPrceDcsnMthdNm',
  'indstrytyLmtYn', 'bfSpecRgstNo', 'bidBeginDt', 'bidQlfctRgstDt', 'opengDt', 'cmmnSpldmdMethdNm', 'reNtceYn',
  'drwtPrdprcNum', 'totPrdprcNum', 'dlvryCndtnNm',
];

/** 이미 저장된 공고에 늦게 온 정보 덧붙이기 — 해당 공고가 아직 없으면 건너뜀 */
async function applyUpdates(sb, updates) {
  let n = 0;
  for (const u of updates) {
    let q = sb.from('notices').update(u.set);
    for (const [col, val] of Object.entries(u.match)) q = q.eq(col, val);
    const { error, count } = await q.select('id', { count: 'exact', head: true });
    if (error) throw new Error(`공고 보완 실패: ${error.message}`);
    n += count ?? 0;
  }
  return n;
}

/* ---------- 계약 ---------- */
// corpList 예: [1^주계약업체^단독^부천문구마트^김재욱^대한민국^100^부천문구마트^^2224600379]
function parseCorps(s) {
  return (s ?? '').match(/\[[^\]]*\]/g)?.map((x) => {
    const f = x.slice(1, -1).split('^');
    // 대표자명(f[4])은 화면에 쓰지 않는 개인정보라 저장하지 않음 (020)
    return { role: f[1] || null, kind: f[2] || null, name: f[3] || null, share: num(f[6]), bizno: f[9] || null };
  }) ?? [];
}

/** '2027-03-31' · '20270331' · '2027/03/31' → 'YYYY-MM-DD' (아니면 null) */
const ymdOrNull = (v) => { const m = /(\d{4})[-./]?(\d{2})[-./]?(\d{2})/.exec(String(v ?? '')); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };

async function collectContracts(from, to) {
  const period = { inqryDiv: '1', inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) };
  const rows = [];
  for (const t of TYPES) {
    const items = await fetchAll(`${CNT}/getCntrctInfoList${t.cnt}`, period);
    for (const it of items) {
      const corps = parseCorps(it.corpList);
      const detailUrl = it.cntrctDtlInfoUrl || null;
      rows.push({
        id: it.untyCntrctNo,
        // 나라장터 계약번호 — 같은 계약이 통합계약번호만 다르게 재등록되는 경우가 있어 이 값으로 한 건만 저장
        contract_no: /ctrtNo=([^&]+)/.exec(detailUrl ?? '')?.[1] ?? it.untyCntrctNo,
        bid_type: t.name,
        title: it.cntrctNm || it.cnstwkNm || '(계약명 없음)', // 공사 계약은 이름이 cnstwkNm(공사명)에 있음
        org: it.cntrctInsttNm || null,
        org_code: it.cntrctInsttCd || null,
        org_kind: it.cntrctInsttJrsdctnDivNm || null,
        method: it.cntrctCnclsMthdNm || null,
        base_law: it.baseLawNm || null,
        base_detail: it.baseDtls || null,
        amount: won(it.thtmCntrctAmt),
        total_amount: won(it.totCntrctAmt),
        contract_date: it.cntrctCnclsDate || it.cntrctDate || null,
        notice_no: it.ntceNo || null,
        // 020 — 공공조달분류·담당부서·수요기관·끝나는 날·공동계약 (담당자 이름·전화는 개인정보라 저장 안 함)
        class_code: it.pubPrcrmntClsfcNo || null,
        class_name: it.pubPrcrmntClsfcNm || null,
        class_mid: it.pubPrcrmntMidClsfcNm || null,
        dept: it.cntrctInsttChrgDeptNm || null,
        demand_orgs: it.dminsttList || null,
        end_date: ymdOrNull(it.ttalCcmpltDate || it.ttalScmpltDate),
        period_text: it.cntrctPrd || null,
        joint: it.cmmnCntrctYn ? it.cmmnCntrctYn === 'Y' : null,
        corps,
        corp_biznos: corps.map((c) => c.bizno).filter(Boolean),
        detail_url: detailUrl,
        raw: null, // 계약은 하루 1만 건 이상이라 원본은 저장하지 않음 (필요 항목만 위에 정리)
        registered_at: kstIso(it.rgstDt),
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`  계약 ${t.name}: ${items.length}건`);
  }
  // 같은 계약번호는 가장 나중에 등록된 것만
  rows.sort((a, b) => String(a.registered_at ?? '').localeCompare(String(b.registered_at ?? '')));
  const kept = [...new Map(rows.map((r) => [r.contract_no, r])).values()];
  // 버려진 통합계약번호 → 남긴 통합계약번호 (계약 세부 줄을 저장된 계약에 잇기 위해)
  const keptByNo = new Map(kept.map((r) => [r.contract_no, r.id]));
  kept.alias = new Map(rows.map((r) => [r.id, keptByNo.get(r.contract_no)]));
  return kept;
}

/* ---------- 계약 세부 (020) — 물품 품목·단가 (공사·용역 세부는 계약마다 호출이 필요해 제외) ---------- */
const LINE_OPS = [
  { kind: '물품', op: 'getCntrctInfoListThngDetail',
    map: (it) => ({ seq: [it.prdctClsfcNo, it.prdctIdntNo, it.krnPrdctNm].map((x) => x ?? '').join('|'), code: it.prdctClsfcNo || null,
      name: it.prdctClsfcNoNm || null, item_name: it.krnPrdctNm || null, unit_price: num(it.qtyUprcAmt), qty: num(it.prdctQty),
      amount: num(it.prdctAmt), origin: it.orgplceNm || null, contract_date: it.cntrctCnclsDate || null }) },
];

async function collectContractLines(from, to, dateOf, alias = new Map()) {
  const rows = new Map();
  for (const l of LINE_OPS) {
    try {
      const items = await fetchAllSplit(`${CNT}/${l.op}`, { inqryDiv: '1' }, from, to);
      for (const it of items) {
        if (!it.untyCntrctNo) continue;
        const id = alias.get(it.untyCntrctNo) ?? it.untyCntrctNo;
        const r = { contract_id: id, kind: l.kind, contract_date: null, ...l.map(it), collected_at: new Date().toISOString() };
        r.contract_date = ymdOrNull(r.contract_date) ?? dateOf.get(id) ?? null;
        rows.set(`${r.contract_id}|${r.kind}|${r.seq}`, r);
      }
      console.log(`  계약 세부 ${l.kind}: ${items.length}행`);
    } catch (e) {
      console.log(`  계약 세부 ${l.kind}: 받지 못함 (${e.message})`);
    }
  }
  return [...rows.values()];
}

/* ---------- 개찰 결과 (F7 입찰 분석) ---------- */
const okey = (no, ord, cls, rbid) => `${no}|${ord}|${cls ?? ''}|${rbid ?? ''}`;

/** 개찰결과 목록 + 최종낙찰자 + 예정가격 → openings 행 (구간 단위, 페이지로 한 번에 받음) */
async function collectOpenings(from, to) {
  const period = { inqryDiv: '1', inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) };
  const rows = new Map();
  const base = (t, it) => ({
    bid_no: it.bidNtceNo, bid_ord: it.bidNtceOrd ?? '000', clsfc_no: it.bidClsfcNo ?? '', rbid_no: it.rbidNtceNo ?? it.rbidNo ?? '',
    bid_type: t.name, title: it.bidNtceNm || '(공고명 없음)', updated_at: new Date().toISOString(),
  });
  const put = (r) => { const k = okey(r.bid_no, r.bid_ord, r.clsfc_no, r.rbid_no); rows.set(k, { ...(rows.get(k) ?? {}), ...r }); };

  for (const t of TYPES) {
    const [list, winners, prices] = await Promise.all([
      fetchAll(`${SCS}/getOpengResultListInfo${t.cnt}`, period),
      fetchAll(`${SCS}/getScsbidListSttus${t.cnt}`, period).catch(() => []),
      fetchAll(`${SCS}/getOpengResultListInfo${t.cnt}PreparPcDetail`, period).catch(() => []),
    ]);
    for (const it of list) {
      put({ ...base(t, it), org: it.ntceInsttNm || null, demand_org: it.dminsttNm || null, opened_at: kstIso(it.opengDt),
        status: it.progrsDivCdNm || null, participants: num(it.prtcptCnum) });
    }
    for (const it of winners) {
      put({ ...base(t, it), demand_org: it.dminsttNm || null, opened_at: kstIso(it.rlOpengDt), participants: num(it.prtcptCnum),
        winner_bizno: num(String(it.bidwinnrBizno ?? '').replace(/\D/g, '')) || null,
        winner_amount: won(it.sucsfbidAmt), winner_rate: num(it.sucsfbidRate) });
    }
    // 예비가격 상세는 복수예가마다 1행 → 공고별 예정가격·기초금액 한 번만
    for (const it of prices) {
      if (!it.plnprc && !it.bssamt) continue;
      put({ ...base(t, it), planned_price: won(it.plnprc), base_amount: won(it.bssamt) });
    }
    console.log(`  개찰 ${t.name}: 결과 ${list.length}건, 낙찰자 ${winners.length}건, 예비가격 ${prices.length}행`);
  }
  return [...rows.values()];
}

/** 개찰완료 공고의 투찰업체 순위 (공고마다 1회, 상한 DETAIL_CAP) */
async function collectBidDetails(sb) {
  const started = Date.now();
  // 회원 회사가 낙찰한 개찰을 먼저 (입찰 분석에 바로 반영되도록)
  const { data: members } = await sb.from('company_profiles').select('bizno').not('bizno', 'is', null);
  const memberNos = [...new Set((members ?? []).map((m) => Number(String(m.bizno).replace(/\D/g, ''))).filter(Boolean))];
  const pick = (q) => q.eq('details_fetched', false).or('status.eq.개찰완료,status.is.null');
  const first = memberNos.length
    ? (await pick(sb.from('openings').select('id,bid_no,bid_ord,clsfc_no,rbid_no')).in('winner_bizno', memberNos).limit(DETAIL_CAP)).data ?? []
    : [];
  // 서버가 한 번에 1,000행까지만 돌려줘서(.limit(3000)도 1,000에서 잘림 — 2026-11-22 실측) 1,000행씩 나눠 받음
  const rest = [];
  for (let off = 0; off < DETAIL_CAP; off += 1000) {
    const { data, error } = await pick(sb.from('openings').select('id,bid_no,bid_ord,clsfc_no,rbid_no'))
      .order('opened_at', { ascending: false }).order('id', { ascending: false }).range(off, Math.min(off + 999, DETAIL_CAP - 1));
    if (error) throw new Error(`개찰 대기 목록 조회 실패: ${error.message}`);
    rest.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  // 같은 공고번호(차수·분류·재입찰이 다른 개찰)는 한 번 조회로 함께 채움
  const groups = new Map();
  for (const o of [...first, ...rest]) {
    const g = groups.get(o.bid_no) ?? new Map();
    g.set(o.id, o);
    groups.set(o.bid_no, g);
  }
  const queue = [...groups.entries()].slice(0, DETAIL_CAP);
  let rowsSaved = 0, done = 0, calls = 0;

  async function work(bidNo, opens) {
    const items = await fetchAll(`${SCS}/getOpengResultListInfoOpengCompt`, { bidNtceNo: bidNo });
    calls++;
    for (const o of opens.values()) {
      const mine = items.filter((it) => (it.bidNtceOrd ?? '000') === o.bid_ord && (it.bidClsfcNo ?? '') === o.clsfc_no && (it.rbidNo ?? '') === o.rbid_no);
      const results = new Map(), companies = new Map();
      for (const it of mine) {
        const bizno = num(String(it.prcbdrBizno ?? '').replace(/\D/g, ''));
        if (!bizno) continue;
        const memo = (it.rmrk ?? '').trim();
        results.set(bizno, {
          opening_id: o.id, bizno, rank: num(it.opengRank), amount: won(it.bidprcAmt), rate: num(it.bidprcrt),
          note: !memo || memo === '정상' ? null : /하한/.test(memo) ? 1 : 2,
        });
        if (it.prcbdrNm) companies.set(bizno, { bizno, name: it.prcbdrNm, updated_at: new Date().toISOString() });
      }
      if (results.size) await upsert(sb, 'bid_results', [...results.values()], 'opening_id,bizno');
      if (companies.size) await upsert(sb, 'bid_companies', [...companies.values()], 'bizno');
      const { error: e2 } = await sb.from('openings').update({ details_fetched: true }).eq('id', o.id);
      if (e2) throw new Error(`개찰 상세 표시 실패: ${e2.message}`);
      rowsSaved += results.size; done++;
    }
  }

  let i = 0;
  const errors = [];
  await Promise.all(Array.from({ length: DETAIL_PARALLEL }, async () => {
    while (i < queue.length && Date.now() - started < DETAIL_TIME_LIMIT) {
      const [bidNo, opens] = queue[i++];
      try { await work(bidNo, opens); } catch (e) { errors.push(e.message); if (errors.length > 20) return; }
    }
  }));
  console.log(`  투찰 순위: 공고번호 ${calls}개 조회, 개찰 ${done}건, 투찰 기록 ${rowsSaved}행 (상한 ${DETAIL_CAP}, 회원 우선 ${first.length}건)`);
  if (errors.length) throw new Error(`투찰 순위 일부 실패 ${errors.length}건: ${errors[0]}`);
  return rowsSaved;
}

/* ---------- 나라장터 업종 목록 (업종 선택용) ---------- */
async function collectIndustries() {
  const items = await fetchAll(IND, {});
  const rows = items
    .filter((it) => it.indstrytyCd && it.indstrytyNm)
    .map((it) => ({
      code: it.indstrytyCd,
      name: it.indstrytyNm,
      category: it.indstrytyClsfcNm || null,
      in_use: it.indstrytyUseYn ? it.indstrytyUseYn === 'Y' : null,
      base_law: it.baseLawordNm || null,
      updated_at: new Date().toISOString(),
    }));
  console.log(`  업종 목록 ${rows.length}건`);
  return [...new Map(rows.map((r) => [r.code, r])).values()];
}

/* ---------- 저장 ---------- */
/*
 * DB 보호 (2026-11-17 장애) — 거슬러 받기가 12시간 넘게 쓰자 DB(Micro, 메모리 1GB)가 스왑·디스크 대기 100%로 멈춤
 *  · 거슬러 받기는 한 번에 200행씩, 매시간 수집은 500행씩
 *  · DB 시간 초과면 기다렸다가 다시 (1분 → 2분 → 4분), 그래도 안 되면 실패
 *  · 거슬러 받기는 하루치마다 쉬어 감 (BACKFILL_PAUSE_SEC, 기본 30초)
 */
const UPSERT_BATCH = RANGE_FROM ? 200 : 500;
const DB_BUSY = /statement timeout|upstream request timeout|schema cache|fetch failed|ECONNRESET|503|504|544/i;
async function upsert(sb, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    for (let attempt = 0; ; attempt++) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict });
      if (!error) break;
      if (attempt < 3 && DB_BUSY.test(error.message)) {
        console.log(`  ${table} 저장이 느려요 (${error.message.slice(0, 60)}) — ${2 ** attempt}분 뒤 다시`);
        await sleep(2 ** attempt * 60e3);
        continue;
      }
      throw new Error(`${table} 저장 실패: ${error.message}`);
    }
  }
}

/* ---------- 사전규격 (022) ----------
 * 물품·용역·공사 사전규격을 등록일시 구간으로 받음 (외자는 공고도 받지 않아 제외)
 * 담당자 이름·전화번호(ofclNm·ofclTelNo)는 개인정보라 저장하지 않음
 */
const PRE_TYPES = [{ name: '물품', op: 'Thng' }, { name: '용역', op: 'Servc' }, { name: '공사', op: 'Cnstwk' }];

async function collectPrespecs(from, to) {
  const period = { inqryDiv: '1', inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) };
  const rows = new Map();
  for (const t of PRE_TYPES) {
    const items = await fetchAll(`${HRC}/getPublicPrcureThngInfo${t.op}`, period);
    for (const it of items) {
      if (!it.bfSpecRgstNo) continue;
      const products = [...String(it.prdctDtlList ?? '').matchAll(/\[\d*\^([^^\]]+)\^([^\]]*)\]/g)].map((m) => ({ code: m[1].trim(), name: m[2].trim() }));
      rows.set(it.bfSpecRgstNo, {
        id: it.bfSpecRgstNo, kind: t.name, biz_div: it.bsnsDivNm || null,
        title: it.prdctClsfcNoNm || '(사업명 없음)',
        org: it.orderInsttNm || null, demand_org: it.rlDminsttNm || null,
        budget: won(it.asignBdgtAmt),
        received_at: kstIso(it.rcptDt), opinion_close: kstIso(it.opninRgstClseDt),
        delivery_until: ymdOrNull(it.dlvrTmlmtDt), delivery_days: num(it.dlvrDaynum) || null,
        sw: it.swBizObjYn ? it.swBizObjYn === 'Y' : null,
        products,
        files: [1, 2, 3, 4, 5].map((i) => it[`specDocFileUrl${i}`]).filter(Boolean),
        notice_nos: String(it.bidNtceNoList ?? '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean),
        registered_at: kstIso(it.rgstDt), changed_at: kstIso(it.chgDt),
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`  사전규격 ${t.name}: ${items.length}건`);
  }
  return [...rows.values()];
}

/** 최근 30일 사전규격 + 연결된 공고 → 공개 저장소 (화면은 CDN에서 파일 하나로) */
async function writePrespecSnapshot(sb) {
  // 함수 결과도 한 번에 1,000행까지라 나눠 받음
  const data = [];
  for (let i = 0; i < 50; i++) {
    const { data: part, error } = await sb.rpc('recent_prespecs', { p_days: 30 }).range(i * 1000, i * 1000 + 999);
    if (error) throw new Error(`recent_prespecs: ${error.message}`);
    data.push(...(part ?? []));
    if (!part || part.length < 1000) break;
  }
  const body = gzipSync(Buffer.from(JSON.stringify({ at: new Date().toISOString(), rows: data })));
  const { error: e2 } = await sb.storage.from('public-data')
    .upload('prespecs.json.gz', body, { contentType: 'application/gzip', upsert: true, cacheControl: '300' });
  if (e2) throw new Error(`저장소 올리기: ${e2.message}`);
  return `${data.length}건, ${(body.length / 1024).toFixed(0)}KB`;
}

/* ---------- 공고 목록 스냅샷 (018) ----------
 * 마감 전 공고 전체(open_notices, 014)를 압축해 공개 저장소에 올림 → 화면은 CDN에서 파일 하나로 받음
 * 실패해도 수집은 계속 (화면은 DB 함수로 자동 전환)
 */
async function writeSnapshot(sb) {
  const { data, error } = await sb.rpc('open_notices');
  if (error) throw new Error(`open_notices: ${error.message}`);
  const body = gzipSync(Buffer.from(JSON.stringify({ at: new Date().toISOString(), rows: data })));
  const { error: e2 } = await sb.storage.from('public-data')
    .upload('open-notices.json.gz', body, { contentType: 'application/gzip', upsert: true, cacheControl: '300' });
  if (e2) throw new Error(`저장소 올리기 (018 실행 여부 확인): ${e2.message}`);
  return `${data.length}건, ${(body.length / 1024 / 1024).toFixed(1)}MB`;
}

// 한 구간(최대 하루) 받기 — 공고·개찰·계약(세부)·사전규격. 오류는 onErr 로 넘김 (평소 수집·과거분 받기 공용)
async function collectChunk(sb, a, b, result, onErr, parts = null) {
  // parts: null = 전부 / ['notices','prespecs'] = 공고·사전규격만 (054 공고 과거분)
  const want = (k) => !parts || parts.includes(k);
  if (want('notices')) try {
    const { rows: notices, updates } = await collectNotices(a, b);
    result.notices += notices.length;
    if (sb) {
      await upsert(sb, 'notices', notices, 'bid_no,bid_ord');
      const patched = await applyUpdates(sb, updates);
      console.log(`  늦게 온 정보 ${updates.length}건 중 ${patched}건을 기존 공고에 반영`);
    }
  } catch (e) {
    onErr(`공고(${ymdhm(a)}): ${e.message}`);
  }
  if (want('openings')) try {
    const openings = await collectOpenings(a, b);
    result.openings = (result.openings ?? 0) + openings.length;
    if (sb) await upsert(sb, 'openings', openings, 'bid_no,bid_ord,clsfc_no,rbid_no');
  } catch (e) {
    onErr(`개찰(${ymdhm(a)}): ${e.message}`);
  }
  if (want('contracts')) try {
    const contracts = await collectContracts(a, b);
    result.contracts += contracts.length;
    // 계약 세부 — 020 실행 전이면 경고만 (수집 실패로 치지 않음)
    try {
      const lines = await collectContractLines(a, b, new Map(contracts.map((c) => [c.id, c.contract_date])), contracts.alias);
      const orphan = lines.filter((l) => !l.contract_date).length;
      if (orphan) console.log(`  계약 세부 중 이번 구간 계약 목록에 없는 줄: ${orphan}/${lines.length}`);
      result.lines = (result.lines ?? 0) + lines.length;
      if (sb && lines.length) await upsert(sb, 'contract_lines', lines, 'contract_id,kind,seq');
    } catch (e) {
      if (/contract_lines 저장 실패: .*(Could not find|does not exist)/.test(e.message)) console.log('  계약 세부 저장 건너뜀 — SQL 020 실행 필요');
      else onErr(`계약 세부(${ymdhm(a)}): ${e.message}`);
    }
    if (sb) {
      // 020 실행 전이면 새 열(분류·담당부서·수요기관·끝나는 날·공동계약)을 빼고 저장
      const NEW020 = ['class_code', 'class_name', 'class_mid', 'dept', 'demand_orgs', 'end_date', 'period_text', 'joint'];
      const strip = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !NEW020.includes(k))));
      let rowsToSave = contracts;
      try {
        await upsert(sb, 'contracts', rowsToSave, 'contract_no');
      } catch (e) {
        if (NEW020.some((k) => e.message.includes(`'${k}'`))) {
          console.log('  계약 새 항목 저장 건너뜀 — SQL 020 실행 필요');
          rowsToSave = strip(contracts);
          try { await upsert(sb, 'contracts', rowsToSave, 'contract_no'); }
          catch (e2) { if (!/contract_no/.test(e2.message)) throw e2; await upsert(sb, 'contracts', rowsToSave.map(({ contract_no, ...r }) => r), 'id'); }
        } else {
          // 005 SQL 실행 전(계약번호 칸 없음)에는 예전 방식으로 저장 — 중복은 걸러진 상태
          if (!/contract_no/.test(e.message)) throw e;
          await upsert(sb, 'contracts', rowsToSave.map(({ contract_no, ...r }) => r), 'id');
        }
      }
    }
  } catch (e) {
    onErr(`계약(${ymdhm(a)}): ${e.message}`);
  }
  // 사전규격 — 022 실행 전이면 경고만
  if (want('prespecs')) try {
    const pre = await collectPrespecs(a, b);
    result.prespecs = (result.prespecs ?? 0) + pre.length;
    if (sb && pre.length) await upsert(sb, 'prespecs', pre, 'id');
  } catch (e) {
    if (/prespecs 저장 실패: .*(Could not find|does not exist)/.test(e.message)) console.log('  사전규격 저장 건너뜀 — SQL 022 실행 필요');
    else onErr(`사전규격(${ymdhm(a)}): ${e.message}`);
  }
}

// 과거분 이어 받기 (043, 2026-11-22) — 평소 수집을 마친 뒤 과거 하루치씩 거꾸로 받음 (2026-02-28 → 2025-04-01)
//  · 진행 위치는 backfill_state 한 줄. 하루가 오류 없이 끝나야 앞 날로 넘어감 · 같은 날 3번 실패하면 skipped 에 남기고 넘어감
//  · 실행 시작부터 PAST_BUDGET_MIN(30분) 안에서만 새 날을 시작 · 한 실행에 최대 PAST_MAX_DAYS(3)일 (평일 하루 7~8분, 주말 1분)
//  · 오류는 평소 수집 오류와 섞지 않음 — 장애 알림·빈틈 메우기가 과거분 오류로 흔들리지 않게
const PAST_MAX_DAYS = Number(process.env.PAST_MAX_DAYS ?? 3);
const PAST_BUDGET = Number(process.env.PAST_BUDGET_MIN ?? 30) * 60e3;
const prevDay = (d) => new Date(Date.parse(`${d}T00:00:00Z`) - 86400e3).toISOString().slice(0, 10);
async function collectPastDays(sb, t0) {
  const { data: st, error } = await sb.from('backfill_state').select('next_day,stop_day,fails,skipped').eq('id', 1).maybeSingle();
  if (error) {
    if (/backfill_state/.test(error.message)) { console.log('과거분 이어 받기 건너뜀 — SQL 043 실행 필요'); return null; }
    throw new Error(error.message);
  }
  if (!st || st.next_day < st.stop_day) return null; // 다 받음
  let day = st.next_day, fails = st.fails ?? 0, skipped = st.skipped ?? [];
  const done = [], errs = [];
  for (let n = 0; n < PAST_MAX_DAYS && day >= st.stop_day && Date.now() - t0 < PAST_BUDGET; n++) {
    if (n) await sleep(10e3); // DB 쉬어 가기
    const a = new Date(`${day}T00:00:00+09:00`), b = new Date(a.getTime() + 86400e3);
    console.log(`- 과거분 ${day}`);
    const e = [];
    await collectChunk(sb, a, b, { notices: 0, contracts: 0 }, (m) => e.push(m));
    let advance = true;
    if (e.length) {
      fails += 1;
      errs.push(...e);
      if (fails < 3) advance = false; // 다음 실행에서 같은 날 다시
      else { skipped = [...skipped, day]; console.log(`  과거분 ${day} 3번 실패 — 건너뜀`); }
    }
    if (advance) { if (!e.length) done.push(day); fails = 0; day = prevDay(day); }
    const { error: ue } = await sb.from('backfill_state')
      .update({ next_day: day, fails, skipped, updated_at: new Date().toISOString() }).eq('id', 1);
    if (ue) throw new Error(`과거분 진행 위치 저장 실패: ${ue.message}`);
    if (!advance) break;
  }
  const msg = `과거분 ${done.length ? done.join(',') : '없음'}${errs.length ? ` · 오류 ${errs.length}건: ${errs.map((x) => x.replace('(', ' ')).join(' / ').slice(0, 300)}` : ''} · 다음 ${day}`;
  console.log(msg);
  return msg;
}

// 공고·사전규격 과거분 (054, 2026-11-27) — 계약·개찰은 빼고 공고·사전규격만 빠르게 거꾸로 (2025-03-31 → 2024-01-01)
//  · 진행 위치는 backfill_lite 한 줄 · 과거분(043)을 받은 뒤 남는 시간에 · 실행 시작 LITE_BUDGET_MIN(45분) 안에서만 새 날 시작
//  · 하루치가 가벼워(공고·사전규격만) 한 실행에 최대 LITE_MAX_DAYS(20)일
const LITE_MAX_DAYS = Number(process.env.LITE_MAX_DAYS ?? 20);
const LITE_BUDGET = Number(process.env.LITE_BUDGET_MIN ?? 45) * 60e3;
async function collectLiteDays(sb, t0) {
  const { data: st, error } = await sb.from('backfill_lite').select('next_day,stop_day,fails,skipped').eq('id', 1).maybeSingle();
  if (error) {
    if (/backfill_lite/.test(error.message)) { console.log('공고 과거분 건너뜀 — SQL 054 실행 필요'); return null; }
    throw new Error(error.message);
  }
  if (!st || st.next_day < st.stop_day) return null;
  let day = st.next_day, fails = st.fails ?? 0, skipped = st.skipped ?? [];
  const done = [], errs = [];
  for (let n = 0; n < LITE_MAX_DAYS && day >= st.stop_day && Date.now() - t0 < LITE_BUDGET; n++) {
    if (n) await sleep(3e3);
    const a = new Date(`${day}T00:00:00+09:00`), b = new Date(a.getTime() + 86400e3);
    const e = [];
    await collectChunk(sb, a, b, { notices: 0, contracts: 0 }, (m) => e.push(m), ['notices', 'prespecs']);
    let advance = true;
    if (e.length) {
      fails += 1; errs.push(...e);
      if (fails < 3) advance = false;
      else { skipped = [...skipped, day]; console.log(`  공고 과거분 ${day} 3번 실패 — 건너뜀`); }
    }
    if (advance) { if (!e.length) done.push(day); fails = 0; day = prevDay(day); }
    const { error: ue } = await sb.from('backfill_lite').update({ next_day: day, fails, skipped, updated_at: new Date().toISOString() }).eq('id', 1);
    if (ue) throw new Error(`공고 과거분 진행 위치 저장 실패: ${ue.message}`);
    if (!advance) break;
  }
  const msg = `공고 과거분 ${done.length}일${done.length ? ` ${done[0]}~${done[done.length - 1]}` : ''}${errs.length ? ` · 오류 ${errs.length}건` : ''} · 다음 ${day}`;
  console.log(msg);
  return msg;
}

async function main() {
  const T0 = Date.now();
  const to = RANGE_FROM ? new Date(Math.min((RANGE_TO ?? new Date()).getTime(), Date.now())) : new Date();
  let from = RANGE_FROM ?? new Date(to.getTime() - HOURS * 3600e3);
  if (RANGE_FROM && from >= to) throw new Error(`거슬러 받기 기간이 잘못됐어요: ${process.env.COLLECT_FROM} ~ ${process.env.COLLECT_TO}`);

  const sb = DRY ? null : createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  // 보조 예약(GitHub schedule)은 최근 50분 안에 정상 실행이 있으면 건너뜀 (039: 주 예약은 Supabase pg_cron → workflow_dispatch)
  //  두 예약이 겹쳐도 나라장터 API를 두 번 쓰지 않게. 수동 실행·거슬러 받기·스냅샷은 그대로
  if (sb && process.env.COLLECT_EVENT === 'schedule' && !RANGE_FROM && MODE === 'full') {
    const since = new Date(Date.now() - 50 * 60e3).toISOString();
    const { data: recent } = await sb.from('collect_runs').select('id,started_at,status')
      .gte('started_at', since).in('status', ['ok', 'partial', 'running']).limit(1);
    if (recent?.length) {
      console.log(`최근 50분 안에 수집 실행(${recent[0].started_at}, ${recent[0].status})이 있어 보조 예약은 건너뜀`);
      writeResult({ status: 'skipped', errors: [], summary: '보조 예약 — 최근 실행 있어 건너뜀' });
      return;
    }
  }

  // 빈틈 메우기 — 매시간 수집이 몇 번 실패했으면 마지막으로 성공한 구간 끝부터 받음 (최대 48시간)
  if (sb && !RANGE_FROM && MODE !== 'snapshot') {
    // 공고 저장까지 성공한 실행만 (일부 실패라도 공고 오류가 있으면 제외 — 2026-11-17 DB 장애 때 '일부 실패'가 하나도 저장 못 함)
    const { data: runs } = await sb.from('collect_runs').select('window_to,status,message').in('status', ['ok', 'partial'])
      .order('window_to', { ascending: false }).limit(30);
    const last = (runs ?? []).find((r) => r.status === 'ok' || !/공고\(|공고 보완|스냅샷/.test(r.message ?? ''));
    const end = last?.window_to ? new Date(last.window_to) : null;
    if (end && end < from) {
      from = new Date(Math.max(end.getTime() - 30 * 60e3, to.getTime() - CATCHUP_MAX_H * 3600e3));
      console.log(`지난 수집이 ${ymdhm(end)}까지라 빈틈을 메워요`);
    }
  }
  console.log(`수집 구간 (한국시간): ${ymdhm(from)} ~ ${ymdhm(to)}${RANGE_FROM ? '  [거슬러 받기]' : ''}${DRY ? '  [저장 안 함]' : ''}`);
  if (MODE === 'snapshot') {
    if (!sb) throw new Error('스냅샷은 SUPABASE_SECRET_KEY가 있어야 만들 수 있습니다');
    console.log(`공고 목록 스냅샷: ${await writeSnapshot(sb)}`);
    try { console.log(`사전규격 스냅샷: ${await writePrespecSnapshot(sb)}`); } catch (e) { console.log(`사전규격 스냅샷 건너뜀: ${e.message}`); }
    return;
  }
  // 026(A값·순공사비 열) 실행 여부
  if (sb) hasCostCols = !(await sb.from('notices').select('a_value').limit(1)).error;
  let runId = null;
  if (sb) {
    const { data, error } = await sb.from('collect_runs')
      .insert({ window_from: from.toISOString(), window_to: to.toISOString() }).select('id').single();
    if (error) throw new Error(`수집 기록 생성 실패 (002_collect.sql 실행 여부 확인): ${error.message}`);
    runId = data.id;
  }

  const result = { notices: 0, contracts: 0, errors: [] };
  // 긴 기간(백필)은 하루 단위로 나눠 받음 — API가 긴 조회 기간을 막을 수 있음
  const CHUNK = 24 * 3600e3;
  for (let s = from.getTime(); s < to.getTime(); s += CHUNK) {
    const a = new Date(s), b = new Date(Math.min(s + CHUNK, to.getTime()));
    if (RANGE_FROM && s > from.getTime()) await sleep(Number(process.env.BACKFILL_PAUSE_SEC ?? 30) * 1000); // DB 쉬어 가기
    if (LONG) console.log(`- 구간 ${ymdhm(a)} ~ ${ymdhm(b)}`);
    await collectChunk(sb, a, b, result, (m) => result.errors.push(m));
  }

  // 공고 목록 스냅샷 — 공고 저장 직후에 만들어, 오래 걸리는 투찰 순위 수집을 기다리지 않게
  if (sb) {
    try { result.snapshot = await writeSnapshot(sb); console.log(`공고 목록 스냅샷: ${result.snapshot}`); } catch (e) { result.errors.push(`스냅샷: ${e.message}`); }
    try { console.log(`사전규격 스냅샷: ${await writePrespecSnapshot(sb)}`); }
    catch (e) { if (/recent_prespecs/.test(e.message)) console.log('  사전규격 스냅샷 건너뜀 — SQL 022 실행 필요'); else result.errors.push(`사전규격 스냅샷: ${e.message}`); }
  }

  // 투찰업체 순위 — 구간과 상관없이 아직 받지 않은 개찰완료 공고를 최근 것부터
  if (sb) {
    try { result.bidRows = await collectBidDetails(sb); } catch (e) { result.errors.push(`투찰 순위: ${e.message}`); }
  }

  // 업계 비교 미리 계산 (038, U11) — 회사 확인 회원 중 20시간 넘은 회사만. 실패해도 수집 결과에는 영향 없음
  if (sb && MODE !== 'snapshot') {
    try {
      const { data, error } = await sb.rpc('refresh_peer_cache', { p_max: 20 });
      if (error) throw error;
      console.log(`업계 비교 미리 계산: ${data}곳`);
    } catch (e) {
      if (/refresh_peer_cache/.test(e.message ?? '')) console.log('  업계 비교 미리 계산 건너뜀 — SQL 038 실행 필요');
      else console.log(`  업계 비교 미리 계산 실패(무시): ${e.message}`);
    }
  }

  // 과거분 이어 받기 (043) — 평소 수집(예약·수동)일 때만. 거슬러 받기·스냅샷 실행에서는 안 함
  if (sb && !RANGE_FROM && MODE === 'full') {
    try { result.past = await collectPastDays(sb, T0); } catch (e) { result.past = `과거분 실패: ${e.message.replace('(', ' ')}`; console.log(result.past); }
    try { const lite = await collectLiteDays(sb, T0); if (lite) result.past = [result.past, lite].filter(Boolean).join(' / '); }
    catch (e) { console.log(`공고 과거분 실패: ${e.message}`); }
  }

  // 수집 예약 토큰 만료일 (044) — 30일 전부터 alert.mjs 가 GitHub 이슈로 알림. 실패해도 수집 결과에는 영향 없음
  if (sb && MODE === 'full') {
    try {
      const { data, error } = await sb.rpc('collect_token_expiry');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.expires_at) {
        const days = Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 86400e3);
        result.token = { date: new Date(new Date(row.expires_at).getTime() + 9 * 3600e3).toISOString().slice(0, 10), days, source: row.source };
        console.log(`수집 예약 토큰 만료: ${result.token.date} (D-${days}, ${row.source === 'github' ? 'GitHub 응답' : '저장값'})`);
      }
    } catch (e) {
      if (/collect_token_expiry/.test(e.message ?? '')) console.log('  토큰 만료일 확인 건너뜀 — SQL 044 실행 필요');
      else console.log(`  토큰 만료일 확인 실패(무시): ${e.message}`);
    }
  }

  // 업종 목록: 비어 있으면 바로, 아니면 하루 한 번(한국시간 0시대 실행) 갱신
  try {
    let refresh = DRY || new Date().getUTCHours() === 15;
    if (sb && !refresh) {
      const { count } = await sb.from('industries').select('code', { count: 'exact', head: true });
      refresh = !count;
    }
    if (refresh) {
      const industries = await collectIndustries();
      if (sb) await upsert(sb, 'industries', industries, 'code');
    }
  } catch (e) {
    result.errors.push(`업종: ${e.message}`);
  }

  const status = result.errors.length === 0 ? 'ok' : result.notices + result.contracts === 0 ? 'failed' : 'partial';
  console.log(`결과: ${status} — 공고 ${result.notices}건, 계약 ${result.contracts}건(세부 ${result.lines ?? 0}행), 개찰 ${result.openings ?? 0}건, 투찰 기록 ${result.bidRows ?? 0}행, API 호출 ${apiCalls}회`);
  result.errors.forEach((e) => console.error('  오류:', e));

  if (sb && runId) {
    await sb.from('collect_runs').update({
      finished_at: new Date().toISOString(), status,
      notices_upserted: result.notices, contracts_upserted: result.contracts,
      api_calls: apiCalls, message: [`개찰 ${result.openings ?? 0}건, 투찰 기록 ${result.bidRows ?? 0}행, 사전규격 ${result.prespecs ?? 0}건`, ...result.errors, ...(result.past ? [result.past] : [])].join(' / '),
    }).eq('id', runId);
  }
  // 장애 알림(scripts/alert.mjs)이 읽는 결과
  writeResult({ status, errors: result.errors, token: result.token, summary: `공고 ${result.notices}건, 계약 ${result.contracts}건, 개찰 ${result.openings ?? 0}건, 사전규격 ${result.prespecs ?? 0}건, 투찰 기록 ${result.bidRows ?? 0}행, API 호출 ${apiCalls}회` });
  if (status === 'failed') process.exit(1);
}

function writeResult(r) {
  try { writeFileSync('collect-result.json', JSON.stringify({ ...r, window: RANGE_FROM ? `${process.env.COLLECT_FROM} ~ ${process.env.COLLECT_TO || '오늘'}` : `최근 ${HOURS}시간` })); } catch { /* 알림용 파일이라 실패해도 무시 */ }
}

main().catch((e) => {
  console.error('수집 실패:', e.message);
  writeResult({ status: 'crashed', errors: [e.message], summary: '수집이 중간에 멈췄어요' });
  process.exit(1);
});
