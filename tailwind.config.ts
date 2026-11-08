import type { Config } from 'tailwindcss';

// 디자인 시스템 토큰 — prototype/assets/tw-config.js와 동일
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        accent: '#F59E0B',
        // v3 디자인 기준 — 포인트 1색 + 회색 위계
        canvas: '#F4F5F7', // 바탕
        ink: '#191C21',    // 본문·제목
        sub: '#4B5360',    // 보조 글자
        mute: '#8A929E',   // 흐린 글자·라벨
        line: '#E8EAED',   // 구분선
        fill: '#F1F3F5',   // 옅은 채움 (입력칸·보조 버튼)
        brand: { DEFAULT: '#2563EB', soft: '#EEF3FE', strong: '#1D4ED8' },
        ok: '#12A150',
        warn: '#E08A00',
        bad: '#E5484D',
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
        btn: '12px',
        box: '20px',  // v3 카드
        cta: '14px',  // v3 버튼
      },
    },
  },
  plugins: [],
};

export default config;
