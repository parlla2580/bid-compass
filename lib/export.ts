import { fetchMyMarket, fetchMyReport, type MyBidItem } from './analysis';
import { getSupabase } from './supabase';
import { excelDate, type Sheet } from './xlsx';

/*
 * 입찰 분석 엑셀 내려받기 — 본인 회사 분석 함수(my_*)로만 읽음 (투찰 기록 표 직접 읽기 없음)
 * 시트: 요약 / 투찰 이력 / 유형·기관별 / 자주 만나는 회사 / 다른 시장
 */

const ratio = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function buildAnalysisWorkbook(corpName: string | null): Promise<{ name: string; sheets: Sheet[] }> {
  const [report, list, market] = await Promise.all([
    fetchMyReport(3),
    getSupabase().rpc('my_bid_list', { p_years: 3, p_limit: 5000 }).then(({ data, error }) => (error || !data?.verified ? [] : (data.items as MyBidItem[]))),
    fetchMyMarket(3),
  ]);
  if (!report.verified) throw new Error('회사 확인이 필요해요');

  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const source = `입찰나침반 · 나라장터 개찰 결과 기준 · 최근 3년 · ${today} 내려받음. 참고용 자료예요.`;
  const total = report.total ?? 0, won = report.won ?? 0;

  const summary: Sheet = {
    name: '요약', note: source,
    columns: [{ title: '항목', width: 28 }, { title: '값', width: 16, fmt: 'pct' }, { title: '설명', width: 52 }],
    rows: [
      ['회사', corpName ?? '', ''],
      ['투찰 건수', total, '최근 3년'],
      ['낙찰 건수', won, '최종낙찰자 기준'],
      ['낙찰률(%)', report.detailed ? ratio(report.won_detailed ?? 0, report.detailed) : ratio(won, total), report.detailed ? `투찰 순위를 받은 ${report.detailed}건 기준` : ''],
      ['낙찰하한선 미달', report.below_floor ?? 0, '하한율보다 낮게 투찰한 건수'],
      ['평균 투찰률(%)', report.avg_rate ?? null, '투찰금액 ÷ 예정가격'],
      ['평균 참가업체 수', report.avg_participants ?? null, ''],
    ],
  };

  const tag = (i: MyBidItem) => (i.won ? '낙찰' : i.note === 1 ? '하한 미달' : i.rank ? `${i.rank}위` : '탈락');
  const history: Sheet = {
    name: '투찰 이력', note: source,
    columns: [
      { title: '개찰일', width: 12, fmt: 'date' }, { title: '공고명', width: 48 }, { title: '기관', width: 26 }, { title: '유형', width: 8 },
      { title: '결과', width: 10 }, { title: '순위', width: 7, fmt: 'int' }, { title: '참가업체', width: 10, fmt: 'int' },
      { title: '투찰률(%)', width: 11, fmt: 'pct' }, { title: '투찰금액(원)', width: 16, fmt: 'won' }, { title: '낙찰자', width: 22 },
    ],
    rows: list.map((i) => [excelDate(i.opened_at), i.title, i.org ?? '', i.type, tag(i), i.rank, i.participants, i.rate, i.amount, i.won ? '우리 회사' : i.winner ?? '']),
  };

  const breakdown: Sheet = {
    name: '유형·기관별', note: source,
    columns: [{ title: '구분', width: 8 }, { title: '이름', width: 34 }, { title: '투찰', width: 8, fmt: 'int' }, { title: '낙찰', width: 8, fmt: 'int' }, { title: '낙찰률(%)', width: 11, fmt: 'pct' }],
    rows: [
      ...Object.entries(report.by_type ?? {}).map(([k, v]) => ['유형', k, v.total, v.won, ratio(v.won, v.total)]),
      ...(report.top_orgs ?? []).map((o) => ['기관', o.org, o.total, o.won, ratio(o.won, o.total)]),
    ],
  };

  const sheets = [summary, history, breakdown];
  if (market?.verified) {
    sheets.push({
      name: '자주 만나는 회사', note: '우리가 투찰한 개찰에 함께 들어온 회사 (참가업체가 많은 공고·아무 데나 들어가는 회사는 가중치를 낮춰 순위)',
      columns: [{ title: '회사', width: 30 }, { title: '함께 들어간 공고', width: 16, fmt: 'int' }, { title: '이 시장 낙찰', width: 12, fmt: 'int' }, { title: '낙찰 금액(원)', width: 18, fmt: 'won' }],
      rows: (market.competitors ?? []).map((c) => [c.name, c.shared, c.wins, c.win_amount]),
    });
    sheets.push({
      name: '다른 시장', note: '자주 만나는 회사들이 최근 1년 들어갔지만 우리는 안 들어간 기관',
      columns: [{ title: '기관', width: 34 }, { title: '유형', width: 8 }, { title: '들어간 회사 수', width: 14, fmt: 'int' }, { title: '공고 수', width: 10, fmt: 'int' }],
      rows: (market.other_markets ?? []).map((o) => [o.org, o.type, o.firms, o.openings]),
    });
  }
  return { name: `입찰분석_${(corpName ?? '우리회사').replace(/[\\/:*?"<>|()\s]/g, '')}_${today}`, sheets };
}
