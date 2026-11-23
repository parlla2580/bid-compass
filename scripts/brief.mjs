// =========================================================
// 일일 수집 브리핑 (045·046, 2026-11-22) — 매일 09:00(한국시간) 데이터별 기간·건수·용량 + 이슈
//  · Supabase ops_daily_brief() 집계 → GitHub 이슈 'daily-brief' 에 댓글 (저장소 알림으로 메일·앱 알림)
//  · 같은 날 이미 올렸으면 건너뜀 (pg_cron 주 예약 + GitHub schedule 보조 예약이 겹쳐도 한 번만). 수동 실행에서 FORCE=1 이면 다시 올림
// 환경변수: SUPABASE_URL, SUPABASE_SECRET_KEY, GH_TOKEN, GITHUB_REPOSITORY, RUN_URL, FORCE, GITHUB_STEP_SUMMARY
// =========================================================
import { createClient } from '@supabase/supabase-js';
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const LABEL = 'daily-brief';
const PLAN_BYTES = 8 * 1024 ** 3; // Pro 요금제 포함 디스크 8GB
const repo = process.env.GITHUB_REPOSITORY;
const gh = (...args) => execFileSync('gh', [...args, '--repo', repo], { encoding: 'utf8' }).trim();

const NAMES = [
  ['notices', '공고'], ['openings', '개찰'], ['bid_results', '투찰 순위'],
  ['contracts', '계약'], ['contract_lines', '계약 세부'], ['prespecs', '사전규격'],
];
const num = (n) => (n == null ? '–' : Number(n).toLocaleString('ko-KR'));
const size = (b) => (b == null ? '–' : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.round(b / 1024 ** 2).toLocaleString('ko-KR')} MB`);
const delta = (a, b) => (a == null || b == null ? '' : a - b === 0 ? '0' : `${a - b > 0 ? '+' : '−'}${Math.abs(a - b).toLocaleString('ko-KR')}`);
const dayDiff = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400e3);

export function render(d) {
  const p = d.prev ?? null;
  const wd = new Intl.DateTimeFormat('ko-KR', { weekday: 'short', timeZone: 'Asia/Seoul' }).format(new Date(`${d.day}T12:00:00+09:00`));
  const L = [`<!-- brief:${d.day} -->`, `## 📊 수집 브리핑 · ${d.day} (${wd})`, ''];
  L.push('| 데이터 | 기간 | 건수 | 전날 대비 | 용량 |', '|---|---|--:|--:|--:|');
  for (const [k, name] of NAMES) {
    const t = d.tables?.[k]; if (!t) continue;
    const pt = p?.tables?.[k];
    const range = t.from ? `${t.from} ~ ${t.to}` : '–';
    L.push(`| ${name} | ${range} | ${num(t.rows)}${t.estimate ? ' (추정)' : ''} | ${delta(t.rows, pt?.rows)} | ${size(t.bytes)} |`);
  }
  const pct = d.db_bytes ? Math.round((d.db_bytes / PLAN_BYTES) * 100) : null;
  L.push('', `- **DB 전체** ${size(d.db_bytes)} · 포함 8 GB의 ${pct}%${p?.db_bytes ? ` · 전날 대비 ${d.db_bytes >= p.db_bytes ? '+' : '−'}${size(Math.abs(d.db_bytes - p.db_bytes))}` : ''}`);

  const r = d.runs ?? {};
  L.push(`- **수집 실행 (24시간)** ${num(r.total)}회 · 정상 ${num(r.ok)} · 일부 실패 ${num(r.partial)} · 실패 ${num(r.failed)} · 최대 공백 ${r.max_gap_min ?? '–'}분 · API 호출 ${num(r.api_calls)}`);
  const op = d.tables?.openings, pop = p?.tables?.openings;
  if (op?.pending != null) L.push(`- **투찰 순위 대기** ${num(op.pending)}건${pop?.pending != null ? ` (전날 대비 ${delta(op.pending, pop.pending)})` : ''}`);

  const b = d.backfill;
  let done = null;
  if (b) {
    const left = Math.max(0, dayDiff(b.next_day, b.stop_day) + 1);
    done = p?.backfill?.next_day ? dayDiff(p.backfill.next_day, b.next_day) : null;
    const eta = done > 0 && left > 0 ? new Date(Date.parse(`${d.day}T00:00:00Z`) + Math.ceil(left / done) * 86400e3).toISOString().slice(0, 10) : null;
    L.push(left > 0
      ? `- **과거분 받기** 다음 ${b.next_day} · 남은 ${num(left)}일${done != null ? ` · 어제 ${done}일 받음` : ''}${eta ? ` · 예상 완료 ${eta}` : ''}`
      : '- **과거분 받기** 완료');
  }

  // 이슈
  const I = [];
  if (d.stale) I.push(`오늘 집계 없음 — ${d.stale} 집계로 표시 (DB 예약 brief-snapshot 확인)`);
  if (r.failed) I.push(`수집 실패 ${r.failed}회 — ${(r.errors?.[0] ?? '').slice(0, 160)}`);
  if (r.partial) I.push(`일부 실패 ${r.partial}회 — ${(r.errors?.find(Boolean) ?? '').slice(0, 160)}`);
  if (r.total != null && r.total < 20) I.push(`매시 수집 ${r.total}회 (기대 24회) — 예약 점검: select * from public.collect_trigger_log();`);
  else if (r.max_gap_min > 120) I.push(`수집 공백 최대 ${r.max_gap_min}분`);
  if (r.running > 1) I.push(`끝나지 않은 실행 기록 ${r.running}건 (중단·시간 초과)`);
  if (d.trigger?.bad) I.push(`수집 예약 요청 실패 ${d.trigger.bad}/${d.trigger.total}건 (6시간) — GitHub 응답 확인`);
  if (pct != null && pct >= 80) I.push(`DB 용량 ${pct}% — 8 GB 넘으면 GB당 월 $0.125`);
  if (b?.fails) I.push(`과거분 ${b.next_day} 재시도 중 (${b.fails}회 실패)`);
  if (b?.skipped?.length) I.push(`과거분 건너뛴 날 ${b.skipped.length}일: ${b.skipped.slice(-5).join(', ')}`);
  if (b && done === 0 && dayDiff(b.next_day, b.stop_day) >= 0) I.push('과거분 진행 없음 (어제 0일)');
  if (op?.pending != null && pop?.pending != null && op.pending - pop.pending > 3000) I.push(`투찰 순위 대기 ${num(op.pending - pop.pending)}건 증가`);
  const nTo = d.tables?.notices?.to;
  if (nTo && dayDiff(d.day, nTo) > 1) I.push(`공고 최근 날짜 ${nTo} (${dayDiff(d.day, nTo)}일 전) — 수집 멈춤 의심`);
  if (d.token?.expires_at) {
    const left = Math.floor((Date.parse(d.token.expires_at) - Date.now()) / 86400e3);
    if (left <= 30) I.push(`수집 예약 토큰 만료 D-${left}`);
  }
  L.push('', '### 이슈', ...(I.length ? I.map((x) => `- ⚠️ ${x}`) : ['- ✅ 없음']));
  if (!p) L.push('', '<sub>전날 기록이 없어 증가량은 내일부터 표시</sub>');
  return { md: L.join('\n'), issues: I.length };
}

