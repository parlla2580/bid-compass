'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, BadgeCheck, Building2, Compass, Loader2 } from 'lucide-react';
import { IndustryPicker, LocationPicker } from '@/components/inputs';
import { BTN_OUTLINE, BTN_PRIMARY, INPUT_CLS } from '@/components/ui';
import type { Industry } from '@/lib/data';
import { maskBizNo } from '@/lib/format';
import { useStore } from '@/lib/store';

interface Lookup {
  registered: boolean;
  corpName?: string | null;
  location?: string | null;
  industries?: Industry[];
}

type Mode = 'bizno' | 'confirm' | 'manual';

/** S1. 간편 시작 (F1-1, v2.1) — 사업자번호(선택) → 나라장터 등록 업체는 자동, 아니면 업종·소재지 직접 입력 */
export default function StartPage() {
  const router = useRouter();
  const { loaded, profile, updateProfile } = useStore();
  const [mode, setMode] = useState<Mode>('bizno');
  const [bizno, setBizno] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Lookup | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [location, setLocation] = useState<string | null>(null);

  // 이미 입력한 값이 있으면 직접 입력 화면에 채워 둠
  useEffect(() => {
    if (!loaded) return;
    if (profile.industries) setIndustries(profile.industries);
    if (profile.location) setLocation(profile.location);
    if (profile.bizno) setBizno(maskBizNo(profile.bizno));
  }, [loaded, profile.industries, profile.location, profile.bizno]);

  const lookup = async () => {
    const digits = bizno.replace(/\D/g, '');
    if (digits.length !== 10) return setError('사업자등록번호 10자리를 입력해 주세요');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/company?bizno=${digits}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '조회에 실패했습니다');
      if (!data.registered) {
        setError('나라장터에 등록된 정보가 없습니다. 업종과 소재지를 직접 입력해 주세요.');
        setMode('manual');
        return;
      }
      setFound(data);
      setMode('confirm');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const go = (patch: Parameters<typeof updateProfile>[0]) => {
    updateProfile(patch);
    router.push('/recommend');
  };

  const confirm = () => {
    if (!found) return;
    // 물품 공급 업체는 등록업종이 없을 수 있음 → 업종 직접 선택으로 이어감
    if (!found.industries?.length || !found.location) {
      setIndustries(found.industries ?? []);
      setLocation(found.location ?? null);
      setMode('manual');
      setError(!found.industries?.length
        ? '나라장터에 등록된 업종이 없습니다. 주로 하시는 업종을 선택해 주세요.'
        : '소재지를 확인하지 못했습니다. 직접 선택해 주세요.');
      return;
    }
    go({
      bizno: bizno.replace(/\D/g, ''), naraRegistered: true, corpName: found.corpName ?? null,
      industries: found.industries, location: found.location,
    });
  };

  const manualReady = !!location;

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-slate-50 px-5 md:border-x md:border-slate-200 md:shadow-md">
      <section className="pb-7 pt-14">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-md">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold leading-snug tracking-tight">
          우리 회사가
          <br />
          <span className="text-primary">참여할 수 있는 공고</span>를 골라 드릴게요.
        </h1>
        <p className="mt-2 text-sm text-slate-500">가입 없이 바로 볼 수 있어요. 무료입니다.</p>
      </section>

      {mode === 'bizno' && (
        <section className="fade-up space-y-4">
          <div>
            <label htmlFor="bizno" className="mb-1.5 block text-sm font-bold text-slate-700">사업자등록번호</label>
            <div className="flex gap-2">
              <input id="bizno" inputMode="numeric" placeholder="000-00-00000" maxLength={12} value={bizno}
                onChange={(e) => setBizno(maskBizNo(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && lookup()}
                className={INPUT_CLS + ' flex-1'} />
              <button type="button" onClick={lookup} disabled={busy}
                className="flex shrink-0 items-center gap-1 rounded-btn bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700 disabled:bg-slate-400">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}조회
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-400">나라장터에 등록된 업체는 소재지와 등록업종을 자동으로 불러옵니다.</p>
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-3 py-2 text-xs text-slate-400">
            <span className="h-px flex-1 bg-slate-200" />또는<span className="h-px flex-1 bg-slate-200" />
          </div>
          <button type="button" onClick={() => { setError(null); setMode('manual'); }} className={BTN_OUTLINE}>
            번호 없이 업종·지역으로 시작
          </button>
        </section>
      )}

      {mode === 'confirm' && found && (
        <section className="fade-up space-y-4">
          <div className="rounded-card border border-blue-100 bg-white p-4 shadow-md">
            <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-primary"><BadgeCheck className="h-4 w-4" />나라장터 등록 업체</div>
            <p className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5 text-slate-400" />{found.corpName}</p>
            <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-2 text-sm">
              <dt className="text-slate-500">소재지</dt><dd className="font-medium">{found.location ?? '확인 안 됨'}</dd>
              <dt className="text-slate-500">등록업종</dt>
              <dd>
                {found.industries?.length
                  ? <span className="flex flex-wrap gap-1">{found.industries.slice(0, 8).map((i) => <span key={i.code} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{i.name}</span>)}{found.industries.length > 8 && <span className="text-xs text-slate-400">외 {found.industries.length - 8}개</span>}</span>
                  : <span className="text-amber-600">등록된 업종 없음</span>}
              </dd>
            </dl>
          </div>
          <p className="text-xs text-slate-500">나라장터 공개 정보입니다. 본인 회사가 맞는지 확인해 주세요.</p>
          <button type="button" onClick={confirm} className={BTN_PRIMARY}>네, 우리 회사가 맞아요<ArrowRight className="h-5 w-5" /></button>
          <button type="button" onClick={() => { setFound(null); setMode('bizno'); }} className="w-full py-2 text-sm font-medium text-slate-500">다른 번호로 조회</button>
        </section>
      )}

      {mode === 'manual' && (
        <section className="fade-up space-y-6">
          {error && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{error}</p>}
          <div>
            <h2 className="mb-2.5 text-sm font-bold text-slate-700"><span className="mr-1.5 text-primary">1</span>어떤 업종인가요?</h2>
            <IndustryPicker value={industries} onChange={setIndustries} />
          </div>
          <div>
            <h2 className="mb-2.5 text-sm font-bold text-slate-700"><span className="mr-1.5 text-primary">2</span>사업장은 어디에 있나요?</h2>
            <LocationPicker value={location} onChange={setLocation} />
            <p className="mt-1.5 text-xs text-slate-400">시군구까지 고르면 지역제한 공고를 더 정확히 판정합니다.</p>
          </div>
          <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-slate-50 via-slate-50 to-slate-50/0 px-5 pb-6 pt-3">
            <button type="button" disabled={!manualReady || !industries.length}
              onClick={() => go({ industries, location, bizno: bizno.replace(/\D/g, '') || null, naraRegistered: found ? true : profile.naraRegistered })}
              className={BTN_PRIMARY}>
              내 공고 보기<ArrowRight className="h-5 w-5" />
            </button>
            <button type="button" disabled={!manualReady} onClick={() => go({ industries: [], location })}
              className="mt-2 w-full py-2 text-xs font-medium text-slate-500 disabled:text-slate-300">
              업종 없이 지역만으로 보기
            </button>
            <button type="button" onClick={() => { setError(null); setMode('bizno'); }} className="w-full py-1 text-xs text-slate-400">사업자등록번호로 조회하기</button>
          </div>
        </section>
      )}

      <p className="mt-auto pb-8 pt-6 text-center text-sm text-slate-500">
        이미 가입하셨나요?<Link href="/login" className="ml-1 font-bold text-primary hover:underline">로그인</Link>
      </p>
    </div>
  );
}
