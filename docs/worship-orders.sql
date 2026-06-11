-- 예배 순서 빌더 템플릿 테이블 (2026-06-12)
-- Supabase 대시보드 → SQL Editor에서 한 번 실행하면 끝.
-- conti_sets와 같은 패턴: doc(jsonb)에 블록 배열 통째로, RLS로 본인 것만.

create table if not exists public.worship_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '제목 없음',
  doc jsonb not null default '{}'::jsonb, -- { blocks: WorshipBlock[] }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.worship_orders enable row level security;

-- 본인 행만 읽기/쓰기/수정/삭제
create policy "worship_orders_select_own" on public.worship_orders
  for select using (auth.uid() = user_id);
create policy "worship_orders_insert_own" on public.worship_orders
  for insert with check (auth.uid() = user_id);
create policy "worship_orders_update_own" on public.worship_orders
  for update using (auth.uid() = user_id);
create policy "worship_orders_delete_own" on public.worship_orders
  for delete using (auth.uid() = user_id);

create index if not exists worship_orders_user_idx
  on public.worship_orders (user_id, updated_at desc);
