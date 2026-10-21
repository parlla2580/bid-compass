'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, Bookmark, Building2, ChevronDown, ChevronRight, History, LogOut, Pencil, SlidersHorizontal } from 'lucide-react';
import { Sheet, useToast } from '@/components/feedback';
import { PriceRange, RegionChips } from '@/components/inputs';
import { BTN_PRIMARY, BidCard, INPUT_CLS } from '@/components/ui';
import { getBid, type Bid, type BidType, type Company, type Profile } from '@/lib/data';
import { fmtRange } from '@/lib/format';
import { useCompany, useProfile, useSaved } from '@/lib/store';

const TYPES: BidType[] = ['물품', '용역', '공사'];

export default function MyPage() {
  const params = useSearchParams();
  const toast = useToast();
  const [company, setCompany] = useCompany();
  const [profile, setProfile] = useProfile();
  const [saved] = useSaved();
  const [sheet, setSheet] = useState<'info' | 'matching' | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);

  useEffect(() => {
    if (params.get('edit') === 'matching') setSheet('matching');
  }, [params]);

  const savedBids = saved.map((id) => getBid(id)).filter((b): b is Bid => !!b);

  return (
    <main className="space-y-4 px-4 pb-24 pt-5">
      <h1 className="text-xl font-bold">마이페이지</h1>

      <section className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-primary"><Building2 className="h-6 w-6" /></span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{company.name}</p>
            <p className="truncate text-sm text-slate-500">{company.email}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[100px_1fr] gap-y-2 border-t border-slate-100 pt-4 text-sm">
          <dt className="text-slate-500">대표자</dt><dd>{company.ceo}</dd>
          <dt className="text-slate-500">사업자등록번호</dt><dd>{company.bizNo}</dd>
          <dt className="text-slate-500">업종</dt><dd>{profile.industry.slice(0, 2).join(' > ')}</dd>
          <dt className="text-slate-500">사업장 주소</dt><dd>{company.address}</dd>
        </dl>
        <button type="button" onClick={() => setSheet('info')}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-btn border border-slate-200 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
          <Pencil className="h-4 w-4" />정보 수정
        </button>
      </section>

      <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          <li>
            <button type="button" onClick={() => setSheet('matching')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
              <SlidersHorizontal className="h-5 w-5 text-slate-500" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">매칭 설정</span>
                <span className="block truncate text-xs text-slate-500">
                  {profile.types.join('·')} · {profile.regions.join('·') || '전체 지역'} · {fmtRange(profile.priceMin)}~{fmtRange(profile.priceMax)}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 text-slate-300" />
            </button>
          </li>
          <li>
            <div aria-disabled="true" className="flex w-full cursor-not-allowed items-center gap-3 px-4 py-4 opacity-50">
              <Bell className="h-5 w-5 text-slate-500" />
              <span className="flex-1 text-[15px] font-semibold">알림 설정</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">후속 기능</span>
            </div>
          </li>
          <li>
            <button type="button" aria-expanded={savedOpen} onClick={() => setSavedOpen(!savedOpen)} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
              <Bookmark className="h-5 w-5 text-slate-500" />
              <span className="flex-1 text-[15px] font-semibold">저장한 공고 <span className="ml-1 text-primary">{savedBids.length}</span></span>
              <ChevronDown className={`h-5 w-5 text-slate-300 transition ${savedOpen ? 'rotate-180' : ''}`} />
            </button>
            {savedOpen && (
              <div className="space-y-2 bg-slate-50 px-4 pb-4 pt-1">
                {savedBids.length
                  ? savedBids.map((b) => <BidCard key={b.id} bid={b} />)
                  : <p className="py-6 text-center text-sm text-slate-400">저장한 공고가 없습니다</p>}
              </div>
            )}
          </li>
          <li>
            <button type="button" onClick={() => toast('입찰 이력은 준비 중입니다')} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
              <History className="h-5 w-5 text-slate-500" />
              <span className="flex-1 text-[15px] font-semibold">입찰 이력</span>
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">준비 중</span>
            </button>
          </li>
          <li>
            <Link href="/login" className="flex w-full items-center gap-3 px-4 py-4 text-red-500 hover:bg-red-50">
              <LogOut className="h-5 w-5" />
              <span className="flex-1 text-[15px] font-semibold">로그아웃</span>
            </Link>
          </li>
        </ul>
      </section>

      {sheet === 'info' && (
        <InfoSheet company={company} onClose={() => setSheet(null)}
          onSave={(c) => { setCompany(c); setSheet(null); toast('정보가 수정되었습니다'); }} />
      )}
      {sheet === 'matching' && (
        <MatchingSheet profile={profile} onClose={() => setSheet(null)}
          onSave={(p) => { setProfile(p); setSheet(null); toast('매칭 설정이 저장되었습니다'); }} />
      )}
    </main>
  );
}

function InfoSheet({ company, onClose, onSave }: { company: Company; onClose: () => void; onSave: (c: Company) => void }) {
  const [form, setForm] = useState(company);
  const field = (key: keyof Company, label: string, opts: { readOnly?: boolean; type?: string } = {}) => (
    <div>
      <label htmlFor={`f-${key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">{label}</label>
      <input id={`f-${key}`} type={opts.type ?? 'text'} value={form[key]} readOnly={opts.readOnly}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={`${INPUT_CLS} ${opts.readOnly ? 'bg-slate-100 text-slate-500' : ''}`} />
    </div>
  );

  return (
    <Sheet title="정보 수정" open onClose={onClose}
      footer={<button type="button" onClick={() => onSave(form)} className={BTN_PRIMARY}>저장</button>}>
      <div className="space-y-4">
        {field('name', '업체명', { readOnly: true })}
        {field('bizNo', '사업자등록번호', { readOnly: true })}
        {field('ceo', '대표자')}
        {field('email', '이메일', { type: 'email' })}
        {field('address', '사업장 주소')}
        <p className="text-xs text-slate-400">업체명·사업자등록번호는 사업자 인증 정보로 수정할 수 없습니다.</p>
      </div>
    </Sheet>
  );
}

function MatchingSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const toast = useToast();
  const [types, setTypes] = useState(profile.types);
  const [regions, setRegions] = useState(profile.regions);
  const [price, setPrice] = useState<[number, number]>([profile.priceMin, profile.priceMax]);

  const save = () => {
    if (!types.length) return toast('관심 사업유형을 1개 이상 선택해주세요');
    onSave({ ...profile, types, regions, priceMin: price[0], priceMax: price[1] });
  };

  return (
    <Sheet title="매칭 설정" open onClose={onClose}
      footer={<button type="button" onClick={save} className={BTN_PRIMARY}>저장</button>}>
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">관심 사업유형</legend>
          <div className="flex gap-2">
            {TYPES.map((t) => {
              const on = types.includes(t);
              return (
                <label key={t} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-btn border py-3 text-sm font-semibold ${on ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200'}`}>
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={on}
                    onChange={() => setTypes(on ? types.filter((x) => x !== t) : TYPES.filter((x) => x === t || types.includes(x)))} />
                  {t}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-700">선호 지역</span>
          <RegionChips value={regions} onChange={setRegions} />
        </div>
        <div>
          <span className="mb-2 block text-sm font-semibold text-slate-700">관심 추정가격 범위</span>
          <div className="rounded-card border border-slate-200 p-4">
            <PriceRange min={price[0]} max={price[1]} onChange={(a, b) => setPrice([a, b])} />
          </div>
        </div>
      </div>
    </Sheet>
  );
}
