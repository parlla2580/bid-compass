'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BarChart3, BellOff, Building2, ChevronRight, Clock, FilePen, FileSearch, FileText, PartyPopper, Trophy, Trophy as Result } from 'lucide-react';
import { useInbox, type InboxIcon, type InboxItem } from '@/lib/inbox';
import { useStore } from '@/lib/store';
import { Tip } from '@/components/tip';

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
  org: { I: Building2, c: 'bg-warn/10 text-warn' },
  soon: { I: FileSearch, c: 'bg-brand-soft text-brand' },
  change: { I: FilePen, c: 'bg-warn/10 text-warn' },
  report: { I: BarChart3, c: 'bg-brand-soft text-brand' },
};

const dday = (due: Date) => {
  const d = Math.ceil((due.getTime() - Date.now()) / 86400e3);
  return d < 0 ? '기한 지남?' : d === 0 ? '오늘' : `D-${d}`;
};

export default function InboxView() {
  const { account } = useStore();
  const { actions, news, state, markRead, setDone, loading } = useInbox();

  // 알림함을 열면 지금 보이는 알림을 읽음으로 (종의 숫자만 사라짐)
  useEffect(() => {
    const keys = [...actions, ...news].map((i) => i.key);
    if (keys.length) { const t = setTimeout(() => markRead(keys), 800); return () => clearTimeout(t); }
  }, [actions, news, markRead]);

  if (!account) {
    return (
      <div className="px-5 pt-16 text-center lg:px-0">
        <p className="text-[15px] text-sub">가입하면 1순위 개찰·마감 임박·결과 소식을 모아 알려드려요</p>
        <div className="mx-auto mt-5 flex max-w-[320px] gap-2">
          <Link href="/login" className="flex h-12 flex-1 items-center justify-center rounded-btn bg-ink text-[15px] font-semibold text-white">로그인</Link>
          <Link href="/mypage?signup=1" className="flex h-12 flex-1 items-center justify-center rounded-btn bg-white text-[15px] font-semibold text-ink ring-1 ring-line">가입</Link>
        </div>
      </div>
    );
  }

  return (
    <main className="space-y-6 px-5 pb-28 pt-2 lg:px-0 lg:pb-0">
      <section>
        <h2 className="mb-2 flex items-center gap-1 px-1 text-[17px] font-bold">해야 할 일 {actions.length > 0 && <span className="text-brand">{actions.length}</span>}
          <Tip title="알림 기준">1순위 서류 기한은 개찰일 기준 추정이라, 실제 기한은 나라장터 통보일부터 세 주세요. 저장한 기관은 계약 끝 60일 전부터, 곧 나올 맞춤 공고는 공개된 날 알려 드려요.</Tip>
        </h2>
        {actions.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-box bg-white">
            {actions.map((i) => <Row key={i.key} i={i} unread={!state(i.key).read_at} onDone={i.doneLabel ? () => setDone(i.key, true) : undefined} />)}
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

    </main>
  );
}

function Row({ i, unread, onDone }: { i: InboxItem; unread: boolean; onDone?: () => void }) {
  const { I, c } = ICON[i.icon];
  return (
    <li className="flex items-center">
      <Link href={i.href} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 hover:bg-fill/60">
        <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${c}`}>
          <I className="h-5 w-5" />
          {unread && <i className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-bad" aria-label="새 알림" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[15px] ${unread ? 'font-bold' : 'font-semibold'}`}>{i.title}</span>
          <span className="block truncate text-[13px] text-mute">{i.sub}</span>
        </span>
        {i.due && <span className={`shrink-0 text-[14px] font-bold tabular-nums ${Math.ceil((i.due.getTime() - Date.now()) / 86400e3) <= 2 ? 'text-bad' : 'text-brand'}`}>{dday(i.due)}</span>}
        {!onDone && <ChevronRight className="h-4 w-4 shrink-0 text-mute" />}
      </Link>
      {onDone && <button type="button" onClick={onDone} className="mr-3 h-9 shrink-0 rounded-btn bg-fill px-3 text-[13px] font-semibold text-sub">{i.doneLabel}</button>}
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="flex items-center justify-center gap-2 rounded-box bg-white py-8 text-[14px] text-mute"><BellOff className="h-4 w-4" />{text}</p>;
}
