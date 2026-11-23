import { Shell } from '@/components/layout';
import { CompassSpinner } from '@/components/loading';

/** 화면 이동 중 (2026-11-23) — 하단 메뉴는 그대로 두고 가운데 나침반 */
export default function Loading() {
  return (
    <Shell>
      <div className="flex min-h-[60vh] items-center justify-center"><CompassSpinner size="lg" label="불러오는 중" /></div>
    </Shell>
  );
}
