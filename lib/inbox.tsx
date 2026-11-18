'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { bidOutcome, fetchMyBidList, type MyBidItem } from './analysis';
import { fetchFirstRanks, type FirstRank } from './first-rank';
import { useJudged, useStore } from './store';
import { getSupabase, supabaseEnabled } from './supabase';
import { fetchPrespecs, matchPrespecs, type Prespec } from './prespecs';
import { fetchQualifyBy } from './briefing';
import { calcHref, isCatalog } from './data';
import { fmtKorean } from './format';

/*
 * 알림함 (기획 16장 A1)
 *  해야 할 일 — 기한이 있고, 끝내야 사라짐: 1순위 서류 제출, 저장 공고 마감 임박
 *  소식       — 읽으면 끝: 결과 확정(낙찰·3위 안), 오늘 새 맞춤 공고
 * 알림 목록은 그때그때 만들고, 회원별 '읽음·제출했어요·체크한 서류'만 저장 (019 inbox_state, 없으면 이 기기)
 */

export type InboxKind = 'action' | 'news';
export type InboxIcon = 'trophy' | 'clock' | 'win' | 'result' | 'new' | 'org' | 'soon' | 'change';

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
  /** 바로 끝낼 수 있는 해야 할 일의 버튼 이름 (예: 확인했어요) */
  doneLabel?: string;
}

/** 저장한 기관 (021) — watch: 저장할 때 본 진행 중 계약 */
export interface SavedOrg { org: string; kind: string | null; watch: { id: string; title: string; end: string }[] }
const ORG_LOCAL = 'bc3:orgs';
/** 계약 끝나기 이만큼 전부터 알림 */
export const ORG_END_DAYS = 60;

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
  savedOrgs: SavedOrg[];
  isSavedOrg: (org: string) => boolean;
  /** 저장/해제. watch를 주면 저장(또는 갱신) */
  saveOrg: (o: SavedOrg) => void;
  unsaveOrg: (org: string) => void;
  state: (key: string) => ItemState;
  markRead: (keys: string[]) => void;
  setDone: (key: string, done: boolean) => void;
  toggleCheck: (key: string, check: string) => void;
  loading: boolean;
}

const InboxContext = createContext<InboxValue | null>(null);

