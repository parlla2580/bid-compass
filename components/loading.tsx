'use client';

import { Compass } from 'lucide-react';

/*
 * 로딩 표시 (2026-11-23 사용자 요청) — 서비스 상징인 나침반 바늘이 방향을 찾듯 돌아감
 *  · CompassSpinner: 나침반 아이콘만 (버튼·하단 메뉴 등 작은 자리)
 *  · LoadingBox: 카드 자리를 차지하는 회색 상자 + 가운데 나침반 (+ '불러오는 중')
 *  · 움직임 줄이기 설정을 켠 사용자는 천천히 깜박이기만 (globals.css)
 */
export function CompassSpinner({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const box = size === 'lg' ? 'h-12 w-12 rounded-[14px]' : size === 'md' ? 'h-9 w-9 rounded-[11px]' : 'h-6 w-6 rounded-[8px]';
  const icon = size === 'lg' ? 'h-7 w-7' : size === 'md' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span role="status" aria-live="polite" className="inline-flex flex-col items-center gap-2">
      <span className={`flex items-center justify-center bg-brand text-white shadow-sm ${box}`}>
        <Compass className={`compass-seek ${icon}`} aria-hidden />
      </span>
      {label ? <span className="text-[13px] font-medium text-mute">{label}</span> : <span className="sr-only">불러오는 중</span>}
    </span>
  );
}

export function LoadingBox({ className = 'h-40', tone = 'white', label, spin = true }: {
  className?: string; tone?: 'white' | 'fill'; label?: string; spin?: boolean;
}) {
  const bg = tone === 'white' ? 'rounded-box bg-white' : 'rounded-2xl bg-fill';
  // 높이가 충분한 상자만 글씨까지
  const tall = /\bh-(2[4-9]|[3-9]\d)\b/.test(className);
  return (
    <div className={`flex items-center justify-center ${bg} ${className}`}>
      {spin && <CompassSpinner size={tall ? 'md' : 'sm'} label={tall ? (label ?? '불러오는 중') : undefined} />}
    </div>
  );
}

/** 버튼 안 작은 나침반 — 글자색을 그대로 씀 (회사 확인·가입·로그인·엑셀 등 기다리는 버튼) */
export function InlineCompass({ className = 'h-4 w-4' }: { className?: string }) {
  return <Compass className={`compass-seek shrink-0 ${className}`} aria-hidden />;
}
