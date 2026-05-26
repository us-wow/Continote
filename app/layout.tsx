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
    <html lang="ko" data-theme="wanted">
      <head>
        {/* 폰트 CDN preconnect — 로딩 속도 향상 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />

        {/* Pretendard — 한국어 본문용 산세리프 (paper 테마용) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        {/* Pretendard JP — Wanted 테마 본문용. JP 변종이 wanted 디자인 시스템 톤과 어울림. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-jp.min.css"
        />
        {/* Wanted Sans — Wanted 테마 디스플레이용 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/complete/WantedSansVariable.min.css"
        />

        {/* Google Fonts — 미리보기/PPT 폰트 옵션 4종(Noto Serif KR / Nanum Myeongjo / Noto Sans KR)
            + paper 테마 헤드라인용 Noto Serif KR + 메타용 JetBrains Mono.
            PreviewModal이 사용자가 고른 PPT 폰트 그대로 표시하도록 4개 옵션 모두 로드해둔다.
            NanumSquare는 Google Fonts에 없어서 jsDelivr 별도 링크로 받는다(아래 줄). */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400;500;600;700;900&family=Nanum+Myeongjo:wght@400;700;800&family=Noto+Sans+KR:wght@300;400;500;700;900&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* NanumSquare — 미리보기에서 "나눔스퀘어" 옵션 선택 시 동일하게 보이도록 jsDelivr 한글 웹폰트 사용 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/moonspam/NanumSquare@2.0/nanumsquare.css"
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
