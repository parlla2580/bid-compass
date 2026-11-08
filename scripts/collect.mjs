// =========================================================
// 나라장터 공고·계약 수집 (GitHub Actions에서 주기 실행)
//
// 환경변수
//   NARA_API_KEY          공공데이터포털 일반 인증키
//   SUPABASE_URL          Supabase 프로젝트 주소
//   SUPABASE_SECRET_KEY   Supabase 관리자 키 (sb_secret_...) — 없으면 저장하지 않고 결과만 출력
//   COLLECT_HOURS         수집 구간(시간, 기본 6) — 등록일시 기준
//
// 실행: node scripts/collect.mjs [--dry]
// 실행 결과는 Supabase collect_runs 테이블에 기록됩니다.
// =========================================================
import { createClient } from '@supabase/supabase-js';

const KEY = process.env.NARA_API_KEY;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const HOURS = Number(process.env.COLLECT_HOURS || 6);
const DRY = process.argv.includes('--dry') || !SB_KEY;

const BID = 'https://apis.data.go.kr/1230000/ad/BidPublicInfoService02';
const CNT = 'https://apis.data.go.kr/1230000/ao/CntrctInfoService';
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

async function fetchAll(base, params) {
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ serviceKey: KEY, pageNo: page, numOfRows: ROWS, type: 'json', ...params });
    const body = await call(`${base}?${qs}`);
    const items = body.items ?? [];
    out.push(...(Array.isArray(items) ? items : items.item ? [].concat(items.item) : []));
    if (out.length >= Number(body.totalCount ?? 0) || !items.length) break;
  }
  return out;
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
  for (const t of TYPES) {
    const [items, bases] = await Promise.all([
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}02`, period),
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}BsisAmount02`, period).catch(() => []),
    ]);
    const baseMap = new Map(bases.map((b) => [b.bidNtceNo, b]));
    for (const it of items) {
      const k = key(it);
      const base = baseMap.get(it.bidNtceNo);
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
        est_price: num(it.presmptPrce) ?? 0,
        base_price: num(base?.bssamt),
        reserve_rate_min: num(base?.rsrvtnPrceRngBgnRate),
        reserve_rate_max: num(base?.rsrvtnPrceRngEndRate),
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
  // 같은 공고번호·차수가 여러 번 나오면 마지막 것만
  return [...new Map(rows.map((r) => [`${r.bid_no}-${r.bid_ord}`, r])).values()];
}

/* ---------- 계약 ---------- */
// corpList 예: [1^주계약업체^단독^부천문구마트^김재욱^대한민국^100^부천문구마트^^2224600379]
function parseCorps(s) {
  return (s ?? '').match(/\[[^\]]*\]/g)?.map((x) => {
    const f = x.slice(1, -1).split('^');
    return { role: f[1] || null, kind: f[2] || null, name: f[3] || null, ceo: f[4] || null, share: num(f[6]), bizno: f[9] || null };
  }) ?? [];
}

async function collectContracts(from, to) {
  const period = { inqryDiv: '1', inqryBgnDt: ymdhm(from), inqryEndDt: ymdhm(to) };
  const rows = [];
  for (const t of TYPES) {
    const items = await fetchAll(`${CNT}/getCntrctInfoList${t.cnt}`, period);
    for (const it of items) {
      const corps = parseCorps(it.corpList);
      rows.push({
        id: it.untyCntrctNo,
        bid_type: t.name,
        title: it.cntrctNm || '(계약명 없음)',
        org: it.cntrctInsttNm || null,
        org_code: it.cntrctInsttCd || null,
        org_kind: it.cntrctInsttJrsdctnDivNm || null,
        method: it.cntrctCnclsMthdNm || null,
        base_law: it.baseLawNm || null,
        base_detail: it.baseDtls || null,
        amount: num(it.thtmCntrctAmt),
        total_amount: num(it.totCntrctAmt),
        contract_date: it.cntrctCnclsDate || it.cntrctDate || null,
        notice_no: it.ntceNo || null,
        corps,
        corp_biznos: corps.map((c) => c.bizno).filter(Boolean),
        detail_url: it.cntrctDtlInfoUrl || null,
        raw: it,
        registered_at: kstIso(it.rgstDt),
        collected_at: new Date().toISOString(),
      });
    }
    console.log(`  계약 ${t.name}: ${items.length}건`);
  }
  return [...new Map(rows.map((r) => [r.id, r])).values()];
}

/* ---------- 저장 ---------- */
async function upsert(sb, table, rows, onConflict) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) throw new Error(`${table} 저장 실패: ${error.message}`);
  }
}

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - HOURS * 3600e3);
  console.log(`수집 구간 (한국시간): ${ymdhm(from)} ~ ${ymdhm(to)}${DRY ? '  [저장 안 함]' : ''}`);

  const sb = DRY ? null : createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  let runId = null;
  if (sb) {
    const { data, error } = await sb.from('collect_runs')
      .insert({ window_from: from.toISOString(), window_to: to.toISOString() }).select('id').single();
    if (error) throw new Error(`수집 기록 생성 실패 (002_collect.sql 실행 여부 확인): ${error.message}`);
    runId = data.id;
  }

  const result = { notices: 0, contracts: 0, errors: [] };
  try {
    const notices = await collectNotices(from, to);
    result.notices = notices.length;
    if (sb) await upsert(sb, 'notices', notices, 'bid_no,bid_ord');
  } catch (e) {
    result.errors.push(`공고: ${e.message}`);
  }
  try {
    const contracts = await collectContracts(from, to);
    result.contracts = contracts.length;
    if (sb) await upsert(sb, 'contracts', contracts, 'id');
  } catch (e) {
    result.errors.push(`계약: ${e.message}`);
  }

  const status = result.errors.length === 0 ? 'ok' : result.errors.length === 2 ? 'failed' : 'partial';
  console.log(`결과: ${status} — 공고 ${result.notices}건, 계약 ${result.contracts}건, API 호출 ${apiCalls}회`);
  result.errors.forEach((e) => console.error('  오류:', e));

  if (sb && runId) {
    await sb.from('collect_runs').update({
      finished_at: new Date().toISOString(), status,
      notices_upserted: result.notices, contracts_upserted: result.contracts,
      api_calls: apiCalls, message: result.errors.join(' / ') || null,
    }).eq('id', runId);
  }
  if (status === 'failed') process.exit(1);
}

main().catch((e) => {
  console.error('수집 실패:', e.message);
  process.exit(1);
});
