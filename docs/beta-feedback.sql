-- 베타 피드백 테이블 (2026-06-18)
-- 첫 다운로드 직후 인앱 카드에서 받는 가벼운 피드백.
-- 익명 사용자(로그인 안 한 사람)도 남길 수 있어야 하므로 anon insert를 허용한다.
-- 읽기는 막아서(정책 없음) 본인 데이터 노출을 차단 — 수집된 피드백은 대시보드에서만 본다.

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  sentiment text,                         -- 'up' | 'down' (좋아요/아쉬워요)
  message text,                           -- 한 줄 자유 의견 (선택)
  user_id uuid,                           -- 로그인 사용자면 기록, 익명이면 null
  ua text,                                -- user agent (기기/브라우저 파악용)
  created_at timestamptz not null default now()
);

alter table public.beta_feedback enable row level security;

-- 누구나(익명 포함) 피드백을 남길 수 있다. 읽기/수정/삭제 정책은 만들지 않아 차단된다.
drop policy if exists "beta_feedback_insert_anyone" on public.beta_feedback;
create policy "beta_feedback_insert_anyone" on public.beta_feedback
  for insert with check (true);

create index if not exists beta_feedback_created_idx
  on public.beta_feedback (created_at desc);
