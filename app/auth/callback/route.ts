// Google OAuth 로그인 후 Supabase가 사용자를 다시 이 URL로 보내준다.
// 쿼리 파라미터 ?code=... 를 세션으로 교환하고 홈("/")으로 리다이렉트한다.
// 실패 시 ?auth_error=... 로 홈에 보내서 클라이언트에서 토스트/알림으로 안내할 수 있게 한다.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // 로그인 후 돌아갈 페이지를 동적으로 지정하고 싶을 때 ?next=/some-path 로 받는다.
  const next = sanitizeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=no_code`);
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('OAuth 콜백 실패:', error.message);
    return NextResponse.redirect(`${origin}/?auth_error=exchange_failed`);
  }

  // 성공 시 세션 쿠키가 응답에 자동으로 실린다 → 클라이언트가 다음 요청부터 로그인 상태로 인식.
  return NextResponse.redirect(`${origin}${next}`);
}

function sanitizeNextPath(next: string | null): '/' | '/m' {
  return next === '/m' ? '/m' : '/';
}
