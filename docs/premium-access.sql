-- 무료 체험/프리미엄 허용 명단 — 결제 붙기 전까지 이 표가 "구독자 명단" 역할.
-- 유선우가 Supabase 대시보드(Table Editor)에서 직접 행을 추가/삭제한다.
--   email: 체험자의 구글 로그인 이메일 (소문자 무관)
--   note: 메모 (어느 교회, 누구)
--   expires_at: 체험 만료일 — 지나면 자동으로 다시 잠김. 비우면 무기한.
create table if not exists public.premium_access (
  email text primary key,
  note text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.premium_access enable row level security;

-- 로그인한 사용자가 "자기 이메일 행"만 조회 가능 (남의 명단은 안 보임)
create policy "premium access self check" on public.premium_access
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
