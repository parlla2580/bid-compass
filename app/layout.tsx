import type { Metadata, Viewport } from 'next';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';
import { ToastProvider } from '@/components/feedback';

export const metadata: Metadata = {
  title: { default: '입찰나침반', template: '%s · 입찰나침반' },
  description: '우리 회사에 맞는 공공조달 입찰정보를 무료로 찾아보는 서비스',
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
      <body className="bg-slate-100 font-sans text-slate-800">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
