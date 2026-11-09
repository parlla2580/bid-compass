'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/layout';
import { fmtDateTime, fmtShort, fmtWon } from '@/lib/format';
import { fetchOpeningDetail, type OpeningBidder, type OpeningDetail } from '@/lib/analysis';
import { useStore } from '@/lib/store';

/*
 * 개찰 결과 요약 — 기초금액·예정가격·사정률·낙찰자, 참가업체 투찰률 분포(밀도 곡선 + 점)
 * 우리 회사가 참여한 개찰만 (011 my_opening_detail)
 */
export default function OpeningView({ id }: { id: number }) {
  const { account, loaded } = useStore();
  const [d, setD] = useState<OpeningDetail | null | undefined>(undefined);
  useEffect(() => { if (account) fetchOpeningDetail(id).then(setD).catch(() => setD(null)); }, [id, account]);

  if (!loaded || (account && d === undefined)) return <main className="space-y-3 px-5 pt-4 lg:px-0">{[0, 1].map((i) => <div key={i} className="h-40 animate-pulse rounded-box bg-white" />)}</main>;
  if (!account || !d || !d.verified || !d.found || !d.opening) {
    return (
      <main className="px-5 pt-16 text-center lg:px-0">
        <p className="text-[15px] text-sub">{!account ? '로그인이 필요해요' : d && !d.verified ? '회사 확인을 마친 회원만 볼 수 있어요' : '우리 회사가 참여한 개찰만 볼 수 있어요'}</p>
        <Link href="/analysis" className="mt-3 inline-block text-[15px] font-semibold text-brand">입찰 분석으로</Link>
      </main>
    );
  }

  const o = d.opening;
  const bidders = d.bidders ?? [];
  const me = bidders.find((b) => b.me);
  const valid = bidders.filter((b) => b.note === null && b.rate !== null);
  const floor = o.floor_rate ?? estimateFloor(bidders);

  const verdict = o.winner_is_me ? { t: '낙찰했어요', c: 'text-brand' }
    : me?.note === 1 ? { t: '하한 미달로 빠졌어요', c: 'text-bad' }
      : me?.rank ? { t: `${me.rank}위였어요`, c: 'text-ink' } : { t: '결과 확인', c: 'text-ink' };

  return (
    <main className="space-y-3 px-5 pb-28 lg:space-y-4 lg:px-0 lg:pb-0">
      <section className="pt-1">
        <p className="text-[14px] text-mute">{o.type} · {o.demand_org ?? o.org} · 개찰 {fmtDateTime(new Date(o.opened_at))}</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-snug tracking-tight lg:text-[26px]">{o.title}</h1>
        <p className={`mt-2 text-[18px] font-bold ${verdict.c}`}>{verdict.t}{me?.rate ? <span className="ml-2 text-[15px] font-medium text-sub">내 투찰률 {me.rate}%{me.amount ? ` · ${fmtWon(me.amount)}` : ''}</span> : null}</p>
      </section>

      {/* 핵심 숫자 */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        <Stat k="낙찰자" v={o.winner_is_me ? '우리 회사' : o.winner ?? '미상'} small />
        <Stat k="낙찰금액" v={o.winner_amount ? `${fmtShort(o.winner_amount)}원` : '–'} sub={o.winner_rate ? `낙찰률 ${o.winner_rate}%` : undefined} />
        <Stat k="사정률" v={o.sajeong ? `${o.sajeong}%` : '–'} sub={o.planned_price ? `예정가격 ${fmtShort(o.planned_price)}원` : undefined} />
        <Stat k="참가업체" v={o.participants ? `${o.participants.toLocaleString()}곳` : '–'} sub={o.base_amount ? `기초금액 ${fmtShort(o.base_amount)}원` : undefined} />
      </section>

      {/* 투찰률 분포 */}
      <Card title="참가업체 투찰률 분포" aside={<span className="text-[13px] text-mute">투찰률 = 투찰금액 ÷ 예정가격</span>}>
        {valid.length >= 2 ? <Distribution bidders={bidders} floor={floor} floorKnown={o.floor_rate !== null} /> : (
          <p className="py-8 text-center text-[14px] text-mute">{o.details_fetched ? '분포를 그릴 만큼 투찰 기록이 없어요' : '이 개찰은 아직 투찰 순위를 받지 못했어요. 곧 채워져요.'}</p>
        )}
      </Card>

      {/* 순위표 — 나와 1순위 주변 */}
      {bidders.length > 0 && <Ranking bidders={bidders} />}

      <p className="px-1 text-[13px] leading-relaxed text-mute">나라장터 개찰 결과로 만든 참고 정보예요. 낙찰자는 최종낙찰자 기준이며, 적격심사에서는 1순위가 낙찰되지 않을 수 있어요.</p>
    </main>
  );
}

function Stat({ k, v, sub, small }: { k: string; v: string; sub?: string; small?: boolean }) {
  return (
    <div className="rounded-box bg-white px-4 py-4 lg:px-5">
      <p className="text-[13px] text-mute">{k}</p>
      <p className={`mt-1 truncate font-bold ${small ? 'text-[17px]' : 'text-[22px]'}`} title={v}>{v}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-mute">{sub}</p>}
    </div>
  );
}

/** 하한율이 없으면 투찰 기록으로 추정 (미달 업체 최고와 유효 업체 최저의 중간) */
function estimateFloor(b: OpeningBidder[]): number | null {
  const below = b.filter((x) => x.note === 1 && x.rate).map((x) => Number(x.rate));
  const ok = b.filter((x) => x.note === null && x.rate).map((x) => Number(x.rate));
  if (!ok.length) return null;
  return below.length ? (Math.max(...below) + Math.min(...ok)) / 2 : null;
}

/** 밀도 곡선(가우시안 커널) + 업체별 점 — 하한선, 나, 낙찰자 표시 */
function Distribution({ bidders, floor, floorKnown }: { bidders: OpeningBidder[]; floor: number | null; floorKnown: boolean }) {
  const pts = bidders.filter((b) => b.rate !== null && Number(b.rate) > 0).map((b) => ({ ...b, r: Number(b.rate) }));
  const rates = pts.map((p) => p.r).sort((a, b) => a - b);
  const q = (p: number) => rates[Math.min(rates.length - 1, Math.max(0, Math.round(p * (rates.length - 1))))];
  // 보이는 범위: 극단값을 빼고 하한선·나·낙찰자가 들어오게
  const marks = [floor, ...pts.filter((p) => p.me || p.winner).map((p) => p.r)].filter((x): x is number => x !== null);
  let lo = Math.min(q(0.02), ...marks) - 0.3, hi = Math.max(q(0.98), ...marks) + 0.3;
  if (hi - lo < 1) { lo -= 0.5; hi += 0.5; }
  const W = 640, H = 200, padB = 28, plotH = H - padB - 56;
  const x = (v: number) => ((v - lo) / (hi - lo)) * W;

  const curve = useMemo(() => {
    const inR = rates.filter((r) => r >= lo && r <= hi);
    if (inR.length < 2) return '';
    const mean = inR.reduce((s, v) => s + v, 0) / inR.length;
    const sd = Math.sqrt(inR.reduce((s, v) => s + (v - mean) ** 2, 0) / inR.length) || 0.1;
    const bw = Math.max(0.03, 1.06 * sd * Math.pow(inR.length, -0.2)); // 실버만 규칙
    const steps = 120, ys: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const v = lo + ((hi - lo) * i) / steps;
      ys.push(inR.reduce((s, r) => s + Math.exp(-0.5 * ((v - r) / bw) ** 2), 0));
    }
    const max = Math.max(...ys) || 1;
    return ys.map((y, i) => `${i ? 'L' : 'M'}${((i / steps) * W).toFixed(1)},${(56 + plotH - (y / max) * plotH).toFixed(1)}`).join(' ');
  }, [rates, lo, hi, plotH]);

  // 점: 같은 위치가 겹치지 않게 작은 칸 단위로 위로 쌓음
  const stack = new Map<number, number>();
  const dots = pts.filter((p) => p.r >= lo && p.r <= hi).map((p) => {
    const bin = Math.round(x(p.r) / 6);
    const n = stack.get(bin) ?? 0; stack.set(bin, n + 1);
    return { ...p, cx: x(p.r), cy: H - padB - 4 - Math.min(n, 8) * 5 };
  });
  const meP = pts.find((p) => p.me), winP = pts.find((p) => p.winner);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="참가업체 투찰률 분포">
        {floor !== null && floor >= lo && floor <= hi && (
          <>
            <rect x={0} y={56} width={x(floor)} height={H - padB - 56} fill="#FDECEC" opacity={0.6} />
            <line x1={x(floor)} x2={x(floor)} y1={40} y2={H - padB} stroke="#E5484D" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={x(floor)} y={34} textAnchor="middle" fontSize={12} fill="#E5484D">하한 {floor.toFixed(3)}%{floorKnown ? '' : '(추정)'}</text>
          </>
        )}
        {curve && <path d={curve} fill="none" stroke="#2563EB" strokeWidth={2} />}
        {dots.map((p, i) => (
          <circle key={i} cx={p.cx} cy={p.cy} r={p.me || p.winner ? 0 : 2.2} fill={p.note === 1 ? '#C9CED6' : '#93B4F5'} />
        ))}
        {winP && winP.r >= lo && winP.r <= hi && (
          <g>
            <line x1={x(winP.r)} x2={x(winP.r)} y1={18} y2={H - padB} stroke="#2563EB" strokeWidth={1} />
            <circle cx={x(winP.r)} cy={H - padB - 4} r={6} fill="#2563EB" stroke="#fff" strokeWidth={2} />
            <text x={x(winP.r)} y={12} textAnchor={x(winP.r) > W - 90 ? 'end' : x(winP.r) < 90 ? 'start' : 'middle'} fontSize={12} fontWeight={700} fill="#2563EB">낙찰 {winP.r}%</text>
          </g>
        )}
        {meP && meP.r >= lo && meP.r <= hi && !meP.winner && (
          <g>
            <line x1={x(meP.r)} x2={x(meP.r)} y1={50} y2={H - padB} stroke="#191C21" strokeWidth={1} />
            <circle cx={x(meP.r)} cy={H - padB - 4} r={6} fill="#191C21" stroke="#fff" strokeWidth={2} />
            <text x={x(meP.r)} y={46} textAnchor={x(meP.r) > W - 90 ? 'end' : x(meP.r) < 90 ? 'start' : 'middle'} fontSize={12} fontWeight={700} fill="#191C21">우리 {meP.r}%</text>
          </g>
        )}
        <line x1={0} x2={W} y1={H - padB} y2={H - padB} stroke="#E8EAED" />
        {ticks.map((t, i) => <text key={t} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} fontSize={12} fill="#8A929E">{t.toFixed(2)}%</text>)}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-brand align-middle" />낙찰자</span>
        <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-ink align-middle" />우리 회사</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: '#93B4F5' }} />다른 업체</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: '#C9CED6' }} />하한 미달</span>
        <span>곡선: 업체들이 몰린 정도</span>
      </div>
      {pts.length - dots.length > 0 && <p className="mt-1 text-[12px] text-mute">범위 밖 {pts.length - dots.length}곳은 그래프에서 생략했어요</p>}
    </div>
  );
}

