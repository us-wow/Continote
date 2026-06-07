// 서버 환경(Route Handler, Server Component, Server Action)에서 쓰는 Supabase 클라이언트.
// 브라우저 클라이언트와 다르게 Next.js의 cookies() API를 써서 세션 쿠키를 읽고 쓴다.
// OAuth 콜백 라우트에서 code → session 교환 시 이 클라이언트가 필요하다.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  // Next 14 Route Handler에서는 cookieStore.set()이 응답 쿠키에 직접 쓰여진다.
  // try/catch로 감싸는 이유 — Server Component 컨텍스트에서는 set이 불가능해 throw가 발생할 수 있고,
  // 그 경우는 무시해도 안전하다(미들웨어가 다음 요청에서 갱신).
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* Server Component에서는 호출 무시 */
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            /* Server Component에서는 호출 무시 */
          }
        },
      },
    }
  );
}
