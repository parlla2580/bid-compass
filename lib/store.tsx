'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EMPTY_PROFILE, OPEN_NOTICES, type Notice, type Profile } from './data';
import { authErrorText, loadMember, saveProfile, setSaved as setSavedRemote, uploadLocal } from './db';
import { judge, relevance, type Judgment } from './judge';
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
  /** 서버 저장 실패 메시지 — 화면에서 토스트로 알림 */
  syncError: string | null;
  clearSyncError: () => void;
}

const StoreContext = createContext<Store | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('bc2:' + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem('bc2:' + key);
    else localStorage.setItem('bc2:' + key, JSON.stringify(value));
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
      } else if (profileRef.current.industry && profileRef.current.location) {
        await uploadLocal(a.id, profileRef.current, savedRef.current);
      }
    },
    [applyAccount, applyProfile, applySaved],
  );

  useEffect(() => {
    applyProfile({ ...EMPTY_PROFILE, ...read<Partial<Profile>>('profile', {}) });
    applySaved(read<number[]>('saved', []));
    if (!supabaseEnabled) {
      setLoaded(true);
      return;
    }
    getSupabase()
      .auth.getSession()
      .then(async ({ data }) => {
        const u = data.session?.user;
        if (u) await loadAccount({ id: u.id, email: u.email ?? '' });
      })
      .catch((e: Error) => setSyncError(`로그인 정보를 불러오지 못했습니다: ${e.message}`))
      .finally(() => setLoaded(true));
  }, [applyProfile, applySaved, loadAccount]);

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
      return { error: null, started: !!(p.industry && p.location) };
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
      started: !!(profile.industry && profile.location),
      setProfile,
      updateProfile,
      account,
      signUp,
      signIn,
      signOut,
      saved,
      toggleSaved,
      reset,
      syncError,
      clearSyncError: () => setSyncError(null),
    }),
    [loaded, profile, setProfile, updateProfile, account, signUp, signIn, signOut, saved, toggleSaved, reset, syncError],
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
}

/** 마감 전 공고 전체를 현재 프로필로 판정 — 프로필이 바뀌면 다시 계산 */
export function useJudged(): Judged[] {
  const { profile } = useStore();
  return useMemo(
    () => OPEN_NOTICES.map((notice) => ({ notice, judgment: judge(notice, profile), relevance: relevance(notice, profile) })),
    [profile],
  );
}
