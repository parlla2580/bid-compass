import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 보안 머리글 (2026-11-27 보안 검토) — 다른 사이트 안에 끼워 보이기(클릭재킹) 막기 · 파일 형식 추측 막기 · 주소 전달 최소화 · 기기 권한 끄기
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      ],
    }];
  },
  // 공유 미리보기 이미지가 서버에서 읽는 글꼴 (자동 추적이 안 될 수 있어 명시)
  outputFileTracingIncludes: { '/bids/[id]/opengraph-image': ['./assets/fonts/**'] },
};

export default nextConfig;
