'use client';

import Link from 'next/link';
import { AlarmClock, ChevronRight } from 'lucide-react';
import { useInbox } from '@/lib/inbox';

/** 홈 — 기한이 2일 이하로 남은 '해야 할 일'만 한 줄로 (평소엔 아무것도 안 보임) */
export function UrgentStrip() {
  const { actions } = useInbox();
  const urgent = actions.filter((a) => a.due && Math.ceil((a.due.getTime() - Date.now()) / 86400e3) <= 2);
  if (!urgent.length) return null;
  const a = urgent[0];
  const d = Math.ceil((a.due!.getTime() - Date.now()) / 86400e3);
  return (
    <Link href={urgent.length > 1 ? '/inbox' : a.href} className="mt-4 flex items-center gap-2.5 rounded-box bg-bad/10 px-4 py-3 text-[14px]">
      <AlarmClock className="h-[18px] w-[18px] shrink-0 text-bad" />
      <span className="shrink-0 font-bold tabular-nums text-bad">{d < 0 ? '기한 지남?' : d === 0 ? '오늘' : `D-${d}`}</span>
      <span className="min-w-0 flex-1 truncate text-ink">{a.title.replace(/!.*$/, '')} · {a.sub}</span>
      {urgent.length > 1 && <span className="shrink-0 text-[13px] text-mute">외 {urgent.length - 1}건</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
    </Link>
  );
}
