'use client';

import { useRouter } from 'next/navigation';
import { useState, type KeyboardEvent } from 'react';
import { ArrowLeft, BadgeCheck } from 'lucide-react';
import { useToast } from '@/components/feedback';
import { PriceRange, RegionChips } from '@/components/inputs';
import { BTN_PRIMARY, INPUT_CLS } from '@/components/ui';
import { COMPANY, DEFAULT_PROFILE, INDUSTRY, type BidType } from '@/lib/data';
import { maskBizNo } from '@/lib/format';
import { useProfile } from '@/lib/store';

const TYPES: BidType[] = ['물품', '용역', '공사'];

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const [, saveProfile] = useProfile();
  const [step, setStep] = useState<1 | 2>(1);

  // Step 1
  const [bizNo, setBizNo] = useState(COMPANY.bizNo);
  const [looked, setLooked] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const pwOk = !pw2 || pw === pw2;

  // Step 2
  const p = DEFAULT_PROFILE;
  const [types, setTypes] = useState<BidType[]>(p.types);
  const [ind1, setInd1] = useState(p.industry[0]);
  const [ind2, setInd2] = useState(p.industry[1]);
  const [ind3, setInd3] = useState(p.industry[2]);
  const [records, setRecords] = useState('');
  const [tags, setTags] = useState<string[]>(p.licenses);
  const [tagInput, setTagInput] = useState('');
  const [regions, setRegions] = useState(p.regions);
  const [price, setPrice] = useState<[number, number]>([p.priceMin, p.priceMax]);

  const goStep = (n: 1 | 2) => {
    setStep(n);
    window.scrollTo({ top: 0 });
  };

  const lookup = () => {
    if (bizNo.replace(/\D/g, '').length !== 10) {
      toast('사업자등록번호 10자리를 입력해주세요');
      return;
    }
    setLooked(true);
  };

  const next = () => {
    if (!looked) return toast('사업자등록번호를 먼저 조회해주세요');
    if (!pwOk) return toast('비밀번호를 확인해주세요');
    goStep(2);
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = tagInput.trim().replace(/,$/, '');
      if (v && !tags.includes(v)) setTags([...tags, v]);
      setTagInput('');
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const done = () => {
    if (!types.length) return toast('관심 사업유형을 1개 이상 선택해주세요');
    saveProfile({ types, regions, priceMin: price[0], priceMax: price[1], licenses: tags, industry: [ind1, ind2, ind3], records });
    router.push('/');
  };

  const mids = Object.keys(INDUSTRY[ind1]);
  const leaves = INDUSTRY[ind1][ind2] ?? [];

  return (
    <div className="mx-auto min-h-screen max-w-[480px] bg-slate-50 md:border-x md:border-slate-200 md:shadow-md">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-2">
          <button type="button" aria-label="뒤로가기" onClick={() => (step === 2 ? goStep(1) : router.push('/login'))}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-bold">회원가입</span>
          <span className="ml-auto pr-3 text-sm font-semibold text-slate-500">
            <span className="text-primary">{step}</span> / 2
          </span>
        </div>
        <div className="h-1 bg-slate-100">
          <div className="h-1 bg-primary transition-all duration-300" style={{ width: step === 1 ? '50%' : '100%' }} />
        </div>
      </header>

      <main className="px-4 pb-10 pt-5">
        {step === 1 ? (
          <section key="s1" className="fade-up space-y-5">
            <div>
              <h1 className="text-xl font-bold">사업자 인증</h1>
              <p className="mt-1 text-sm text-slate-500">사업자등록번호로 기업 정보를 자동 조회합니다.</p>
            </div>

            <div>
              <label htmlFor="bizno" className="mb-1.5 block text-sm font-semibold text-slate-700">사업자등록번호</label>
              <div className="flex gap-2">
                <input id="bizno" inputMode="numeric" placeholder="000-00-00000" maxLength={12} value={bizNo}
                  onChange={(e) => setBizNo(maskBizNo(e.target.value))} className={INPUT_CLS + ' flex-1'} />
                <button type="button" onClick={lookup} className="shrink-0 rounded-btn bg-slate-800 px-4 text-sm font-bold text-white hover:bg-slate-700">
                  조회
                </button>
              </div>
            </div>

            {looked && (
              <div className="fade-up rounded-card border border-blue-100 bg-blue-50/60 p-4">
                <div className="mb-3 flex items-center gap-1.5 text-sm font-bold text-primary">
                  <BadgeCheck className="h-4 w-4" />
                  조회된 기업 정보
                </div>
                <dl className="grid grid-cols-[72px_1fr] gap-y-2 text-sm">
                  <dt className="text-slate-500">업체명</dt><dd className="font-semibold">{COMPANY.name}</dd>
                  <dt className="text-slate-500">대표자</dt><dd>{COMPANY.ceo}</dd>
                  <dt className="text-slate-500">업종</dt><dd>{COMPANY.industry}</dd>
                  <dt className="text-slate-500">사업장 주소</dt><dd>{COMPANY.address}</dd>
                </dl>
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">이메일</label>
              <input id="email" type="email" placeholder="name@company.co.kr" className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor="pw" className="mb-1.5 block text-sm font-semibold text-slate-700">비밀번호</label>
              <input id="pw" type="password" placeholder="8자 이상, 영문·숫자 조합" value={pw} onChange={(e) => setPw(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label htmlFor="pw2" className="mb-1.5 block text-sm font-semibold text-slate-700">비밀번호 확인</label>
              <input id="pw2" type="password" placeholder="비밀번호를 한 번 더 입력하세요" value={pw2} onChange={(e) => setPw2(e.target.value)} className={INPUT_CLS} />
              {pw2 && (
                <p className={`mt-1.5 text-xs ${pwOk ? 'text-green-600' : 'text-red-500'}`}>
                  {pwOk ? '비밀번호가 일치합니다' : '비밀번호가 일치하지 않습니다'}
                </p>
              )}
            </div>

            <button type="button" onClick={next} className={BTN_PRIMARY}>다음</button>
          </section>
        ) : (
          <section key="s2" className="fade-up space-y-6">
            <div>
              <h1 className="text-xl font-bold">기업 프로필 설정</h1>
              <p className="mt-1 text-sm text-slate-500">입력한 정보로 맞춤 공고를 추천해드려요.</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-slate-700">관심 사업유형</legend>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map((t) => {
                  const on = types.includes(t);
                  return (
                    <label key={t}
                      className={`flex h-12 cursor-pointer items-center justify-center gap-1.5 rounded-btn border text-[15px] font-semibold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-300 ${on ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 bg-white text-slate-500'}`}>
                      <input type="checkbox" className="sr-only" checked={on}
                        onChange={() => setTypes(on ? types.filter((x) => x !== t) : TYPES.filter((x) => x === t || types.includes(x)))} />
                      {on && <span className="font-extrabold">✓</span>}
                      {t}
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-700">주요 업종</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select aria-label="대분류" value={ind1} className={INPUT_CLS}
                  onChange={(e) => {
                    const a = e.target.value, b = Object.keys(INDUSTRY[a])[0];
                    setInd1(a); setInd2(b); setInd3(INDUSTRY[a][b][0]);
                  }}>
                  {Object.keys(INDUSTRY).map((v) => <option key={v}>{v}</option>)}
                </select>
                <select aria-label="중분류" value={ind2} className={INPUT_CLS}
                  onChange={(e) => { setInd2(e.target.value); setInd3(INDUSTRY[ind1][e.target.value][0]); }}>
                  {mids.map((v) => <option key={v}>{v}</option>)}
                </select>
                <select aria-label="세분류" value={ind3} className={INPUT_CLS} onChange={(e) => setInd3(e.target.value)}>
                  {leaves.map((v) => <option key={v}>{v}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="records" className="mb-1.5 block text-sm font-semibold text-slate-700">
                주요 수행실적 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <textarea id="records" rows={3} placeholder="예: 2025년 OO청 LED 조명 납품 (2.1억원)" value={records}
                onChange={(e) => setRecords(e.target.value)} className={INPUT_CLS} />
            </div>

            <div>
              <label htmlFor="tag-input" className="mb-1.5 block text-sm font-semibold text-slate-700">
                보유 면허/인증 <span className="font-normal text-slate-400">(선택)</span>
              </label>
              <div className="flex min-h-[48px] flex-wrap items-center gap-1.5 rounded-btn border border-slate-200 bg-white px-2.5 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-blue-100">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-md bg-blue-50 py-1 pl-2 pr-1 text-sm font-medium text-blue-700">
                    {t}
                    <button type="button" aria-label={`${t} 삭제`} onClick={() => setTags(tags.filter((x) => x !== t))}
                      className="flex h-5 w-5 items-center justify-center rounded hover:bg-blue-100">×</button>
                  </span>
                ))}
                <input id="tag-input" placeholder="입력 후 Enter" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={onTagKey}
                  className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-1 text-[15px] outline-none placeholder:text-slate-400" />
              </div>
              <p className="mt-1.5 text-xs text-slate-400">예: 직접생산확인증명, ISO 9001, 소프트웨어사업자</p>
            </div>

            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                선호 지역 <span className="font-normal text-slate-400">(다중 선택)</span>
              </span>
              <RegionChips value={regions} onChange={setRegions} />
            </div>

            <div>
              <span className="mb-2 block text-sm font-semibold text-slate-700">관심 추정가격 범위</span>
              <div className="rounded-card border border-slate-200 bg-white p-4">
                <PriceRange min={price[0]} max={price[1]} onChange={(a, b) => setPrice([a, b])} />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => goStep(1)}
                className="w-1/3 rounded-btn border border-slate-200 bg-white py-3.5 text-[15px] font-bold text-slate-600 hover:bg-slate-50">
                이전
              </button>
              <button type="button" onClick={done} className={BTN_PRIMARY}>가입 완료</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
