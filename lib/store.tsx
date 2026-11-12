'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMPTY_PROFILE, type Notice, type Profile } from './data';
import { authErrorText, loadMember, saveProfile, setSaved as setSavedRemote, uploadLocal } from './db';
import { judge, relevance, type Judgment } from './judge';
import { fetchCompetition, fetchOpenNotices, type Competition } from './notices';
import { fetchMyHistory, prepareHistory, similarity, type HistoryItem, type Similarity } from './analysis';
import { fitScore, type Fit } from './fit';
import { buildStats, type Stats } from './stats';
import { isRelevant, productMatch, relevanceOf, type ProductMatch, type RelevanceReason } from './match';
import { getSupabase, supabaseEnabled } from './supabase';

/*
 * 앱 상태 — 프로필, 계정, 저장 공고.
 * 가입 전: 브라우저 저장소(localStorage)에만 보관
 * 가입 후: Supabase가 원본, 브라우저 저장소는 빠른 첫 화면용 사본
 */

interface Account {
  id: string;
  email: string;
}

type AuthResult = { error: string | null };

interface Store {
  /** 저장소·로그인 상태를 읽기 전에는 false — 첫 화면 깜빡임 방지용 */
  loaded: boolean;
  profile: Profile;
  /** 간편 시작(업종·지역)을 마쳤는지 */
  started: boolean;
  setProfile: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  account: Account | null;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult & { started: boolean }>;
  signOut: () => Promise<void>;
  saved: number[];
  toggleSaved: (id: number) => boolean;
  reset: () => void;
  /** 회사 확인 회원의 개찰 이력 (F7) — 없으면 빈 배열 */
  history: HistoryItem[];
  /** 기관·유형별 경쟁 강도 (013 전이면 null) */
  competition: Competition | null;
  /** 공고 말뭉치 통계 (맞춤 점수 v4) */
  stats: Stats | null;
  /** 마감 전 공고 (Supabase) — null: 불러오는 중 */
  notices: Notice[] | null;
  noticesError: string | null;
  /** 서버 저장 실패 메시지 — 화면에서 토스트로 알림 */
  syncError: string | null;
  clearSyncError: () => void;
}

