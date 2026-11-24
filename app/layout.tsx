import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { SyncErrorToast, ToastProvider } from '@/components/feedback';
import { JudgedProvider, StoreProvider } from '@/lib/store';
import { InboxProvider } from '@/lib/inbox';
import { SeenProvider } from '@/lib/seen';
import { WelcomeReport } from '@/components/welcome-report';

export const metadata: Metadata = {
  // 공유 미리보기 이미지 주소를 절대 주소로 (카톡 등은 상대 주소를 못 읽음)
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bid-compass-gamma.vercel.app'),
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
          <JudgedProvider>
            <SeenProvider>
            <InboxProvider>
              <ToastProvider>
                {children}
                <SyncErrorToast />
                <WelcomeReport />
              </ToastProvider>
            </InboxProvider>
            </SeenProvider>
          </JudgedProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