export function InboxProvider({ children }: { children: ReactNode }) {
  const { account, profile, saved, savedChanges, notices, stats } = useStore();
  const judged = useJudged();
  const verified = !!account && !!profile.corpName;
  const [firstRanks, setFirstRanks] = useState<FirstRank[]>([]);
  const [bids, setBids] = useState<MyBidItem[]>([]);
  const [st, setSt] = useState<Record<string, ItemState>>({});
  const [server, setServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<SavedOrg[]>([]);
  // 곧 나올 공고(사전규격, 022) — 화면이 먼저 뜨도록 조금 늦게 받음
  const [pre, setPre] = useState<Prespec[] | null>(null);
  useEffect(() => {
    if (!account || !profile.products?.length) { setPre(null); return; }
    const t = setTimeout(() => { fetchPrespecs().then(setPre).catch(() => setPre(null)); }, 2500);
    return () => clearTimeout(t);
  }, [account, profile.products]);
  const [orgServer, setOrgServer] = useState(false);
  // 저장 공고의 참가자격 등록 마감 — 입찰 마감 3일 안쪽 공고만 받음
  const [qual, setQual] = useState<Map<number, Date>>(new Map());
  const soonIds = useMemo(() => (notices ?? []).filter((n) => saved.includes(n.id) && n.d >= 0 && n.d <= 3).map((n) => n.id).sort((a, b) => a - b).join(','), [notices, saved]);
  useEffect(() => {
    if (!account || !soonIds || !supabaseEnabled) { setQual(new Map()); return; }
    fetchQualifyBy(soonIds.split(',').map(Number)).then(setQual).catch(() => setQual(new Map()));
  }, [account, soonIds]);

  // 저장한 기관 — 서버(021) 우선, 없으면 이 기기
  useEffect(() => {
    const local = () => { try { return JSON.parse(localStorage.getItem(ORG_LOCAL) ?? '[]') as SavedOrg[]; } catch { return []; } };
    if (!account || !supabaseEnabled) { setOrgServer(false); setOrgs(account ? local() : []); return; }
    getSupabase().from('saved_orgs').select('org,kind,watch').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) { setOrgServer(false); setOrgs(local()); return; }
      setOrgServer(true);
      setOrgs((data ?? []).map((r) => ({ org: r.org, kind: r.kind, watch: Array.isArray(r.watch) ? r.watch : [] })));
    });
  }, [account]);

  const writeOrgs = useCallback((f: (cur: SavedOrg[]) => SavedOrg[]) => {
    setOrgs((cur) => {
      const next = f(cur);
      if (!orgServer) { try { localStorage.setItem(ORG_LOCAL, JSON.stringify(next)); } catch { /* 저장소를 못 써도 동작 */ } }
      return next;
    });
  }, [orgServer]);
  const saveOrg = useCallback((o: SavedOrg) => {
    // 이미 저장된 기관은 자리 유지(목록 갱신), 새 기관은 맨 앞
    writeOrgs((cur) => cur.some((x) => x.org === o.org) ? cur.map((x) => (x.org === o.org ? o : x)) : [o, ...cur]);
    if (orgServer && account) void getSupabase().from('saved_orgs').upsert({ user_id: account.id, org: o.org, kind: o.kind, watch: o.watch, updated_at: new Date().toISOString() });
  }, [writeOrgs, orgServer, account]);
  const unsaveOrg = useCallback((org: string) => {
    writeOrgs((cur) => cur.filter((x) => x.org !== org));
    if (orgServer && account) void getSupabase().from('saved_orgs').delete().eq('user_id', account.id).eq('org', org);
  }, [writeOrgs, orgServer, account]);

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
    // 2-0) 저장한 공고의 참가자격 등록 마감 (오늘·내일, 입찰 마감보다 1시간 넘게 먼저일 때) — 놓치면 투찰 자체가 안 됨
    for (const n of notices ?? []) {
      const q = qual.get(n.id);
      if (!q || !saved.includes(n.id) || q.getTime() < Date.now() || n.closesAt.getTime() - q.getTime() < 3600e3) continue;
      const day = Math.round((new Date(kstDay(q)).getTime() - new Date(kstDay()).getTime()) / 86400e3);
      if (day > 1) continue;
      const hm = new Date(q.getTime() + 9 * 3600e3).toISOString().slice(11, 16);
      out.push({ key: `qual:${n.id}`, kind: 'action', icon: 'clock', title: `참가자격 등록이 ${day === 0 ? '오늘' : '내일'} ${hm}에 마감돼요`,
        sub: `${n.title} · 입찰 마감보다 먼저예요. 이 품목·업종이 나라장터 업체정보에 등록돼 있는지 확인하세요`, href: `/bids/${n.id}`, due: q, at: q, doneLabel: '확인했어요' });
    }
    // 2-0-1) 저장한 공고의 기초금액이 공개됨 (최근 3일, 026) — 그때부터 투찰금액을 계산할 수 있음
    for (const n of notices ?? []) {
      const at = n.baseOpenAt;
      if (!at || !n.basePrice || !saved.includes(n.id) || n.d < 0 || at.getTime() > Date.now() || Date.now() - at.getTime() > 3 * 86400e3) continue;
      out.push({ key: `base:${n.id}`, kind: 'news', icon: 'new', title: '저장한 공고의 기초금액이 나왔어요',
        sub: `${n.title} · 기초금액 ${fmtKorean(n.basePrice)} — 이제 투찰금액을 계산할 수 있어요`, href: calcHref(n), due: null, at });
    }
    // 2-1) 저장한 공고가 정정·취소됨 — 정정은 [확인했어요]로 끝내는 해야 할 일, 취소는 소식
    for (const c of savedChanges) {
      const at = new Date(c.at);
      if (c.cancelled) {
        out.push({ key: `chg:${c.from}`, kind: 'news', icon: 'change', title: '저장한 공고가 취소됐어요', sub: `${c.title} · 저장 목록에서 뺐어요`, href: `/bids/${c.from}`, due: null, at });
        continue;
      }
      const n = notices?.find((x) => x.id === c.to);
      out.push({ key: `chg:${c.from}`, kind: 'action', icon: 'change', title: '저장한 공고가 정정됐어요',
        sub: `${c.diff.length ? c.diff.join(' · ') : '첨부·조건이 바뀌었을 수 있어요. 공고문을 확인하세요'} · ${c.title}`,
        href: `/bids/${c.to}`, due: n && n.d >= 0 ? n.closesAt : null, at, doneLabel: '확인했어요' });
    }
    // 3) 결과 확정 — 최근 14일. 낙찰·순위·하한 미달 모두 (2026-11-18: 결과마다 '한 줄 복기'로 이어짐)
    const since = Date.now() - 14 * 86400e3;
    for (const b of bids) {
      if (new Date(b.opened_at).getTime() < since) continue;
      const o = bidOutcome(b);
      if (o === 'won') out.push({ key: `result:${b.id}`, kind: 'news', icon: 'win', title: '낙찰됐어요 🎉', sub: b.title, href: `/analysis/${b.id}`, due: null, at: new Date(b.opened_at) });
      else if (o === 'lost' || o === 'below') out.push({ key: `result:${b.id}`, kind: 'news', icon: 'result',
        title: o === 'below' ? '결과가 나왔어요 · 하한 미달' : `결과가 나왔어요${b.rank ? ` · ${b.rank}위` : ''}`,
        sub: `얼마 차이였는지 복기 보기 · ${b.title}`, href: `/analysis/${b.id}`, due: null, at: new Date(b.opened_at) });
    }
    // 4) 저장한 기관 — 진행 중 계약이 곧 끝남 (해야 할 일, [확인했어요]로 끝냄)
    const now = Date.now();
    for (const o of orgs) {
      for (const w of o.watch) {
        const end = new Date(`${w.end}T23:59:59+09:00`);
        const left = (end.getTime() - now) / 86400e3;
        if (left < 0 || left > ORG_END_DAYS) continue;
        out.push({ key: `orgend:${o.org}:${w.id}`, kind: 'action', icon: 'org', title: '저장한 기관의 계약이 곧 끝나요', sub: `${o.org} · ${w.title}`,
          href: `/analysis?tab=sales&org=${encodeURIComponent(o.org)}`, due: end, at: new Date(end.getTime() - ORG_END_DAYS * 86400e3), doneLabel: '확인했어요' });
      }
    }
    // 5) 저장한 기관이 새 공고를 냄 (최근 7일 게시, 마감 전)
    if (orgs.length) {
      const names = new Set(orgs.map((o) => o.org));
      for (const n of notices ?? []) {
        if (n.d < 0 || now - n.postedAt.getTime() > 7 * 86400e3) continue;
        const hit = [n.demandOrg, n.org].find((x) => x && names.has(x));
        if (!hit) continue;
        out.push({ key: `orgnew:${n.id}`, kind: 'news', icon: 'org', title: '저장한 기관이 새 공고를 냈어요', sub: `${hit} · ${n.title}`, href: `/bids/${n.id}`, due: null, at: n.postedAt });
      }
    }
    // 6) 곧 나올 맞춤 공고 — 최근 24시간에 새로 공개된 사전규격 중 우리 일과 맞는 것
    if (pre) {
      const fresh = matchPrespecs(pre, profile, stats).filter((m) => m.p.receivedAt && now - m.p.receivedAt.getTime() <= 86400e3 && m.p.status !== 'noticed')
        .sort((a, b) => (b.p.budget ?? 0) - (a.p.budget ?? 0));
      if (fresh.length) {
        const top = fresh[0].p;
        out.push({ key: `soon:${kstDay()}`, kind: 'news', icon: 'soon', title: `곧 나올 맞춤 공고 ${fresh.length}건`,
          sub: `${top.title}${fresh.length > 1 ? ` 외 ${fresh.length - 1}건` : ''} · 공고 전에 규격서를 볼 수 있어요`, href: '/bids?tab=soon', due: null, at: top.receivedAt! });
      }
    }
    // 7) 오늘 새 맞춤 공고
    const fresh = (judged ?? []).filter((j) => j.matched && j.notice.isNew && !isCatalog(j.notice)).length;
    if (fresh > 0) out.push({ key: `new:${kstDay()}`, kind: 'news', icon: 'new', title: `오늘 새 맞춤 공고 ${fresh}건`, sub: '맞춤 점수 높은 순으로 볼 수 있어요', href: '/bids?sort=latest', due: null, at: new Date() });
    return out.sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [account, firstRanks, notices, saved, savedChanges, qual, bids, judged, orgs, pre, profile, stats]);

  const value = useMemo<InboxValue>(() => {
    const actions = items.filter((i) => i.kind === 'action' && !state(i.key).done_at)
      .sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
    const news = items.filter((i) => i.kind === 'news');
    const unread = [...actions, ...news].filter((i) => !state(i.key).read_at).length;
    return {
      items, actions, news, unread, firstRanks, state, loading,
      savedOrgs: orgs, isSavedOrg: (org) => orgs.some((o) => o.org === org), saveOrg, unsaveOrg,
      markRead: (keys) => keys.forEach((k) => { const s = state(k); if (!s.read_at) persist(k, { ...s, read_at: new Date().toISOString() }); }),
      setDone: (k, done) => { const s = state(k); persist(k, { ...s, read_at: s.read_at ?? new Date().toISOString(), done_at: done ? new Date().toISOString() : null }); },
      toggleCheck: (k, c) => { const s = state(k); const set = new Set(s.checks); if (set.has(c)) set.delete(c); else set.add(c); persist(k, { ...s, checks: [...set] }); },
    };
  }, [items, state, persist, firstRanks, loading, orgs, saveOrg, unsaveOrg]);

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>;
}

export function useInbox(): InboxValue {
  const v = useContext(InboxContext);
  if (!v) throw new Error('InboxProvider가 필요합니다');
  return v;
}