const StoreContext = createContext<Store | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('bc3:' + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem('bc3:' + key);
    else localStorage.setItem('bc3:' + key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경에서는 무시 */
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfileState] = useState<Profile>(EMPTY_PROFILE);
  const [account, setAccount] = useState<Account | null>(null);
  const [saved, setSavedState] = useState<number[]>([]);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [noticesError, setNoticesError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [competition, setCompetition] = useState<Competition | null>(null);
  // 공고 말뭉치 통계 — 흔한 품목·업종·낱말일수록 배점을 낮추는 데 씀 (맞춤 점수 v4)
  const stats = useMemo(() => (notices?.length ? buildStats(notices) : null), [notices]);
  useEffect(() => { if (supabaseEnabled) fetchCompetition().then(setCompetition).catch(() => setCompetition(null)); }, []);
  // 비동기 작업에서 최신 값을 쓰기 위한 참조
  const profileRef = useRef(profile);
  const savedRef = useRef(saved);
  const accountRef = useRef(account);

  const applyProfile = useCallback((p: Profile) => {
    profileRef.current = p;
    setProfileState(p);
    write('profile', p);
  }, []);

  const applySaved = useCallback((ids: number[]) => {
    savedRef.current = ids;
    setSavedState(ids);
    write('saved', ids);
  }, []);

  const applyAccount = useCallback((a: Account | null) => {
    accountRef.current = a;
    setAccount(a);
  }, []);

  /** 서버 쓰기 — 실패해도 화면은 유지하고 오류만 알림 */
  const sync = useCallback((task: (userId: string) => Promise<void>) => {
    const a = accountRef.current;
    if (!a) return;
    task(a.id).catch((e: Error) => setSyncError(`서버에 저장하지 못했습니다: ${e.message}`));
  }, []);

  /** 로그인한 회원의 서버 데이터를 불러옴. 서버에 프로필이 없으면 브라우저 데이터를 올림 */
  const loadAccount = useCallback(
    async (a: Account) => {
      applyAccount(a);
      const remote = await loadMember(a.id);
      if (remote.profile) {
        applyProfile(remote.profile);
        applySaved(remote.saved);
      } else if (profileRef.current.industries !== null && profileRef.current.location) {
        await uploadLocal(a.id, profileRef.current, savedRef.current);
      }
    },
    [applyAccount, applyProfile, applySaved],
  );

  useEffect(() => {
    applyProfile({ ...EMPTY_PROFILE, ...read<Partial<Profile>>('profile', {}) });
    applySaved(read<number[]>('saved', []));
    if (!supabaseEnabled) {
      setNotices([]);
      setNoticesError('서버 연결 설정이 없어 공고를 불러올 수 없습니다');
      setLoaded(true);
      return;
    }
    fetchOpenNotices()
      .then(setNotices)
      .catch((e: Error) => {
        setNotices([]);
        setNoticesError(`공고를 불러오지 못했습니다: ${e.message}`);
      });
    getSupabase()
      .auth.getSession()
      .then(async ({ data }) => {
        const u = data.session?.user;
        if (u) await loadAccount({ id: u.id, email: u.email ?? '' });
      })
      .catch((e: Error) => setSyncError(`로그인 정보를 불러오지 못했습니다: ${e.message}`))
      .finally(() => setLoaded(true));
  }, [applyProfile, applySaved, loadAccount]);

  // 회사 확인을 마친 회원이면 개찰 이력을 불러와 추천 순서에 반영 (F7-4)
  useEffect(() => {
    if (!account || !profile.corpName || !supabaseEnabled) {
      setHistory([]);
      return;
    }
    fetchMyHistory().then(setHistory).catch(() => setHistory([]));
  }, [account, profile.corpName]);

  const setProfile = useCallback(
    (p: Profile) => {
      applyProfile(p);
      sync((id) => saveProfile(id, p));
    },
    [applyProfile, sync],
  );

  const updateProfile = useCallback(
    (patch: Partial<Profile>) => setProfile({ ...profileRef.current, ...patch }),
    [setProfile],
  );

  const toggleSaved = useCallback(
    (noticeId: number) => {
      const on = !savedRef.current.includes(noticeId);
      applySaved(on ? [...savedRef.current, noticeId] : savedRef.current.filter((x) => x !== noticeId));
      sync((id) => setSavedRemote(id, noticeId, on));
      return on;
    },
    [applySaved, sync],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabaseEnabled) return { error: '서버 연결 설정이 없어 가입할 수 없습니다' };
      const { data, error } = await getSupabase().auth.signUp({ email, password });
      if (error) return { error: authErrorText(error.message) };
      // 이메일 인증을 켠 프로젝트에서는 세션 없이 돌아옴
      if (!data.session || !data.user) return { error: '가입 메일을 보냈습니다. 메일함에서 인증한 뒤 로그인해 주세요' };
      const a = { id: data.user.id, email: data.user.email ?? email };
      applyAccount(a);
      try {
        await uploadLocal(a.id, profileRef.current, savedRef.current);
      } catch (e) {
        setSyncError(`가입은 됐지만 입력한 정보를 서버에 옮기지 못했습니다: ${(e as Error).message}`);
      }
      return { error: null };
    },
    [applyAccount],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabaseEnabled) return { error: '서버 연결 설정이 없어 로그인할 수 없습니다', started: false };
      const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
      if (error) return { error: authErrorText(error.message), started: false };
      try {
        await loadAccount({ id: data.user.id, email: data.user.email ?? email });
      } catch (e) {
        return { error: `로그인했지만 정보를 불러오지 못했습니다: ${(e as Error).message}`, started: false };
      }
      const p = profileRef.current;
      return { error: null, started: !!(p.industries !== null && p.location) };
    },
    [loadAccount],
  );

  const reset = useCallback(() => {
    applyProfile(EMPTY_PROFILE);
    applySaved([]);
    ['profile', 'saved'].forEach((k) => write(k, null));
  }, [applyProfile, applySaved]);

  /** 로그아웃 — 같은 기기를 다른 사람이 쓸 수 있으므로 브라우저 사본도 지움 */
  const signOut = useCallback(async () => {
    if (supabaseEnabled) await getSupabase().auth.signOut();
    applyAccount(null);
    reset();
  }, [applyAccount, reset]);

  const value = useMemo<Store>(
    () => ({
      loaded,
      profile,
      started: !!(profile.industries !== null && profile.location),
      setProfile,
      updateProfile,
      account,
      signUp,
      signIn,
      signOut,
      saved,
      toggleSaved,
      reset,
      notices,
      noticesError,
      history,
      competition,
      stats,
      syncError,
      clearSyncError: () => setSyncError(null),
    }),
    [loaded, profile, setProfile, updateProfile, account, signUp, signIn, signOut, saved, toggleSaved, reset, notices, noticesError, history, competition, stats, syncError],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider가 필요합니다');
  return s;
}

export interface Judged {
  notice: Notice;
  judgment: Judgment;
  relevance: number;
  /** 과거 입찰 이력과의 유사도 (이력이 있는 회원만) */
  similar: Similarity | null;
  /** 적합도 — 우리 회사와 맞는 정도 (참여 불가 공고는 null) */
  fit: Fit | null;
  /** 회사 품목과 공고 품목의 일치 */
  product: ProductMatch | null;
  /** 관련성 — 'none'이면 '다른 참여 가능 공고'로 접음 */
  rel: RelevanceReason;
  /** 맞춤 공고 = 참여 가능 + 관련 있음 */
  matched: boolean;
}

/** 마감 전 공고 전체를 현재 프로필로 판정 — 공고를 불러오는 중이면 null */
export function useJudged(): Judged[] | null {
  const { profile, notices, history, competition, stats } = useStore();
  const hist = useMemo(() => prepareHistory(history), [history]);
  return useMemo(
    () =>
      notices?.map((notice) => {
        const judgment = judge(notice, profile);
        const similar = hist.length ? similarity(notice, hist, stats) : null;
        // 이력과 닮은 공고를 위로 (유사도는 순서에만 쓰고 판정에는 쓰지 않음)
        const boost = similar ? Math.min(40, similar.score * 40) : 0;
        const product = productMatch(notice, profile.products, stats);
        const fit = fitScore(notice, profile, judgment, similar, history, product, competition, stats);
        let rel = relevanceOf(notice, profile, judgment, product, similar);
        // 맞춤 점수 v4 관문 — 흔한 품목·업종만 맞는 공고는 '다른 참여 가능'으로 (꼭 볼 단어는 예외)
        if (fit && !fit.gate && isRelevant(rel) && rel !== 'keyword') rel = 'weak';
        return {
          notice, judgment, relevance: relevance(notice, profile, judgment) + boost + (product ? product.sim * 40 : 0),
          similar, fit, product, rel, matched: judgment.status === 'eligible' && isRelevant(rel),
        };
      }) ?? null,
    [profile, notices, hist, history, competition, stats],
  );
}
