import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { SyncErrorToast, ToastProvider } from '@/components/feedback';
import { StoreProvider } from '@/lib/store';

export const metadata: Metadata = {
  title: { default: '입찰나침반', template: '%s · 입찰나침반' },
  description: '업종과 지역만 넣으면, 실제로 참여할 수 있는 공공조달 공고를 이유와 함께 골라 주는 무료 입찰정보 서비스',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#2563EB',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-canvas font-sans text-ink">
        <StoreProvider>
          <ToastProvider>
            {children}
            <SyncErrorToast />
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
