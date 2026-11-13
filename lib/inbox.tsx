'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { bidOutcome, fetchMyBidList, type MyBidItem } from './analysis';
import { fetchFirstRanks, type FirstRank } from './first-rank';
import { useJudged, useStore } from './store';
import { getSupabase, supabaseEnabled } from './supabase';

/*
 * 알림함 (기획 16장 A1)
 *  해야 할 일 — 기한이 있고, 끝내야 사라짐: 1순위 서류 제출, 저장 공고 마감 임박
 *  소식       — 읽으면 끝: 결과 확정(낙찰·3위 안), 오늘 새 맞춤 공고
 * 알림 목록은 그때그때 만들고, 회원별 '읽음·제출했어요·체크한 서류'만 저장 (019 inbox_state, 없으면 이 기기)
 */

export type InboxKind = 'action' | 'news';
export type InboxIcon = 'trophy' | 'clock' | 'win' | 'result' | 'new';

export interface InboxItem {
  key: string;
  kind: InboxKind;
  icon: InboxIcon;
  title: string;
  sub: string;
  href: string;
  /** 기한 (해야 할 일) */
  due: Date | null;
  /** 정렬용 시각 */
  at: Date;
}

export interface ItemState { read_at: string | null; done_at: string | null; checks: string[] }

const LOCAL = 'bc3:inbox';
const readLocal = (): Record<string, ItemState> => { try { return JSON.parse(localStorage.getItem(LOCAL) ?? '{}'); } catch { return {}; } };
const writeLocal = (v: Record<string, ItemState>) => { try { localStorage.setItem(LOCAL, JSON.stringify(v)); } catch { /* 저장소를 못 써도 동작 */ } };
const EMPTY: ItemState = { read_at: null, done_at: null, checks: [] };

const kstDay = (d = new Date()) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);

interface InboxValue {
  items: InboxItem[];
  /** 끝나지 않은 해야 할 일 */
  actions: InboxItem[];
  news: InboxItem[];
  unread: number;
  firstRanks: FirstRank[];
  state: (key: string) => ItemState;
  markRead: (keys: string[]) => void;
  setDone: (key: string, done: boolean) => void;
  toggleCheck: (key: string, check: string) => void;
  loading: boolean;
}

