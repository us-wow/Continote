// 데스크탑 ↔ 모바일 자동 라우팅 — 서버 사이드(edge)에서 즉시 redirect.
//
// 이전엔 client-side useEffect로만 처리했는데, 모바일에서 데스크탑 헤더가 잠깐 보였다가
// 사라지는 깜빡임 + localStorage 'conti-view' 가 desktop으로 sticky 되어 모바일 진입해도
// 데스크탑 페이지가 노출되는 문제가 있었음.
// User-Agent 기반으로 즉시 redirect 하면 그 문제 해결.
//
// 강제 옵션: ?view=desktop | ?view=mobile 쿼리는 그대로 통과 (client에서 localStorage 저장 → sticky).

import { NextRequest, NextResponse } from 'next/server';

const MOBILE_UA = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i;

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const force = url.searchParams.get('view');

  // 사용자가 명시적으로 데스크탑/모바일 강제 요청한 경우는 그대로 통과.
  // (client useEffect가 localStorage에 저장해서 다음 요청부터 sticky)
  if (force === 'desktop' || force === 'mobile') {
    return NextResponse.next();
  }

  const ua = req.headers.get('user-agent') || '';
  const isMobile = MOBILE_UA.test(ua);

  // 모바일 UA → 루트 진입 → /m 으로
  if (isMobile && url.pathname === '/') {
    url.pathname = '/m';
    return NextResponse.redirect(url);
  }
  // 데스크탑 UA → /m 진입 → / 로
  if (!isMobile && url.pathname === '/m') {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// /와 /m 두 경로만 매칭. /auth/callback 등 다른 경로는 통과.
export const config = {
  matcher: ['/', '/m'],
};
