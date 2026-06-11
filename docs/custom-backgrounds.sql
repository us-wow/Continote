-- ─────────────────────────────────────────────────────────────────────────────
-- 콘티노트 "내 배경" 저장 기능 설치 SQL (Supabase)
--   1) Storage 버킷 custom-backgrounds — 공개 읽기, 쓰기/삭제는 본인 폴더만
--   2) custom_backgrounds 테이블 — 배경 목록(이름·경로·종류), RLS 본인 전용
-- 인당 개수 제한(5개)은 앱이 검사하고, 여기서도 트리거로 한 번 더 막는다.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('custom-backgrounds', 'custom-backgrounds', true)
on conflict (id) do nothing;

-- 업로드: 인증 사용자가 자기 user_id 폴더에만
create policy "custom bg insert own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'custom-backgrounds'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 삭제: 본인 폴더만
create policy "custom bg delete own folder"
on storage.objects for delete to authenticated
using (
  bucket_id = 'custom-backgrounds'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create table if not exists public.custom_backgrounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  file_path text not null,
  kind text not null check (kind in ('image', 'gif')),
  size_bytes int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.custom_backgrounds enable row level security;

create policy "custom bg select own" on public.custom_backgrounds
  for select to authenticated using (user_id = auth.uid());
create policy "custom bg insert own" on public.custom_backgrounds
  for insert to authenticated with check (user_id = auth.uid());
create policy "custom bg delete own" on public.custom_backgrounds
  for delete to authenticated using (user_id = auth.uid());

-- 인당 5개 제한 — 앱 검사를 우회해도 DB가 막는다
create or replace function public.check_custom_bg_quota()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from custom_backgrounds where user_id = new.user_id) >= 5 then
    raise exception '배경은 최대 5개까지 저장할 수 있어요';
  end if;
  return new;
end;
$$;

drop trigger if exists custom_bg_quota on public.custom_backgrounds;
create trigger custom_bg_quota
before insert on public.custom_backgrounds
for each row execute function public.check_custom_bg_quota();