const InboxContext = createContext<InboxValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const { account, profile, saved, notices } = useStore();
  const judged = useJudged();
  const verified = !!account && !!profile.corpName;
  const [firstRanks, setFirstRanks] = useState<FirstRank[]>([]);
  const [bids, setBids] = useState<MyBidItem[]>([]);
  const [st, setSt] = useState<Record<string, ItemState>>({});
  const [server, setServer] = useState(false);
  const [loading, setLoading] = useState(true);

  // 회원 입찰 이력 → 1순위·결과
  useEffect(() => {
    if (!verified) { setFirstRanks([]); setBids([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([fetchFirstRanks().catch(() => []), fetchMyBidList().catch(() => null)])
      .then(([f, b]) => { setFirstRanks(f); setBids(b ?? []); })
      .finally(() => setLoading(false));
  }, [verified]);

  // 상태 불러오기 — 서버(019) 우선, 없으면 이 기기
  useEffect(() => {
    if (!account || !supabaseEnabled) { setServer(false); setSt(readLocal()); return; }
    getSupabase().from('inbox_state').select('item_key,read_at,done_at,checks').then(({ data, error }) => {
      if (error) { setServer(false); setSt(readLocal()); return; }
      setServer(true);
      setSt(Object.fromEntries((data ?? []).map((r) => [r.item_key, { read_at: r.read_at, done_at: r.done_at, checks: r.checks ?? [] }])));
    });
  }, [account]);

  const persist = useCallback((key: string, next: ItemState) => {
    setSt((cur) => {
      const all = { ...cur, [key]: next };
      if (!server) writeLocal(all);
      return all;
    });
    if (server && account) {
      void getSupabase().from('inbox_state').upsert({ user_id: account.id, item_key: key, ...next, updated_at: new Date().toISOString() });
    }
  }, [server, account]);

  const state = useCallback((key: string) => st[key] ?? EMPTY, [st]);

  const items = useMemo<InboxItem[]>(() => {
    const out: InboxItem[] = [];
    if (!account) return out; // 알림함은 회원 전용
    // 1) 1순위 서류 제출
    for (const f of firstRanks) {
      out.push({
        key: `first:${f.item.id}`, kind: 'action', icon: 'trophy',
        title: f.kind === 'qual' ? '1순위예요! 적격심사 서류를 제출하세요' : f.kind === 'quote' ? '견적 1순위예요! 계약 서류 요청을 확인하세요' : '1순위예요! 낙찰자 결정을 기다려요',
        sub: f.item.title, href: `/analysis/${f.item.id}`, due: f.due, at: new Date(f.item.opened_at),
      });
    }
    // 2) 저장한 공고 마감 임박 (오늘·내일)
    for (const n of notices ?? []) {
      if (!saved.includes(n.id) || n.d < 0 || n.d > 1) continue;
      out.push({ key: `due:${n.id}`, kind: 'action', icon: 'clock', title: n.d === 0 ? '저장한 공고가 오늘 마감돼요' : '저장한 공고가 내일 마감돼요', sub: n.title, href: `/bids/${n.id}`, due: n.closesAt, at: n.closesAt });
    }
    // 3) 결과 확정 — 최근 14일, 낙찰 또는 3위 안
    const since = Date.now() - 14 * 86400e3;
    for (const b of bids) {
      if (new Date(b.opened_at).getTime() < since) continue;
      const o = bidOutcome(b);
      if (o === 'won') out.push({ key: `result:${b.id}`, kind: 'news', icon: 'win', title: '낙찰됐어요 🎉', sub: b.title, href: `/analysis/${b.id}`, due: null, at: new Date(b.opened_at) });
      else if (o === 'lost' && b.rank && b.rank <= 3) out.push({ key: `result:${b.id}`, kind: 'news', icon: 'result', title: `결과가 나왔어요 · ${b.rank}위`, sub: b.title, href: `/analysis/${b.id}`, due: null, at: new Date(b.opened_at) });
    }
    // 4) 오늘 새 맞춤 공고
    const fresh = (judged ?? []).filter((j) => j.matched && j.notice.isNew).length;
    if (fresh > 0) out.push({ key: `new:${kstDay()}`, kind: 'news', icon: 'new', title: `오늘 새 맞춤 공고 ${fresh}건`, sub: '맞춤 점수 높은 순으로 볼 수 있어요', href: '/bids?sort=latest', due: null, at: new Date() });
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [account, firstRanks, notices, saved, bids, judged]);

  const value = useMemo<InboxValue>(() => {
    const actions = items.filter((i) => i.kind === 'action' && !state(i.key).done_at)
      .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
    const news = items.filter((i) => i.kind === 'news');
    const unread = [...actions, ...news].filter((i) => !state(i.key).read_at).length;
    return {
      items, actions, news, unread, firstRanks, state, loading,
      markRead: (keys) => keys.forEach((k) => { const s = state(k); if (!s.read_at) persist(k, { ...s, read_at: new Date().toISOString() }); }),
      setDone: (k, done) => { const s = state(k); persist(k, { ...s, read_at: s.read_at ?? new Date().toISOString(), done_at: done ? new Date().toISOString() : null }); },
      toggleCheck: (k, c) => { const s = state(k); const set = new Set(s.checks); if (set.has(c)) set.delete(c); else set.add(c); persist(k, { ...s, checks: [...set] }); },
    };
  }, [items, state, persist, firstRanks, loading]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): InboxValue {
  const v = useContext(InboxContext);
  if (!v) throw new Error('InboxProvider가 필요합니다');
  return v;
}
