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
const SCS = 'https://apis.data.go.kr/1230000/as/ScsbidInfoService';
// 개찰순위 상세 조회는 공고번호마다 1회 — 낙찰정보서비스 운영계정 전환(2026-11-09) 후 상한 상향
// 실행 8회/일 × 1,500 = 최대 12,000회/일 (운영계정 하루 최대 10만 건 안)
const DETAIL_CAP = Number(process.env.BID_DETAIL_CAP || 1500);
const DETAIL_PARALLEL = 4;
const DETAIL_TIME_LIMIT = 100 * 60e3; // 실행 시간 제한(150분) 안에서 여유 있게 멈춤
const IND = 'https://apis.data.go.kr/1230000/ao/IndstrytyBaseLawrgltInfoService/getIndstrytyBaseLawrgltInfoList';
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
  const allBases = [];
  for (const t of TYPES) {
    const [items, bases] = await Promise.all([
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}02`, period),
      fetchAll(`${BID}/getBidPblancListInfo${t.bid}BsisAmount02`, period).catch(() => []),
    ]);
    allBases.push(...bases);
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
        est_price: won(it.presmptPrce) ?? 0,
        base_price: won(base?.bssamt),
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
      match: { bid_no: b.bidNtceNo },
      set: { base_price: won(b.bssamt), reserve_rate_min: num(b.rsrvtnPrceRngBgnRate), reserve_rate_max: num(b.rsrvtnPrceRngEndRate) },
    });
  }

  // 같은 공고번호·차수가 여러 번 나오면 마지막 것만. 이미 마감된 공고는 저장하지 않음 (백필 시 용량 절약)
  const now = Date.now();
  const unique = [...new Map(rows.map((r) => [`${r.bid_no}-${r.bid_ord}`, r])).values()];
  const open = unique.filter((r) => new Date(r.closes_at).getTime() >= now);
  if (open.length < unique.length) console.log(`  이미 마감된 공고 ${unique.length - open.length}건 제외`);
  return { rows: open, updates };
}

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
      const detailUrl = it.cntrctDtlInfoUrl || null;
      rows.push({
        id: it.untyCntrctNo,
        // 나라장터 계약번호 — 같은 계약이 통합계약번호만 다르게 재등록되는 경우가 있어 이 값으로 한 건만 저장
        contract_no: /ctrtNo=([^&]+)/.exec(detailUrl ?? '')?.[1] ?? it.untyCntrctNo,
        bid_type: t.name,
        title: it.cntrctNm || '(계약명 없음)',
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
  return [...new Map(rows.map((r) => [r.contract_no, r])).values()];
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
  const { data: rest, error } = await pick(sb.from('openings').select('id,bid_no,bid_ord,clsfc_no,rbid_no'))
    .order('opened_at', { ascending: false }).limit(DETAIL_CAP);
  if (error) throw new Error(`개찰 대기 목록 조회 실패: ${error.message}`);

  // 같은 공고번호(차수·분류·재입찰이 다른 개찰)는 한 번 조회로 함께 채움
  const groups = new Map();
  for (const o of [...first, ...(rest ?? [])]) {
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
  // 긴 기간(백필)은 하루 단위로 나눠 받음 — API가 긴 조회 기간을 막을 수 있음
  const CHUNK = 24 * 3600e3;
  for (let s = from.getTime(); s < to.getTime(); s += CHUNK) {
    const a = new Date(s), b = new Date(Math.min(s + CHUNK, to.getTime()));
    if (HOURS > 24) console.log(`- 구간 ${ymdhm(a)} ~ ${ymdhm(b)}`);
    try {
      const { rows: notices, updates } = await collectNotices(a, b);
      result.notices += notices.length;
      if (sb) {
        await upsert(sb, 'notices', notices, 'bid_no,bid_ord');
        const patched = await applyUpdates(sb, updates);
        console.log(`  늦게 온 정보 ${updates.length}건 중 ${patched}건을 기존 공고에 반영`);
      }
    } catch (e) {
      result.errors.push(`공고(${ymdhm(a)}): ${e.message}`);
    }
    try {
      const openings = await collectOpenings(a, b);
      result.openings = (result.openings ?? 0) + openings.length;
      if (sb) await upsert(sb, 'openings', openings, 'bid_no,bid_ord,clsfc_no,rbid_no');
    } catch (e) {
      result.errors.push(`개찰(${ymdhm(a)}): ${e.message}`);
    }
    try {
      const contracts = await collectContracts(a, b);
      result.contracts += contracts.length;
      if (sb) {
        try {
          await upsert(sb, 'contracts', contracts, 'contract_no');
        } catch (e) {
          // 005 SQL 실행 전(계약번호 칸 없음)에는 예전 방식으로 저장 — 중복은 걸러진 상태
          if (!/contract_no/.test(e.message)) throw e;
          await upsert(sb, 'contracts', contracts.map(({ contract_no, ...r }) => r), 'id');
        }
      }
    } catch (e) {
      result.errors.push(`계약(${ymdhm(a)}): ${e.message}`);
    }
  }

  // 투찰업체 순위 — 구간과 상관없이 아직 받지 않은 개찰완료 공고를 최근 것부터
  if (sb) {
    try { result.bidRows = await collectBidDetails(sb); } catch (e) { result.errors.push(`투찰 순위: ${e.message}`); }
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
  console.log(`결과: ${status} — 공고 ${result.notices}건, 계약 ${result.contracts}건, 개찰 ${result.openings ?? 0}건, 투찰 기록 ${result.bidRows ?? 0}행, API 호출 ${apiCalls}회`);
  result.errors.forEach((e) => console.error('  오류:', e));

  if (sb && runId) {
    await sb.from('collect_runs').update({
      finished_at: new Date().toISOString(), status,
      notices_upserted: result.notices, contracts_upserted: result.contracts,
      api_calls: apiCalls, message: [`개찰 ${result.openings ?? 0}건, 투찰 기록 ${result.bidRows ?? 0}행`, ...result.errors].join(' / '),
    }).eq('id', runId);
  }
  if (status === 'failed') process.exit(1);
}

main().catch((e) => {
  console.error('수집 실패:', e.message);
  process.exit(1);
});
