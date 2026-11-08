'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EMPTY_PROFILE, OPEN_NOTICES, type Notice, type Profile } from './data';
import { judge, relevance, type Judgment } from './judge';

/*
 * 앱 상태 — 프로필, 계정, 저장 공고.
 * 지금은 브라우저 저장소(localStorage)에 두고, Supabase 연동 단계에서 서버 저장으로 교체합니다.
 */

interface Account {
  email: string;
}

interface Store {
  /** 저장소를 읽기 전에는 false — 첫 화면 깜빡임 방지용 */
  loaded: boolean;
  profile: Profile;
  /** 간편 시작(업종·지역)을 마쳤는지 */
  started: boolean;
  setProfile: (p: Profile) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  account: Account | null;
  setAccount: (a: Account | null) => void;
  saved: number[];
  toggleSaved: (id: number) => boolean;
  reset: () => void;
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
  const [account, setAccountState] = useState<Account | null>(null);
  const [saved, setSavedState] = useState<number[]>([]);

  useEffect(() => {
    setProfileState({ ...EMPTY_PROFILE, ...read<Partial<Profile>>('profile', {}) });
    setAccountState(read<Account | null>('account', null));
    setSavedState(read<number[]>('saved', []));
    setLoaded(true);
  }, []);

  const setProfile = useCallback((p: Profile) => {
    setProfileState(p);
    write('profile', p);
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    setProfileState((prev) => {
      const next = { ...prev, ...patch };
      write('profile', next);
      return next;
    });
  }, []);

  const setAccount = useCallback((a: Account | null) => {
    setAccountState(a);
    write('account', a);
  }, []);

  const toggleSaved = useCallback(
    (id: number) => {
      const on = !saved.includes(id);
      const next = on ? [...saved, id] : saved.filter((x) => x !== id);
      setSavedState(next);
      write('saved', next);
      return on;
    },
    [saved],
  );

  const reset = useCallback(() => {
    setProfileState(EMPTY_PROFILE);
    setAccountState(null);
    setSavedState([]);
    ['profile', 'account', 'saved'].forEach((k) => write(k, null));
  }, []);

  const value = useMemo<Store>(
    () => ({
      loaded,
      profile,
      started: !!(profile.industry && profile.location),
      setProfile,
      updateProfile,
      account,
      setAccount,
      saved,
      toggleSaved,
      reset,
    }),
    [loaded, profile, setProfile, updateProfile, account, setAccount, saved, toggleSaved, reset],
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