async function main() {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  // 집계는 DB 예약 작업(046, 08:50)이 해 둠 — 여기서는 저장된 결과만 읽음 (API 시간 제한 때문)
  const { data, error } = await sb.rpc('ops_brief_latest');
  if (error) throw new Error(`집계 결과 읽기 실패 (SQL 045·046 실행 여부 확인): ${error.message}`);
  if (!data) throw new Error('저장된 집계 없음 — 046 실행 뒤 1~2분 기다리거나 08:50 집계를 기다려 주세요');
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  if (data.day !== today) data.stale = data.day;
  const { md, issues } = render(data);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  if (!repo) return;

  const list = JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '1') || '[]');
  let n = list[0]?.number;
  if (!n) {
    try { gh('label', 'create', LABEL, '--color', '0E8A16', '--description', '일일 수집 브리핑'); } catch { /* 이미 있음 */ }
    const url = gh('issue', 'create', '--title', '📊 일일 수집 브리핑', '--label', LABEL, '--body',
      '매일 09:00(한국시간) 데이터별 기간·건수·용량과 이슈를 댓글로 올립니다. 이 이슈를 닫지 말아 주세요 (닫으면 새 이슈가 생김).');
    n = Number(url.split('/').pop());
  }
  if (process.env.FORCE !== '1') {
    const comments = JSON.parse(gh('issue', 'view', String(n), '--json', 'comments') || '{}').comments ?? [];
    if (comments.slice(-5).some((c) => (c.body ?? '').includes(`<!-- brief:${data.day} -->`))) { console.log(`${data.day} 브리핑은 이미 올림 — 건너뜀`); return; }
  }
  gh('issue', 'comment', String(n), '--body', `${md}\n\n<sub>[실행 기록](${process.env.RUN_URL ?? ''}) · 이슈 ${issues}건</sub>`);
  console.log(`이슈 #${n}에 브리핑을 올렸어요`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((e) => { console.error('브리핑 실패:', e.message); process.exit(1); });
}
