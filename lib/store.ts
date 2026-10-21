'use client';

import { useCallback, useEffect, useState } from 'react';
import { COMPANY, DEFAULT_PROFILE, DEFAULT_SAVED, type Company, type Profile } from './data';

/*
 * 브라우저 저장소(localStorage) 기반 상태.
 * 3단계(Supabase 연동)에서 서버 저장으로 교체할 부분입니다.
 */

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem('bc:' + key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem('bc:' + key, JSON.stringify(value));
  } catch {
    /* 저장 불가 환경에서는 무시 */
  }
}

/** 서버 렌더링 시에는 fallback, 마운트 후 저장값으로 갱신 */
function useStored<T>(key: string, fallback: T, merge?: (stored: T) => T) {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    const stored = read(key, fallback);
    setValue(merge ? merge(stored) : stored);
    // fallback·merge는 상수로 넘기므로 key 기준으로만 동기화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      write(key, next);
    },
    [key],
  );

  return [value, update] as const;
}

const mergeProfile = (p: Profile) => ({ ...DEFAULT_PROFILE, ...p });
const mergeCompany = (c: Company) => ({ ...COMPANY, ...c });

export const useProfile = () => useStored<Profile>('profile', DEFAULT_PROFILE, mergeProfile);
export const useCompany = () => useStored<Company>('company', COMPANY, mergeCompany);
export const useSaved = () => useStored<number[]>('saved', DEFAULT_SAVED);
