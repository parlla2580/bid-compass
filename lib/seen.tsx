'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from './store';
import { fire, getSupabase, supabaseEnabled } from './supabase';

/*
 * 열어 본 공고 · 지난 확인 이후 새 공고 (2026-11-18 사용자 요청: "봤던 공고와 안 본 공고가 구분이 안 돼요")
 *  · 봤음: 공고 상세를 열거나(모바일) 미리보기로 고른(데스크탑) 공고 → 목록에서 제목이 회색
 *  · 새 공고: 지난번 목록을 확인했을 때보다 나중에 들어온 공고 → 파란 점
 *      공고 id는 처음 수집될 때 매겨지고 계속 커짐 → 지난 확인 때 가장 큰 id보다 크면 새 공고
 *      (게시일로 비교하면 수집이 늦은 공고를 놓침)
 *      30분 안에 다시 들어오면 같은 방문으로 봄 — 새로고침해도 파란 점이 사라지지 않게
 *  · 이 기기(localStorage)에 바로 저장, 회원은 028 notice_seen으로 휴대폰·PC 같이 (028 실행 전이면 이 기기만)
 */

const LOCAL_SEEN = 'bc3:seen';
const LOCAL_MARK = 'bc3:listMark';
const KEEP = 5000;
const SAME_VISIT_MS = 30 * 60e3;

interface Mark { at: number; cur: number; prev: number | null }

const read = <T,>(k: string, d: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장소 막힘 */ } };
const trim = (ids: Iterable<number>) => [...new Set(ids)].sort((a, b) => b - a).slice(0, KEEP);

interface SeenValue {
  /** 열어 본 공고인지 */
  isSeen: (id: number) => boolean;
  /** 지난 확인 이후 새로 들어온 공고인지 (첫 방문이면 null — 판단 안 함) */
  isFresh: (id: number) => boolean | null;
  markSeen: (id: number) => void;
  /** 목록을 열 때 — 지금 목록의 가장 큰 공고 id */
  visitList: (maxId: number) => void;
  /** 지난 확인 시점의 기준 id (없으면 첫 방문) */
  prevMark: number | null;
}

const Ctx = createContext<SeenValue | null>(null);

export function SeenProvider({ children }: { children: ReactNode }) {
  const { account } = useStore();
  const [seen, setSeen] = useState<Set<number>>(new Set());
  const [prevMark, setPrevMark] = useState<number | null>(null);
  const server = useRef(false);
  const serverMark = useRef<number | null>(null);
  const queue = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSeen(new Set(read<number[]>(LOCAL_SEEN, [])));
    setPrevMark(read<Mark | null>(LOCAL_MARK, null)?.prev ?? null);
  }, []);

  const flush = useCallback(() => {
    timer.current = null;
    if (!server.current || !queue.current.size) return;
    const ids = [...queue.current];
    queue.current.clear();
    fire(getSupabase().rpc('mark_seen', { p_ids: ids }), '본 공고 표시');
  }, []);

  // 회원 — 서버 기록과 합치고, 이 기기에만 있던 것은 서버로
  useEffect(() => {
    server.current = false;
    serverMark.current = null;
    if (!account || !supabaseEnabled) return;
    getSupabase().from('notice_seen').select('ids,list_mark').maybeSingle().then(({ data, error }) => {
      if (error) return; // 028 실행 전
      server.current = true;
      serverMark.current = data?.list_mark ?? null;
      const remote = new Set<number>(data?.ids ?? []);
      const local = read<number[]>(LOCAL_SEEN, []);
      const onlyLocal = local.filter((id) => !remote.has(id));
      const merged = trim([...remote, ...local]);
      write(LOCAL_SEEN, merged);
      setSeen(new Set(merged));
      if (onlyLocal.length) { onlyLocal.forEach((id) => queue.current.add(id)); flush(); }
    });
  }, [account, flush]);

  const markSeen = useCallback((id: number) => {
    setSeen((cur) => {
      if (cur.has(id)) return cur;
      const next = new Set(cur).add(id);
      write(LOCAL_SEEN, trim(next));
      return next;
    });
    queue.current.add(id);
    if (!timer.current) timer.current = setTimeout(flush, 1500);
  }, [flush]);

  const visitList = useCallback((maxId: number) => {
    if (!(maxId > 0)) return;
    const now = Date.now();
    const m = read<Mark | null>(LOCAL_MARK, null);
    const last = Math.max(m?.cur ?? 0, serverMark.current ?? 0) || null;
    let next: Mark;
    if (!m || now - m.at > SAME_VISIT_MS) next = { at: now, cur: maxId, prev: last };
    else next = { at: now, cur: Math.max(m.cur, maxId), prev: m.prev };
    write(LOCAL_MARK, next);
    setPrevMark(next.prev);
    if (server.current) fire(getSupabase().rpc('set_list_mark', { p_mark: next.cur }), '목록 확인 시점');
  }, []);

  const value = useMemo<SeenValue>(() => ({
    isSeen: (id) => seen.has(id),
    isFresh: (id) => (prevMark === null ? null : id > prevMark),
    markSeen,
    visitList,
    prevMark,
  }), [seen, prevMark, markSeen, visitList]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const NOOP: SeenValue = { isSeen: () => false, isFresh: () => null, markSeen: () => {}, visitList: () => {}, prevMark: null };
export const useSeen = () => useContext(Ctx) ?? NOOP;
