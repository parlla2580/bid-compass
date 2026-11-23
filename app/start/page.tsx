'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Compass, Loader2 } from 'lucide-react';
import { IndustryPicker, LocationPicker, ProductPicker } from '@/components/inputs';
import { BTN_PRIMARY } from '@/components/ui';
import { Tip } from '@/components/tip';
import type { Industry, Product } from '@/lib/data';
import { suggestProducts } from '@/lib/match';
import { maskBizNo } from '@/lib/format';
import { useStore } from '@/lib/store';

interface Lookup {
  registered: boolean;
  corpName?: string | null;
  location?: string | null;
  industries?: Industry[];
  products?: Product[];
}

type Mode = 'bizno' | 'confirm' | 'manual' | 'products';

/** S1. 간편 시작 (F1-1, v2.1) — 사업자번호(선택) → 나라장터 등록 업체는 자동, 아니면 업종·소재지 직접 입력 */
const MANY = 10;

export default function StartPage() {
  const router = useRouter();
  const { loaded, profile, updateProfile, notices, account } = useStore();
  const [pending, setPending] = useState<Parameters<typeof updateProfile>[0] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [mode, setMode] = useState<Mode>('bizno');
  const [bizno, setBizno] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<Lookup | null>(null);
  const [industries, setIndustries] = useState<Industry[]>([]);
  const [location, setLocation] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
      if (!res.ok) throw new Error(data.error ?? '조회하지 못했어요');
      if (!data.registered) {
        setError('나라장터에 등록된 정보가 없어요. 업종과 소재지를 직접 입력해 주세요.');
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

  // 업종·소재지 다음에 주요 품목 단계 (나라장터 공급물품이 있으면 미리 채움)
  const go = (patch: Parameters<typeof updateProfile>[0]) => {
    setPending(patch);
    // 공급물품이 많으면(소금·로봇·현미경까지 56개 등) 다 넣지 않고 주로 하는 것만 고르게 함 (2026-11-16 페르소나 점검)
    const nara = found?.products ?? [];
    setProducts(nara.length > MANY ? [] : nara.length ? nara.map((p) => ({ ...p, source: 'nara' as const })) : profile.products ?? []);
    setError(null);
    setMode('products');
  };
  const finish = (withProducts: boolean) => {
    updateProfile({ ...pending, products: withProducts && products.length ? products : (pending?.products ?? profile.products ?? null) });
    router.push('/bids');
  };

  const confirm = () => {
    if (!found) return;
    // 물품 공급 업체는 등록업종 없이 공급물품만 있는 경우가 많음 → 공급물품으로 바로 맞춤 (2026-11-16 페르소나 점검)
    if (!found.industries?.length && found.products?.length && found.location) {
      go({ bizno: bizno.replace(/\D/g, ''), industries: [], location: found.location });
      return;
    }
    // 업종도 공급물품도 없거나 소재지를 모르면 직접 선택
    if (!found.industries?.length || !found.location) {
      setIndustries(found.industries ?? []);
      setLocation(found.location ?? null);
      setMode('manual');
      setError(!found.industries?.length
        ? '나라장터에 등록된 업종이 없어요. 주로 하시는 업종을 선택해 주세요.'
        : '소재지를 확인하지 못했어요. 직접 선택해 주세요.');
      return;
    }
    go({ bizno: bizno.replace(/\D/g, ''), industries: found.industries, location: found.location });
  };

  const manualReady = !!location;

  // 공급물품이 많은 회사 — 지금 열린 공고에 자주 나오는 품목부터 보여 주고 고르게 함
  const many = (found?.products?.length ?? 0) > MANY;
  const manyList = useMemo(() => {
    if (!many) return [];
    const cnt = new Map<string, number>();
    for (const n of notices ?? []) for (const x of n.products) cnt.set(x.code, (cnt.get(x.code) ?? 0) + 1);
    return found!.products!.map((p) => ({ ...p, n: cnt.get(p.code) ?? 0 })).sort((a, b) => b.n - a.n);
  }, [many, found, notices]);

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-canvas px-5 lg:pt-10">
      <section className="pb-6 pt-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
            <Compass className="h-6 w-6" />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">입찰나침반</span>
          {/* 로그인 입구는 첫 화면 맨 위에 (2026-11-21 사용자: 맨 아래 작은 글씨라 안 보임 — 휴대폰에선 화면 밖) */}
          {loaded && !account && (
            <Link href="/login" className="ml-auto flex h-9 items-center rounded-full bg-ink px-3.5 text-[14px] font-semibold text-white active:scale-[.98]">로그인</Link>
          )}
        </div>
        <h1 className="mt-6 text-[26px] font-bold leading-snug tracking-tight">
          우리 회사가
          <br />
          <span className="text-primary">참여할 수 있는 공고</span>를<br />골라 드릴게요
        </h1>
        <p className="mt-2 text-[15px] text-mute">가입 불필요 · 무료</p>
      </section>

      {mode === 'bizno' && (
        <section className="fade-up">
          <div className="rounded-box bg-white p-5 shadow-[0_8px_24px_rgba(25,28,33,0.06)]">
            <label htmlFor="bizno" className="block text-[17px] font-bold">사업자등록번호를 넣어 주세요</label>
            <p className="mt-1 text-[14px] text-mute">나라장터 등록 업체는 업종·소재지를 자동으로 불러와요</p>
            <input id="bizno" inputMode="numeric" placeholder="000-00-00000" maxLength={12} value={bizno} autoFocus
              onChange={(e) => setBizno(maskBizNo(e.target.value))} onKeyDown={(e) => e.key === 'Enter' && lookup()}
              className="mt-4 h-16 w-full rounded-btn border-2 border-brand/30 bg-white px-5 text-[22px] font-semibold tracking-wider text-ink placeholder:font-normal placeholder:text-mute/60 focus:border-brand focus:outline-none" />
            {error && <p role="alert" className="mt-2 text-[14px] text-bad">{error}</p>}
            <button type="button" onClick={lookup} disabled={busy} className={`${BTN_PRIMARY} mt-3`}>
              {busy && <Loader2 className="h-5 w-5 animate-spin" />}우리 회사 공고 찾기
            </button>
          </div>
          <button type="button" onClick={() => { setError(null); setMode('manual'); }}
            className="mx-auto mt-5 block py-2 text-[15px] font-medium text-mute underline-offset-4 hover:text-sub hover:underline">
            업종·지역으로 시작하기
          </button>
        </section>
      )}

      {mode === 'confirm' && found && (
        <section className="fade-up space-y-4">
          <div className="rounded-box bg-white p-5">
            <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-primary"><BadgeCheck className="h-4 w-4" />나라장터 등록 정보를 찾았어요</div>
            <p className="text-xs text-mute">우리 회사가 맞는지 확인해 주세요.</p>
            <dl className="mt-3 grid grid-cols-[64px_1fr] gap-y-2 text-sm">
              {found.corpName && <><dt className="text-mute">업체명</dt><dd className="font-semibold">{found.corpName}</dd></>}
              <dt className="text-mute">소재지</dt><dd className="font-medium">{found.location ?? '확인 안 됨'}</dd>
              <dt className="text-mute">등록업종</dt>
              <dd>
                {found.industries?.length
                  ? <span className="flex flex-wrap gap-1">{found.industries.slice(0, 8).map((i) => <span key={i.code} className="rounded-lg bg-fill px-2.5 py-1 text-[13px] font-medium text-sub">{i.name}</span>)}{found.industries.length > 8 && <span className="text-xs text-mute">외 {found.industries.length - 8}개</span>}</span>
                  : <span className="text-warn">등록된 업종 없음</span>}
              </dd>
            </dl>
          </div>
          <button type="button" onClick={confirm} className={BTN_PRIMARY}>이 정보로 공고 보기<ArrowRight className="h-5 w-5" /></button>
          <button type="button" onClick={() => { setFound(null); setMode('bizno'); }} className="w-full py-2 text-sm font-medium text-mute">다른 번호로 조회</button>
        </section>
      )}

      {mode === 'manual' && (
        <section className="fade-up space-y-6">
          {error && <p role="alert" className="text-[14px] text-warn">{error}</p>}
          <div>
            <h2 className="mb-2.5 text-sm font-bold text-sub"><span className="mr-1.5 text-primary">1</span>어떤 업종인가요?</h2>
            <IndustryPicker value={industries} onChange={setIndustries} />
          </div>
          <div>
            <h2 className="mb-2.5 text-sm font-bold text-sub"><span className="mr-1.5 text-primary">2</span>사업장은 어디에 있나요?</h2>
            <LocationPicker value={location} onChange={setLocation} />
            <p className="mt-1.5 text-xs text-mute">시군구까지 고르면 지역제한 공고를 더 정확히 판정합니다.</p>
          </div>
          <div className="sticky bottom-0 -mx-5 bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-5 pb-6 pt-3">
            <button type="button" disabled={!manualReady || !industries.length}
              onClick={() => go({ industries, location, bizno: bizno.replace(/\D/g, '') || null })}
              className={BTN_PRIMARY}>
              내 공고 보기<ArrowRight className="h-5 w-5" />
            </button>
            <button type="button" disabled={!manualReady} onClick={() => go({ industries: [], location })}
              className="mt-2 w-full py-2 text-xs font-medium text-mute disabled:text-slate-300">
              지역만으로 보기
            </button>
            <button type="button" onClick={() => { setError(null); setMode('bizno'); }} className="w-full py-1 text-xs text-mute">사업자등록번호로 조회하기</button>
          </div>
        </section>
      )}

      {mode === 'products' && (
        <section className="fade-up space-y-5">
          <div className="rounded-box bg-white p-5">
            <h2 className="text-[17px] font-bold">주로 어떤 품목을 다루세요?</h2>
            <p className="mt-1 text-[14px] text-mute">
              {many ? `등록 공급물품 ${found!.products!.length}개 · 주로 납품하는 것만 (10개 이하)`
                : found?.products?.length ? '나라장터에 등록된 공급물품을 불러왔어요. 맞는지만 확인해 주세요.'
                : found ? '나라장터에 등록된 공급물품이 없어요. 공사·용역 업체는 업종(면허)으로 이미 맞춰 드려요. 다루는 물품이 있을 때만 추가하세요.'
                : '품목을 고르면 우리 회사 일과 맞는 공고만 골라 드려요.'}
            </p>
            {many && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {/* U4(2026-11-22): 처음엔 공고 많은 10개만 — 57개가 한 번에 펼쳐져 무거웠음 */}
                {(showAll ? manyList : manyList.slice(0, 10)).map((p) => {
                  const on = products.some((x) => x.code === p.code);
                  return (
                    <button key={p.code} type="button" aria-pressed={on}
                      onClick={() => setProducts(on ? products.filter((x) => x.code !== p.code) : [...products, { ...p, source: 'nara' }])}
                      className={`rounded-full px-3 py-1.5 text-[14px] font-medium transition ${on ? 'bg-ink text-white' : 'bg-white text-sub ring-1 ring-line'}`}>
                      {on ? '✓ ' : '+ '}{p.name}{p.n ? <span className={`ml-1 text-[12px] ${on ? 'text-white/70' : 'text-mute'}`}>{p.n}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
            {many && manyList.length > 10 && (
              <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 text-[14px] font-semibold text-brand">
                {showAll ? '접기' : `나머지 ${manyList.length - 10}개 더 보기`}
              </button>
            )}
            {many && <p className="mt-2 flex items-center gap-1 text-[12px] text-mute">고른 품목 {products.length}개<Tip title="품목 옆 숫자">지금 열린 공고 중 그 품목이 들어간 공고 수예요.</Tip></p>}
            <div className="mt-4">
              <ProductPicker value={products} onChange={setProducts}
                suggest={suggestProducts(notices, (pending?.industries as Industry[] | undefined) ?? profile.industries, many ? [...products, ...found!.products!] : products)} />
            </div>
          </div>
          {found && !found.products?.length && !products.length ? (
            <button type="button" onClick={() => finish(false)} className={BTN_PRIMARY}>
              업종으로 공고 보기<ArrowRight className="h-5 w-5" />
            </button>
          ) : (
            <>
              <button type="button" onClick={() => finish(true)} disabled={!products.length} className={BTN_PRIMARY}>
                이 품목으로 공고 보기<ArrowRight className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => finish(false)} className="flex h-14 w-full items-center justify-center rounded-cta bg-white text-[16px] font-semibold text-sub ring-1 ring-line active:scale-[.98]">나중에 할게요</button>
            </>
          )}
        </section>
      )}

      <div className="mt-auto pb-8 pt-6" />
    </div>
  );
}
