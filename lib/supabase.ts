'use client';

// Next.js 14 App Router의 클라이언트 컴포넌트에서 쓰는 Supabase 브라우저 클라이언트.
// @supabase/ssr의 createBrowserClient는 쿠키 기반 세션 관리를 자동으로 해주므로
// 페이지 새로고침/탭 이동 후에도 로그인 상태가 유지된다.
//
// 환경변수가 없으면(설정 전, 자체 호스팅 등) null을 돌려준다 → 호출 측에서
// "로그인 기능 비활성화" 형태로 graceful degradation 한다.

import { createBrowserClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// 모듈 단위 캐싱 — 컴포넌트가 마운트될 때마다 클라이언트를 새로 만들면 세션 동기화가 깨진다.
let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 환경변수 미설정이면 클라우드 기능 자체를 끈다.
  // 콘티노트는 오프라인(localStorage)에서도 충분히 동작 가능해야 하므로 throw하지 않는다.
  if (!url || !key) return null;

  cachedClient = createBrowserClient(url, key);
  return cachedClient;
}

// 클라우드 저장 기능을 노출할지 여부를 외부에서 한 줄로 판별할 때 쓴다.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// CookieOptions는 콜백 라우트에서 타입 일관성을 맞추려 같이 export.
export type { CookieOptions };
