import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

// 콘티노트 메타데이터 — 검색·SNS 공유 미리보기용
export const metadata: Metadata = {
  title: '콘티노트 — ContiNote',
  description: '악보를 콘티 가사로, 클릭 한 번에. 찬양팀·예배 사역자를 위한 AI 콘티 메이커',
  openGraph: {
    title: '콘티노트',
    description: '악보를 콘티 가사로, 클릭 한 번에',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트 CDN preconnect — 로딩 속도 향상 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* Pretendard — 한국어 본문용 산세리프 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />

        {/* Google Fonts — Noto Serif KR(한글 세리프 헤드라인) + JetBrains Mono(작은 메타용)
            * Newsreader는 영문 전용이라 한글이 폴백돼서 톤 어긋남 → Noto Serif KR로 교체 */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;500;600;700;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        {/* Vercel Analytics — 페이지뷰/이탈률 등 기본 사용 통계 (개인정보 X, 쿠키 없음) */}
        <Analytics />
      </body>
    </html>
  );
}
