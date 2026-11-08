'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bell, Bookmark, Building2, FileBadge, History, Loader2, LogIn, LogOut, Pencil, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Sheet, useToast } from '@/components/feedback';
import { useRequireStart } from '@/components/layout';
import { ChoiceChips, IndustryPicker, LocationPicker, PriceRange, TagInput } from '@/components/inputs';
import { SignupSheet } from '@/components/signup-sheet';
import { BTN_PRIMARY, DdayBadge, INPUT_CLS, StatusBadge, TypeTag, chipClass } from '@/components/ui';
import { SIZES, hasSigungu, type BidType, type Notice, type Profile } from '@/lib/data';
import { fmtDateTime, fmtRange, fmtShort } from '@/lib/format';
import { judge } from '@/lib/judge';
import { fetchNoticesByIds } from '@/lib/notices';
import { useStore } from '@/lib/store';

const TYPES: BidType[] = ['물품', '용역', '공사'];
type SheetKey = 'company' | 'prefs' | null;

/** S7. 마이페이지 */
export default function MyPage() {
  const ready = useRequireStart();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { profile, setProfile, account, signOut, saved, reset, notices } = useStore();
  const [sheet, setSheet] = useState<SheetKey>(null);
  const [signup, setSignup] = useState(false);
  const [savedNotices, setSavedNotices] = useState<Notice[] | null>(null);

  useEffect(() => {
    const edit = params.get('edit');
    if (edit === 'company' || edit === 'prefs') setSheet(edit);
  }, [params]);

  // 저장 공고 — 마감된 공고도 보여야 하므로 id로 따로 불러옴
  useEffect(() => {
    if (!saved.length) return setSavedNotices([]);
    const cached = notices?.filter((n) => saved.includes(n.id)) ?? [];
    if (notices && cached.length === saved.length) return setSavedNotices(cached);
    fetchNoticesByIds(saved).then(setSavedNotices).catch(() => setSavedNotices(cached));
  }, [saved, notices]);

  if (!ready) return null;

  const companyRows: [string, React.ReactNode][] = [
    ['업체명', profile.corpName ? `${profile.corpName}${profile.naraRegistered ? ' (나라장터 등록)' : ''}` : null],
    ['업종', profile.industries?.length ? profile.industries.map((i) => i.name).join(', ') : null],
    ['소재지', profile.location ? `${profile.location}${hasSigungu(profile.location) ? '' : ' (시군구 미입력)'}` : null],
    ['기업규모', profile.size],
    ['수행실적', profile.records || null],
  ];

  const onSave = (p: Profile, msg: string) => {
    setProfile(p);
    setSheet(null);
    toast(msg);
  };

  return (
    <main className="space-y-4 px-4 pb-24 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">마이페이지</h1>
        {account
          ? <span className="truncate text-sm text-slate-500">{account.email}</span>
          : <button type="button" onClick={() => setSignup(true)} className="flex items-center gap-1 text-sm font-bold text-primary"><LogIn className="h-4 w-4" />이메일로 가입</button>}
      </div>

      {/* 기업 정보 */}
      <section className="rounded-card border border-slate-200 bg-white p-4 shadow-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><Building2 className="h-4 w-4 text-primary" />기업 정보</h2>
          <button type="button" onClick={() => setSheet('company')} className="flex items-center gap-1 text-sm font-semibold text-primary"><Pencil className="h-3.5 w-3.5" />수정</button>
        </div>
        <dl className="grid grid-cols-[72px_1fr] gap-y-2 text-sm">
          {companyRows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-slate-500">{k}</dt>
              <dd className={v ? 'font-medium' : 'text-slate-400'}>{v ?? '미입력'}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-slate-400">업종과 소재지가 참여 가능 판정에 쓰입니다.</p>
      </section>

      {/* 매칭 선호도 */}
      <section className="rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold"><SlidersHorizontal className="h-4 w-4 text-primary" />매칭 선호도</h2>
          <button type="button" onClick={() => setSheet('prefs')} className="flex items-center gap-1 text-sm font-semibold text-primary"><Pencil className="h-3.5 w-3.5" />수정</button>
        </div>
        <dl className="grid grid-cols-[112px_1fr] gap-y-2 text-sm">
          <dt className="text-slate-500">관심 사업유형</dt><dd className="font-medium">{profile.types.join(', ')}</dd>
          <dt className="text-slate-500">선호 발주기관</dt><dd className="font-medium">{profile.preferredOrgs.join(', ') || '없음'}</dd>
          <dt className="text-slate-500">추정가격 범위</dt>
          <dd className="font-medium">{profile.priceRange ? `${fmtRange(profile.priceRange[0])} ~ ${fmtRange(profile.priceRange[1])}` : '제한 없음'}</dd>
        </dl>
        <p className="mt-3 text-xs text-slate-400">선호도는 추천 순서(관련도)에만 반영되고, 참여 가능 판정에는 쓰이지 않습니다.</p>
      </section>

      {/* 저장한 공고 */}
      <section id="saved" className="scroll-mt-20 rounded-card border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold"><Bookmark className="h-4 w-4 text-primary" />저장한 공고 <span className="text-primary">{saved.length}</span></h2>
        {!savedNotices && <div className="h-14 animate-pulse rounded-lg bg-slate-100" />}
        {savedNotices && savedNotices.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {[...savedNotices].sort((a, b) => a.closesAt.getTime() - b.closesAt.getTime()).map((n) => (
              <li key={n.id}>
                <Link href={`/bids/${n.id}`} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {n.d >= 0 && <StatusBadge status={judge(n, profile).status} />}
                      <TypeTag type={n.type} />
                    </div>
                    <p className="mt-1 truncate text-sm font-semibold">{n.title}</p>
                    <p className="truncate text-xs text-slate-500">{n.org}{n.estPrice ? ` · ${fmtShort(n.estPrice)}원` : ''} · 마감 {fmtDateTime(n.closesAt)}</p>
                  </div>
                  <DdayBadge d={n.d} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {savedNotices && !savedNotices.length && (
          <p className="py-6 text-center text-sm text-slate-400">
            저장한 공고가 없습니다.<br />
            <Link href="/recommend" className="font-semibold text-primary">추천 공고</Link>에서 관심 공고를 저장해 보세요.
          </p>
        )}
      </section>

      {/* Phase 2 기능 */}
      <section className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-sm">
        <ul className="divide-y divide-slate-100">
          {[
            { label: '서류·인증서 관리', Icon: FileBadge },
            { label: '입찰 이력', Icon: History },
            { label: '알림 설정', Icon: Bell },
          ].map(({ label, Icon }) => (
            <li key={label}>
              <button type="button" onClick={() => toast(`${label}는 준비 중입니다`)} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
                <Icon className="h-5 w-5 text-slate-400" />
                <span className="flex-1 text-[15px] font-semibold text-slate-600">{label}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">준비 중</span>
              </button>
            </li>
          ))}
          {account ? (
            <li>
              <button type="button" onClick={async () => { await signOut(); router.push('/start'); }} className="flex w-full items-center gap-3 px-4 py-4 text-left text-slate-600 hover:bg-slate-50">
                <LogOut className="h-5 w-5" /><span className="flex-1 text-[15px] font-semibold">로그아웃</span>
              </button>
            </li>
          ) : (
            <li>
              {/* 가입 전에만 — 브라우저에 입력한 정보를 지우고 간편 시작으로 */}
              <button type="button" onClick={() => { reset(); router.push('/start'); }} className="flex w-full items-center gap-3 px-4 py-4 text-left text-red-500 hover:bg-red-50">
                <RotateCcw className="h-5 w-5" /><span className="flex-1 text-[15px] font-semibold">입력한 정보 지우고 처음부터</span>
              </button>
            </li>
          )}
        </ul>
      </section>

      {sheet === 'company' && <CompanySheet profile={profile} onClose={() => setSheet(null)} onSave={(p) => onSave(p, '기업 정보를 저장했습니다. 판정을 다시 계산했습니다')} />}
      {sheet === 'prefs' && <PrefsSheet profile={profile} onClose={() => setSheet(null)} onSave={(p) => onSave(p, '매칭 선호도를 저장했습니다')} />}
      <SignupSheet open={signup} onClose={() => setSignup(false)} reason="가입하면 저장한 공고와 기업 정보를 다른 기기에서도 볼 수 있어요."
        onDone={() => { setSignup(false); toast('가입했습니다. 입력한 정보를 서버에 저장했습니다'); }} />
    </main>
  );
}

function CompanySheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);

  // 사업자번호로 나라장터 정보 다시 불러오기
  const refresh = async () => {
    if (!form.bizno) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/company?bizno=${form.bizno}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (!data.registered) return toast('나라장터에 등록된 정보가 없습니다');
      setForm({
        ...form, naraRegistered: true, corpName: data.corpName ?? form.corpName,
        location: data.location ?? form.location,
        industries: data.industries?.length ? data.industries : form.industries,
      });
      toast('나라장터 정보를 불러왔습니다');
    } catch (e) {
      toast((e as Error).message || '조회에 실패했습니다');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="기업 정보 수정" open onClose={onClose} footer={<button type="button" onClick={() => onSave(form)} className={BTN_PRIMARY}>저장</button>}>
      <div className="space-y-6">
        <div>
          <label htmlFor="f-bizno" className="mb-1.5 block text-sm font-semibold text-slate-700">사업자등록번호 <span className="font-normal text-slate-400">(선택)</span></label>
          <div className="flex gap-2">
            <input id="f-bizno" inputMode="numeric" maxLength={10} value={form.bizno ?? ''} placeholder="숫자 10자리"
              onChange={(e) => setForm({ ...form, bizno: e.target.value.replace(/\D/g, '') || null })} className={INPUT_CLS + ' flex-1'} />
            <button type="button" onClick={refresh} disabled={busy || form.bizno?.length !== 10}
              className="flex shrink-0 items-center gap-1 rounded-btn bg-slate-800 px-3 text-sm font-bold text-white disabled:bg-slate-300">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}불러오기
            </button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">업종 (나라장터 업종)</p>
          <IndustryPicker value={form.industries ?? []} onChange={(v) => setForm({ ...form, industries: v })} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">소재지</p>
          <LocationPicker value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">기업규모</p>
          <ChoiceChips label="기업규모" options={SIZES} value={form.size} onChange={(v) => setForm({ ...form, size: v })} />
        </div>
        <div>
          <label htmlFor="records" className="mb-1.5 block text-sm font-semibold text-slate-700">수행실적 <span className="font-normal text-slate-400">(선택)</span></label>
          <textarea id="records" rows={3} value={form.records} onChange={(e) => setForm({ ...form, records: e.target.value })}
            placeholder="예: 2025년 OO청 LED 조명 납품 (2.1억원)" className={INPUT_CLS} />
        </div>
      </div>
    </Sheet>
  );
}

function PrefsSheet({ profile, onClose, onSave }: { profile: Profile; onClose: () => void; onSave: (p: Profile) => void }) {
  const toast = useToast();
  const [form, setForm] = useState(profile);
  const save = () => (form.types.length ? onSave(form) : toast('관심 사업유형을 1개 이상 선택해주세요'));
  return (
    <Sheet title="매칭 선호도" open onClose={onClose} footer={<button type="button" onClick={save} className={BTN_PRIMARY}>저장</button>}>
      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">관심 사업유형</legend>
          <div className="flex gap-2">
            {TYPES.map((t) => {
              const on = form.types.includes(t);
              return (
                <button key={t} type="button" aria-pressed={on}
                  onClick={() => setForm({ ...form, types: on ? form.types.filter((x) => x !== t) : TYPES.filter((x) => x === t || form.types.includes(x)) })}
                  className={`flex-1 rounded-btn border py-2.5 text-sm font-semibold ${chipClass(on)}`}>{t}</button>
              );
            })}
          </div>
        </fieldset>
        <div>
          <label htmlFor="orgs" className="mb-1.5 block text-sm font-semibold text-slate-700">선호 발주기관</label>
          <TagInput id="orgs" value={form.preferredOrgs} onChange={(v) => setForm({ ...form, preferredOrgs: v })} placeholder="예: 조달청 (Enter)" />
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">추정가격 범위</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={!form.priceRange}
                onChange={(e) => setForm({ ...form, priceRange: e.target.checked ? null : [50e6, 5e8] })} />
              제한 없음
            </label>
          </div>
          {form.priceRange && (
            <div className="rounded-card border border-slate-200 p-4">
              <PriceRange value={form.priceRange} onChange={(v) => setForm({ ...form, priceRange: v })} />
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}