/** 순위표 — 1~5위와 우리 회사 앞뒤 */
function Ranking({ bidders }: { bidders: OpeningBidder[] }) {
  const ranked = bidders.filter((b) => b.rank !== null);
  const meIdx = ranked.findIndex((b) => b.me);
  const show = new Set<number>([0, 1, 2, 3, 4]);
  if (meIdx >= 0) [meIdx - 1, meIdx, meIdx + 1].forEach((i) => i >= 0 && show.add(i));
  const rows = ranked.map((b, i) => ({ b, i })).filter(({ i }) => show.has(i));
  const below = bidders.filter((b) => b.note === 1).length;
  return (
    <Card title="순위" aside={<span className="text-[13px] text-mute">순위 {ranked.length}곳{below ? ` · 하한 미달 ${below}곳` : ''}</span>}>
      <ul className="divide-y divide-line">
        {rows.map(({ b, i }, k) => (
          <li key={i} className={`flex items-center gap-3 py-2.5 text-[14px] ${b.me ? 'font-semibold' : ''}`}>
            {k > 0 && rows[k - 1].i !== i - 1 && <span className="sr-only">…</span>}
            <span className="w-10 shrink-0 tabular-nums text-mute">{b.rank}위</span>
            <span className="min-w-0 flex-1 truncate">{b.me ? '우리 회사' : b.name}{b.winner && <span className="ml-1.5 text-[12px] font-semibold text-brand">낙찰</span>}</span>
            <span className="shrink-0 tabular-nums text-sub">{b.rate}%</span>
            <span className="hidden w-28 shrink-0 text-right tabular-nums text-mute sm:block">{b.amount ? fmtWon(b.amount) : ''}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
