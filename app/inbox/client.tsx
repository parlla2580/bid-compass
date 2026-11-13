'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BellOff, ChevronRight, Clock, FileText, PartyPopper, Trophy, Trophy as Result } from 'lucide-react';
import { useInbox, type InboxIcon, type InboxItem } from '@/lib/inbox';
import { useStore } from '@/lib/store';

/*
 * 알림함 — 해야 할 일(기한, 끝내야 사라짐) / 소식(읽으면 끝)
 * 들어오면 모두 '읽음' 처리(종의 숫자만 사라짐). 해야 할 일은 [제출했어요] 등으로 끝낼 때까지 남음
 */

const ICON: Record<InboxIcon, { I: typeof Trophy; c: string }> = {
  trophy: { I: Trophy, c: 'bg-brand-soft text-brand' },
  clock: { I: Clock, c: 'bg-bad/10 text-bad' },
  win: { I: PartyPopper, c: 'bg-brand-soft text-brand' },
  result: { I: Result, c: 'bg-fill text-sub' },
  new: { I: FileText, c: 'bg-fill text-sub' },
};

const dday = (due: Date) => {
  const d = Math.ceil((due.getTime() - Date.now()) / 86400e3);
  return d < 0 ? '기한 지남?' : d === 0 ? '오늘' : `D-${d}`;
};

export default function InboxView() {
  const { account } = useStore();
  const { actions, news, state, markRead, loading } = useInbox();

  // 알림함을 열면 지금 보이는 알림을 읽음으로 (종의 숫자만 사라짐)
  useEffect(() => {
    const keys = [...actions, ...news].map((i) => i.key);
    if (keys.length) { const t = setTimeout(() => markRead(keys), 800); return () => clearTimeout(t); }
  }, [actions, news, markRead]);

  if (!account) {
    return <p className="px-5 pt-16 text-center text-[15px] text-sub lg:px-0">가입하면 1순위 개찰·마감 임박·결과 소식을 모아 알려드려요</p>;
  }

  return (
    <main className="space-y-6 px-5 pb-28 pt-2 lg:px-0 lg:pb-0">
      <section>
        <h2 className="mb-2 px-1 text-[17px] font-bold">해야 할 일 {actions.length > 0 && <span className="text-brand">{actions.length}</span>}</h2>
        {actions.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-box bg-white">
            {actions.map((i) => <Row key={i.key} i={i} unread={!state(i.key).read_at} />)}
          </ul>
        ) : <Empty text={loading ? '확인하는 중이에요' : '지금 급한 일은 없어요'} />}
      </section>

      <section>
        <h2 className="mb-2 px-1 text-[17px] font-bold">소식</h2>
        {news.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-box bg-white">
            {news.map((i) => <Row key={i.key} i={i} unread={!state(i.key).read_at} />)}
          </ul>
        ) : <Empty text="새 소식이 없어요" />}
      </section>

      <p className="px-1 text-[12px] leading-relaxed text-mute">
        1순위 서류 기한은 개찰일 기준 추정이에요. 실제 기한은 나라장터 통보일부터 세요. 이메일 알림은 준비 중이에요.
      </p>
    </main>
  );
}

function Row({ i, unread }: { i: InboxItem; unread: boolean }) {
  const { I, c } = ICON[i.icon];
  return (
    <li>
      <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-fill/60">
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${c}`}>
          <I className="h-5 w-5" />
          {unread && <i className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-bad" aria-label="새 알림" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] ${unread ? 'font-bold' : 'font-semibold'}`}>{i.title}</span>
          <span className="block truncate text-[13px] text-mute">{i.sub}</span>
        </span>
        {i.due && <span className={`shrink-0 text-[14px] font-bold tabular-nums ${Math.ceil((i.due.getTime() - Date.now()) / 86400e3) <= 2 ? 'text-bad' : 'text-brand'}`}>{dday(i.due)}</span>}
        <ChevronRight className="h-4 w-4 shrink-0 text-mute" />
      </Link>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex items-center justify-center gap-2 rounded-box bg-white py-8 text-[14px] text-mute"><BellOff className="h-4 w-4" />{text}</p>;
}
