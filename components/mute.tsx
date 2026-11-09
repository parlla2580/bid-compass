'use client';

import { useToast, Sheet } from '@/components/feedback';
import type { MuteItem, Notice } from '@/lib/data';
import { useStore } from '@/lib/store';

/** '관심 없음' — 이 공고만 / 이 품목 공고 / 이 업종 공고를 맞춤 공고에서 뺌 (마이페이지에서 되돌리기) */
export function MuteSheet({ notice: n, onClose }: { notice: Notice | null; onClose: () => void }) {
  const { profile, updateProfile } = useStore();
  const toast = useToast();
  if (!n) return null;

  const mine = new Set((profile.industries ?? []).map((i) => i.code));
  const licenses = (n.licenseLimits ?? []).filter((l) => l.code && mine.has(l.code));
  const options: { item: MuteItem; label: string; sub: string }[] = [
    { item: { kind: 'notice', code: String(n.id), name: n.title }, label: '이 공고만 숨기기', sub: n.title },
    ...n.products.slice(0, 3).map((p) => ({ item: { kind: 'product' as const, code: p.code, name: p.name }, label: `'${p.name}' 품목 공고 빼기`, sub: '이 품목만 다루는 공고는 맞춤 공고에서 빠져요' })),
    ...licenses.map((l) => ({ item: { kind: 'industry' as const, code: l.code!, name: l.name }, label: `'${l.name}' 업종 공고 빼기`, sub: '이 업종을 요구하는 공고를 우리 일로 보지 않아요' })),
  ];

  const pick = (item: MuteItem) => {
    const muted = profile.muted ?? [];
    if (!muted.some((m) => m.kind === item.kind && m.code === item.code)) updateProfile({ muted: [...muted, item] });
    onClose();
    toast('맞춤 공고에서 뺐어요. 마이페이지에서 되돌릴 수 있어요');
  };

  return (
    <Sheet title="관심 없는 이유를 골라 주세요" open onClose={onClose}>
      <ul className="space-y-2">
        {options.map((o) => (
          <li key={`${o.item.kind}-${o.item.code}`}>
            <button type="button" onClick={() => pick(o.item)} className="w-full rounded-btn bg-fill px-4 py-3.5 text-left hover:bg-line">
              <span className="block text-[15px] font-semibold">{o.label}</span>
              <span className="mt-0.5 block line-clamp-1 text-[13px] text-mute">{o.sub}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
