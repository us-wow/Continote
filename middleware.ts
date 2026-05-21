// 데스크탑 ↔ 모바일 자동 라우팅 — middleware가 단일 진실 공급원(single source of truth).
//
// 우선순위:
//   1) ?view=desktop|mobile|auto 쿼리 → 쿠키 저장 + 쿼리 제거된 URL로 redirect (one-shot 설정)
//   2) conti-view 쿠키가 있으면 그 값으로 라우팅
//   3) 둘 다 없으면 User-Agent로 모바일/데스크탑 판단
//
// 이전엔 client useEffect도 라우팅을 같이 만져서 middleware와 핑퐁이 일어남 → 무한 redirect 루프.
// 이제 client는 라우팅을 건드리지 않고, 사용자 선택은 ?view 쿼리로 middleware에 전달.

import { NextRequest, NextResponse } from 'next/server';

const MOBILE_UA = /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i;
const COOKIE_NAME = 'conti-view';
// 쿠키 유효 기간 — 1년. 사용자가 '데스크탑으로 보기' 한 번 누르면 그 후엔 그대로.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function middleware(req: NextRequest) {
  const url = req.nextUrl.clone();
  const force = url.searchParams.get('view');

  // 1) ?view=… 쿼리 처리 → 쿠키 저장 + 깔끔한 URL로 redirect
  if (force === 'desktop' || force === 'mobile' || force === 'auto') {
    url.searchParams.delete('view');
    const res = NextResponse.redirect(url);
    if (force === 'auto') {
      res.cookies.delete(COOKIE_NAME);
    } else {
      res.cookies.set(COOKIE_NAME, force, {
        maxAge: COOKIE_MAX_AGE,
        path: '/',
        sameSite: 'lax',
      });
    }
    return res;
  }

  // 2) 쿠키 우선 — 사용자 명시적 선택이 살아있으면 그대로
  const pref = req.cookies.get(COOKIE_NAME)?.value;
  let wantMobile: boolean;
  if (pref === 'mobile') {
    wantMobile = true;
  } else if (pref === 'desktop') {
    wantMobile = false;
  } else {
    // 3) UA 휴리스틱
    const ua = req.headers.get('user-agent') || '';
    wantMobile = MOBILE_UA.test(ua);
  }

  const onMobilePath = url.pathname === '/m';
  if (wantMobile && !onMobilePath) {
    url.pathname = '/m';
    return NextResponse.redirect(url);
  }
  if (!wantMobile && onMobilePath) {
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/m'],
};
