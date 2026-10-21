/* =========================================================
 * 입찰나침반 프로토타입 — 공통 데이터 · 컴포넌트 · 유틸
 * 모든 데이터는 화면 흐름 확인용 더미 데이터입니다.
 * ========================================================= */

// 프로토타입 기준일 (D-day 계산 기준)
const TODAY = new Date(2026, 9, 21);

const COMPANY = {
  name: '(주)테스트전자',
  ceo: '김희규',
  bizNo: '123-45-67890',
  industry: '제조업 / 전자부품',
  address: '서울특별시 강남구',
  email: 'contact@testelec.co.kr',
};

const DEFAULT_PROFILE = {
  types: ['물품', '용역'],
  industry: ['제조업', '전자부품', '기타 전자부품'],
  regions: ['서울', '경기'],
  priceMin: 50000000,
  priceMax: 500000000,
  licenses: ['직접생산확인증명', 'ISO 9001'],
  records: '',
};

// 공고 더미 데이터 10건
// reasons: 매칭 사유 / regionLimit: 참가 지역제한(null=제한 없음) / posted: 게시 후 경과일
const BIDS = [
  { id: 1, type: '물품', title: '사무용 컴퓨터 구매', org: '조달청', price: 120000000, d: 5, match: 92,
    region: '서울', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261021-0047',
    period: '계약 후 30일', license: null, posted: 0,
    reasons: ['업종 일치', '지역 일치', '가격대 일치'] },
  { id: 2, type: '용역', title: '정보시스템 유지보수', org: '서울시 교육청', price: 85000000, d: 3, match: 87,
    region: '서울', regionLimit: '서울', law: '지방계약법', award: '적격심사', no: '20261020-0312',
    period: '계약 후 12개월', license: '소프트웨어사업자 신고', posted: 1,
    reasons: ['업종 일치', '지역 일치', '가격대 일치'] },
  { id: 3, type: '물품', title: 'LED 조명기구 납품', org: '국방부', price: 340000000, d: 7, match: 83,
    region: '경기', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261019-1185',
    period: '계약 후 60일', license: null, posted: 2,
    reasons: ['업종 일치', '가격대 일치', '실적 충족'] },
  { id: 4, type: '용역', title: '홈페이지 재구축', org: '한국수자원공사', price: 210000000, d: 12, match: 78,
    region: '대전', regionLimit: null, law: '국가계약법', lawNote: '공기업·준정부기관 계약사무규칙', award: '협상에 의한 계약', no: '20261018-0921',
    period: '계약 후 6개월', license: '소프트웨어사업자 신고', posted: 3,
    reasons: ['업종 일치', '가격대 일치'] },
  { id: 5, type: '물품', title: '사무가구 구매', org: '경기도청', price: 56000000, d: 2, match: 72,
    region: '경기', regionLimit: '경기', law: '지방계약법', award: '적격심사', no: '20261020-0558',
    period: '계약 후 20일', license: null, posted: 1,
    reasons: ['지역 일치', '가격대 일치', '실적 충족'] },
  { id: 6, type: '용역', title: '보안관제 서비스', org: '한국전력공사', price: 480000000, d: 15, match: 68,
    region: '전남', regionLimit: null, law: '국가계약법', lawNote: '공기업·준정부기관 계약사무규칙', award: '적격심사', no: '20261017-2043',
    period: '계약 후 24개월', license: '정보보호전문서비스기업 지정', posted: 4,
    reasons: ['가격대 일치'] },
  { id: 7, type: '물품', title: '의료기기 소모품', org: '국립중앙의료원', price: 92000000, d: 4, match: 65,
    region: '서울', regionLimit: null, law: '국가계약법', award: '적격심사', no: '20261020-0077',
    period: '계약 후 14일', license: '의료기기 판매업 신고', posted: 1,
    reasons: ['지역 일치', '가격대 일치'] },
  { id: 8, type: '공사', title: '청사 리모델링', org: '강남구청', price: 730000000, d: 20, match: 55,
    region: '서울', regionLimit: '서울', law: '지방계약법', award: '적격심사', no: '20261016-0430',
    period: '착공 후 120일', license: '실내건축공사업 등록', posted: 5,
    reasons: ['지역 일치'] },
  { id: 9, type: '용역', title: '클라우드 인프라 구축', org: '과학기술정보통신부', price: 1500000000, d: 8, match: 52,
    region: '세종', regionLimit: null, law: '국가계약법', award: '협상에 의한 계약', no: '20261015-1402',
    period: '계약 후 10개월', license: '소프트웨어사업자 신고', posted: 6,
    reasons: ['업종 일치'] },
  { id: 10, type: '물품', title: '네트워크 장비 교체', org: '관세청', price: 270000000, d: 6, match: 48,
    region: '인천', regionLimit: '인천', law: '국가계약법', award: '적격심사', no: '20261019-0815',
    period: '계약 후 45일', license: null, posted: 2,
    reasons: ['가격대 일치'] },
];

