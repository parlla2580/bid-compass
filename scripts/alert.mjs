// =========================================================
// 장애 알림 — 수집이 실패하면 GitHub 이슈로 알림 (저장소를 지켜보는 사람에게 메일·앱 알림)
//  · 실패(failed)·중단(crashed)·작업 자체 실패 → 알림
//  · 일부 실패(partial) → 일시적인 네트워크 오류만이면 넘어가고, 그 밖의 오류가 있으면 알림
//  · 정상(ok)으로 돌아오면 열린 알림 이슈에 '복구' 댓글을 달고 닫음
//  · 공개 저장소라 비밀값처럼 보이는 글자는 가림
// 환경변수: GH_TOKEN, GITHUB_REPOSITORY, JOB_STATUS, RUN_URL, WORKFLOW_NAME
// =========================================================
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const LABEL = 'collect-alert';
const repo = process.env.GITHUB_REPOSITORY;
const runUrl = process.env.RUN_URL ?? '';
const workflow = process.env.WORKFLOW_NAME ?? '수집';
const gh = (...args) => execFileSync('gh', [...args, '--repo', repo], { encoding: 'utf8' }).trim();

const scrub = (s) => String(s)
  .replace(/serviceKey=[^&\s"]+/gi, 'serviceKey=***')
  .replace(/sb_secret_[\w-]+/g, 'sb_secret_***')
  .replace(/eyJ[\w-]{20,}\.[\w-]+\.[\w-]+/g, '***')
  .replace(/[A-Za-z0-9%+/=]{40,}/g, '***')
  .slice(0, 600);

const result = existsSync('collect-result.json') ? JSON.parse(readFileSync('collect-result.json', 'utf8')) : null;
const jobFailed = process.env.JOB_STATUS && process.env.JOB_STATUS !== 'success';
const status = result?.status ?? (jobFailed ? 'crashed' : 'unknown');
const errors = result?.errors ?? (jobFailed ? ['작업이 수집 결과를 남기기 전에 실패했어요 (실행 기록에서 확인)'] : []);
// 다음 실행에서 다시 받는 일시적 오류 (네트워크, 투찰 순위 일부 실패)
const NETWORK = /fetch failed|timeout|timed out|ECONNRESET|ETIMEDOUT|socket|EAI_AGAIN|502|503|504|투찰 순위 일부 실패/i;

const alert = status === 'failed' || status === 'crashed' || (status === 'partial' && errors.some((e) => !NETWORK.test(e)));
const open = () => {
  const list = JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'open', '--json', 'number', '--limit', '1') || '[]');
  return list[0]?.number ?? null;
};

try {
  if (alert) {
    const body = [
      `**${workflow}** 결과: \`${status}\` (${result?.window ?? ''})`,
      result?.summary ? `- ${result.summary}` : '',
      '',
      '오류:',
      ...errors.slice(0, 8).map((e) => `- ${scrub(e)}`),
      errors.length > 8 ? `- 그 밖에 ${errors.length - 8}건` : '',
      '',
      `실행 기록: ${runUrl}`,
    ].filter((x) => x !== '').join('\n');
    const n = open();
    if (n) gh('issue', 'comment', String(n), '--body', body);
    else {
      try { gh('label', 'create', LABEL, '--color', 'D93F0B', '--description', '수집 장애 알림'); } catch { /* 이미 있음 */ }
      gh('issue', 'create', '--title', '⚠️ 수집 오류 — 확인이 필요해요', '--label', LABEL, '--body', body);
    }
    console.log('알림을 보냈어요');
  } else if (status === 'ok') {
    const n = open();
    if (n) {
      gh('issue', 'comment', String(n), '--body', `✅ ${workflow} 정상으로 돌아왔어요. ${result?.summary ?? ''}\n\n실행 기록: ${runUrl}`);
      gh('issue', 'close', String(n));
      console.log('복구를 알리고 이슈를 닫았어요');
    }
  } else {
    console.log(`알림 없음 (${status}${errors.length ? `, 일시적 오류 ${errors.length}건` : ''})`);
  }
} catch (e) {
  // 알림이 실패해도 수집 결과에는 영향 없음
  console.error('알림 보내기 실패:', e.message);
}
