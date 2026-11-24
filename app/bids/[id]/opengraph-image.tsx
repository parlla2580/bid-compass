import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { fetchOgNotice, ogDeadline, ogMoney } from '@/lib/og-notice';

/*
 * 공고 공유 미리보기 이미지 (카톡·문자 링크 카드) — 2026-11-23 오픈 전 아하 포인트 ②
 *  공개 정보만: 유형 · 낙찰방식 · 제목 · 기관 · 추정가격 · 마감 · 보통 경쟁
 */
export const runtime = 'nodejs';
export const alt = '입찰나침반 공고';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

const BRAND = '#2563EB';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [n, bold, medium] = await Promise.all([
    fetchOgNotice(Number(id)),
    readFile(join(process.cwd(), 'assets/fonts/Pretendard-Bold.subset.woff')),
    readFile(join(process.cwd(), 'assets/fonts/Pretendard-Medium.subset.woff')),
  ]);
  const fonts = [
    { name: 'Pretendard', data: bold, weight: 700 as const, style: 'normal' as const },
    { name: 'Pretendard', data: medium, weight: 500 as const, style: 'normal' as const },
  ];
  const dl = ogDeadline(n?.closesAt ?? null);
  const closed = dl.d != null && dl.d < 0;
  const dday = dl.d == null ? '' : closed ? '마감' : dl.d === 0 ? 'D-DAY' : `D-${dl.d}`;
  const title = n?.title ?? '공공조달 입찰 공고';
  const cut = title.length > 44 ? `${title.slice(0, 43)}…` : title;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#F4F6F9', padding: 56, fontFamily: 'Pretendard' }}>
        {/* 로고 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: BRAND, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* 나침반 (lucide Compass 와 같은 모양) */}
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#111827' }}>입찰나침반</div>
        </div>

        <div style={{ marginTop: 32, flex: 1, display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 28, padding: '40px 44px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 26, fontWeight: 700 }}>
            {n && <div style={{ display: 'flex', padding: '6px 14px', borderRadius: 10, background: '#EEF2FF', color: BRAND }}>{n.type}</div>}
            {n?.award && <div style={{ display: 'flex', padding: '6px 14px', borderRadius: 10, background: '#F1F3F5', color: '#4B5563' }}>{n.award}</div>}
            {dday && <div style={{ display: 'flex', marginLeft: 'auto', color: closed ? '#9CA3AF' : dl.d! <= 3 ? '#E5484D' : BRAND, fontSize: 34 }}>{dday}</div>}
          </div>
          <div style={{ marginTop: 22, fontSize: 50, fontWeight: 700, color: '#111827', lineHeight: 1.3 }}>{cut}</div>
          <div style={{ marginTop: 14, fontSize: 28, fontWeight: 500, color: '#6B7280' }}>{n?.org ?? ''}</div>

          <div style={{ marginTop: 'auto', display: 'flex', gap: 16 }}>
            <Box label="추정가격" value={ogMoney(n?.estPrice ?? null)} />
            <Box label="마감" value={dl.text} />
            <Box label="보통 경쟁" value={n?.participants ? `${n.participants}곳` : '–'} />
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#F4F6F9', borderRadius: 18, padding: '18px 24px' }}>
      <div style={{ fontSize: 22, fontWeight: 500, color: '#6B7280' }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 38, fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}