const getBid = (id) => BIDS.find((b) => b.id === Number(id)) || BIDS[0];

const REGIONS = ['서울', '경기', '인천', '강원', '대전', '세종', '충북', '충남', '대구', '경북', '부산', '울산', '경남', '광주', '전북', '전남', '제주'];

// 업종 분류 (대분류 > 중분류 > 세분류) — 더미 분류
const INDUSTRY = {
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
const PRICE_STEPS = [10e6, 30e6, 50e6, 1e8, 2e8, 3e8, 5e8, 7e8, 10e8, 20e8, 30e8, 50e8];

/* ---------- 저장소 (localStorage 실패 시에도 동작) ---------- */
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('bc:' + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('bc:' + key, JSON.stringify(value)); } catch (e) { /* noop */ }
  },
};

const getProfile = () => ({ ...DEFAULT_PROFILE, ...store.get('profile', {}) });
const setProfile = (p) => store.set('profile', p);
const getSaved = () => store.get('saved', [3, 6, 7]);
const setSaved = (ids) => store.set('saved', ids);

/* ---------- 포맷 ---------- */
const fmtWon = (n) => Math.round(n).toLocaleString('ko-KR') + '원';
const fmtNum = (n) => Math.round(n).toLocaleString('ko-KR');

// 1.2억 / 8,500만 / 15억
function fmtShort(n) {
  if (n >= 1e8) return parseFloat((n / 1e8).toFixed(1)) + '억';
  return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
}

// 범위 슬라이더 라벨: 1천만원 / 5억원 / 50억원
function fmtRange(n) {
  if (n >= 1e8) return parseFloat((n / 1e8).toFixed(1)) + '억원';
  if (n >= 1e7) return n / 1e7 + '천만원';
  return fmtShort(n) + '원';
}

function deadlineOf(d) {
  const dt = new Date(TODAY);
  dt.setDate(dt.getDate() + d);
  return dt;
}
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (dt) => `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())}`;

const qs = (key) => new URLSearchParams(location.search).get(key);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- 배지 · 태그 ---------- */
const TYPE_CLASS = {
  '물품': 'bg-blue-50 text-blue-700 ring-blue-200',
  '용역': 'bg-purple-50 text-purple-700 ring-purple-200',
  '공사': 'bg-orange-50 text-orange-700 ring-orange-200',
};

const typeTag = (t) =>
  `<span class="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TYPE_CLASS[t]}">${t}</span>`;

const ddayBadge = (d) =>
  `<span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${d <= 3 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600'}">D-${d}</span>`;

const matchBadge = (m, size = 'sm') =>
  size === 'lg'
    ? `<span class="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-700"><i data-lucide="target" class="h-4 w-4"></i>매칭 ${m}%</span>`
    : `<span class="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">매칭 ${m}%</span>`;

/* ---------- 공고 카드 (리스트 공통) ---------- */
function bidCard(b) {
  return `
  <a href="bid-detail.html?id=${b.id}" data-id="${b.id}"
     class="block rounded-card border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md active:scale-[.99]">
    <div class="mb-2 flex items-center justify-between">
      ${typeTag(b.type)}
      <span class="text-[11px] text-slate-400">${b.no}</span>
    </div>
    <h3 class="truncate text-[15px] font-bold text-slate-800">${esc(b.title)}</h3>
    <p class="mt-0.5 text-sm text-slate-500">${esc(b.org)}</p>
    <div class="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
      <span class="text-sm font-semibold text-slate-700">${fmtShort(b.price)}<span class="ml-0.5 text-xs font-normal text-slate-400">원</span></span>
      <div class="flex items-center gap-1.5">${ddayBadge(b.d)}${matchBadge(b.match)}</div>
    </div>
  </a>`;
}

