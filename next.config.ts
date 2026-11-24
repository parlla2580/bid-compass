import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 공유 미리보기 이미지가 서버에서 읽는 글꼴 (자동 추적이 안 될 수 있어 명시)
  outputFileTracingIncludes: { '/bids/[id]/opengraph-image': ['./assets/fonts/**'] },
};

export default nextConfig;