/* ---------- 상단 헤더 ---------- */
function renderHeader(el = document.getElementById('header')) {
  if (!el) return;
  el.innerHTML = `
  <header class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur">
    <a href="index.html" class="flex items-center gap-1.5">
      <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white"><i data-lucide="compass" class="h-5 w-5"></i></span>
      <span class="text-[17px] font-extrabold tracking-tight text-slate-800">입찰나침반</span>
    </a>
    <a href="mypage.html" aria-label="마이페이지" class="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
      <i data-lucide="circle-user-round" class="h-6 w-6"></i>
    </a>
  </header>`;
}

// 뒤로가기형 서브 헤더
function renderBackHeader(title, el = document.getElementById('header')) {
  if (!el) return;
  el.innerHTML = `
  <header class="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-2 backdrop-blur">
    <button type="button" onclick="history.length > 1 ? history.back() : (location.href='bid-list.html')" aria-label="뒤로가기"
      class="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100">
      <i data-lucide="arrow-left" class="h-5 w-5"></i>
    </button>
    <span class="truncate text-base font-bold">${esc(title)}</span>
    <a href="mypage.html" aria-label="마이페이지" class="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
      <i data-lucide="circle-user-round" class="h-6 w-6"></i>
    </a>
  </header>`;
}

/* ---------- 하단 네비게이션 ---------- */
const NAV = [
  { key: 'home', label: '홈', href: 'index.html', icon: 'house' },
  { key: 'bids', label: '공고', href: 'bid-list.html', icon: 'file-text' },
  { key: 'recommend', label: '추천', href: 'recommend.html', icon: 'sparkles' },
  { key: 'tools', label: '도구', href: 'calculator.html', icon: 'calculator' },
];

function renderNav(active, el = document.getElementById('bottom-nav')) {
  if (!el) return;
  el.innerHTML = `
  <nav class="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
    <ul class="grid grid-cols-4">
      ${NAV.map((n) => {
        const on = n.key === active;
        return `<li><a href="${n.href}" ${on ? 'aria-current="page"' : ''}
          class="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}">
          <i data-lucide="${n.icon}" class="h-6 w-6 ${on ? 'fill-blue-100' : ''}" stroke-width="${on ? 2.4 : 2}"></i>${n.label}</a></li>`;
      }).join('')}
    </ul>
  </nav>`;
}

/* ---------- 아이콘 ---------- */
function icons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ---------- 토스트 ---------- */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast pointer-events-none fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[90%] translate-y-2 rounded-full bg-slate-900/90 px-4 py-2.5 text-sm font-medium text-white opacity-0 shadow-md';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.remove('opacity-0', 'translate-y-2'));
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('opacity-0', 'translate-y-2'), 1800);
}

/* ---------- 바텀시트 모달 ---------- */
function openSheet(title, bodyHtml, { onMount, footer } = {}) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.id = 'sheet';
  wrap.className = 'fixed inset-0 z-50';
  wrap.innerHTML = `
    <div class="sheet-backdrop absolute inset-0 bg-slate-900/40 opacity-0" data-close></div>
    <div class="sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-h-[88vh] max-w-[480px] translate-y-full flex-col rounded-t-2xl bg-white shadow-md" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 class="text-base font-bold">${esc(title)}</h2>
        <button type="button" data-close aria-label="닫기" class="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"><i data-lucide="x" class="h-5 w-5"></i></button>
      </div>
      <div class="overflow-y-auto px-4 py-4">${bodyHtml}</div>
      ${footer ? `<div class="border-t border-slate-100 p-4">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  document.body.style.overflow = 'hidden';
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeSheet));
  icons();
  requestAnimationFrame(() => {
    wrap.querySelector('.sheet-backdrop').classList.remove('opacity-0');
    wrap.querySelector('.sheet-panel').classList.remove('translate-y-full');
  });
  if (onMount) onMount(wrap);
  return wrap;
}

function closeSheet() {
  const el = document.getElementById('sheet');
  if (!el) return;
  el.remove();
  document.body.style.overflow = '';
}

/* ---------- 입력 마스크: 사업자등록번호 XXX-XX-XXXXX ---------- */
function maskBizNo(input) {
  input.addEventListener('input', () => {
    const v = input.value.replace(/\D/g, '').slice(0, 10);
    let out = v;
    if (v.length > 5) out = `${v.slice(0, 3)}-${v.slice(3, 5)}-${v.slice(5)}`;
    else if (v.length > 3) out = `${v.slice(0, 3)}-${v.slice(3)}`;
    input.value = out;
  });
}

/* ---------- 듀얼 슬라이더 (가격 범위) ---------- */
function mountDualRange(root, { min, max, onChange }) {
  const last = PRICE_STEPS.length - 1;
  const idxOf = (v) => Math.max(0, PRICE_STEPS.findIndex((s) => s >= v));
  root.innerHTML = `
    <div class="mb-3 flex items-baseline justify-between">
      <span class="text-lg font-bold text-primary" data-label></span>
    </div>
    <div class="dual-range">
      <div class="track"></div><div class="fill"></div>
      <input type="range" min="0" max="${last}" step="1" aria-label="최소 금액" data-lo>
      <input type="range" min="0" max="${last}" step="1" aria-label="최대 금액" data-hi>
    </div>
    <div class="mt-2 flex justify-between text-[11px] text-slate-400"><span>1천만원</span><span>50억원</span></div>`;
  const lo = root.querySelector('[data-lo]');
  const hi = root.querySelector('[data-hi]');
  const fill = root.querySelector('.fill');
  const label = root.querySelector('[data-label]');
  lo.value = idxOf(min);
  hi.value = idxOf(max);
  const update = (src) => {
    if (+lo.value > +hi.value) {
      if (src === lo) lo.value = hi.value; else hi.value = lo.value;
    }
    fill.style.left = (lo.value / last) * 100 + '%';
    fill.style.width = ((hi.value - lo.value) / last) * 100 + '%';
    const a = PRICE_STEPS[lo.value], b = PRICE_STEPS[hi.value];
    label.textContent = `${fmtRange(a)} ~ ${fmtRange(b)}`;
    if (onChange) onChange(a, b);
  };
  lo.addEventListener('input', () => update(lo));
  hi.addEventListener('input', () => update(hi));
  update();
  return { get: () => [PRICE_STEPS[lo.value], PRICE_STEPS[hi.value]] };
}

/* ---------- 지역 다중선택 칩 ---------- */
function chipClass(on) {
  return on
    ? 'border-primary bg-primary text-white'
    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';
}

function mountRegionChips(root, selected) {
  const set = new Set(selected);
  const draw = () => {
    root.innerHTML = REGIONS.map((r) =>
      `<button type="button" data-r="${r}" aria-pressed="${set.has(r)}"
        class="rounded-full border px-3 py-1.5 text-sm font-medium transition ${chipClass(set.has(r))}">${r}</button>`).join('');
  };
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    const r = b.dataset.r;
    set.has(r) ? set.delete(r) : set.add(r);
    draw();
  });
  draw();
  return { get: () => REGIONS.filter((r) => set.has(r)) };
}

// 폼 공통 클래스
const INPUT_CLS = 'w-full rounded-btn border border-slate-200 bg-white px-3.5 py-3 text-[15px] placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-blue-100';
const BTN_PRIMARY = 'flex w-full items-center justify-center gap-2 rounded-btn bg-primary px-4 py-3.5 text-[15px] font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[.99] disabled:bg-slate-300';
const BTN_OUTLINE = 'flex w-full items-center justify-center gap-2 rounded-btn border border-primary bg-white px-4 py-3.5 text-[15px] font-bold text-primary transition hover:bg-blue-50 active:scale-[.99]';
