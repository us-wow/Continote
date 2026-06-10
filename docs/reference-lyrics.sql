-- ─────────────────────────────────────────────────────────────────────────────
-- 콘티노트 "가사 대조 검토" 설치 SQL  (Supabase 대시보드 → SQL Editor에서 1회 실행)
--
-- 무엇을 만드나:
--   1) reference_lyrics 테이블 — 사용자가 '나누기 확정'한 가사를 제목 키로 쌓는 곳
--   2) submit_reference_lyrics()  — 확정 시 가사를 저장(같은 사용자+같은 제목이면 갱신)
--   3) compare_reference_lyrics() — 새 추출 가사를 확정본과 줄 단위로 대조해
--      일치율 + "거의 같은데 살짝 다른 줄"의 교정 제안만 돌려줌
--
-- 저작권/보안 설계 (중요):
--   - 테이블은 RLS만 켜고 정책을 하나도 안 만든다 → 누구도 직접 SELECT/INSERT 불가.
--   - 접근은 오직 아래 두 함수(SECURITY DEFINER)로만. compare는 "이미 거의 알고 있는 줄"의
--     오탈자 교정만 돌려주므로(전혀 다른 줄은 안 알려줌) 가사를 통째로 꺼내가는 건 불가능.
--   - 즉 "검토 보조"일 뿐 가사 재배포가 아님.
-- ─────────────────────────────────────────────────────────────────────────────

-- levenshtein(두 문자열이 몇 글자나 다른지) 함수를 쓰기 위한 확장
create extension if not exists fuzzystrmatch;

create table if not exists public.reference_lyrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  title_key text not null,          -- 정규화된 제목 (소문자 + 공백 정리) — 매칭 키
  content text not null,            -- 확정된 가사 전체 (묶음은 빈 줄로 구분)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 한 사용자당 같은 제목 1행 (재확정하면 갱신)
create unique index if not exists reference_lyrics_user_title
  on public.reference_lyrics (user_id, title_key);
create index if not exists reference_lyrics_title_key
  on public.reference_lyrics (title_key);

-- RLS 켜고 정책 없음 = 전면 차단. 아래 함수로만 접근.
alter table public.reference_lyrics enable row level security;

-- ── 1) 확정 가사 저장 ────────────────────────────────────────────────────────
create or replace function public.submit_reference_lyrics(p_title text, p_content text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  -- 로그인한 사용자만 기여 가능 (익명 스팸 방지)
  if auth.uid() is null then return; end if;
  if p_title is null or btrim(p_title) = '' then return; end if;
  if p_content is null or btrim(p_content) = '' then return; end if;
  -- 비정상 입력 가드
  if char_length(p_title) > 200 or char_length(p_content) > 50000 then return; end if;

  -- 클라이언트 normalizeTitle과 같은 규칙: 소문자 + 연속 공백 1칸
  v_key := lower(regexp_replace(btrim(p_title), '\s+', ' ', 'g'));

  insert into reference_lyrics (user_id, title, title_key, content)
  values (auth.uid(), btrim(p_title), v_key, p_content)
  on conflict (user_id, title_key)
  do update set content = excluded.content, title = excluded.title, updated_at = now();
end;
$$;

-- ── 2) 추출 가사 대조 ────────────────────────────────────────────────────────
-- 반환 jsonb 예:
--   { "found": true, "match_pct": 87, "total_lines": 24, "matched_lines": 21,
--     "diffs": [ { "mine": "주꼐 가까이", "suggestion": "주께 가까이" } ] }
create or replace function public.compare_reference_lyrics(p_title text, p_content text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_ref text;
  ref_lines text[];
  my_lines text[];
  line text;
  r text;
  matched int := 0;
  total int := 0;
  diffs jsonb := '[]'::jsonb;
  best text;
  best_d int;
  d int;
  thresh int;
begin
  if p_title is null or p_content is null then
    return jsonb_build_object('found', false);
  end if;
  if char_length(p_content) > 50000 then
    return jsonb_build_object('found', false);
  end if;

  v_key := lower(regexp_replace(btrim(p_title), '\s+', ' ', 'g'));

  -- 같은 제목의 가장 최근 확정본 1개 (자기 것 포함)
  select content into v_ref
  from reference_lyrics
  where title_key = v_key
  order by updated_at desc
  limit 1;

  if v_ref is null then
    return jsonb_build_object('found', false);
  end if;

  -- 줄 단위 정규화: 앞뒤 공백 정리 + 연속 공백 1칸 + 빈 줄 제거
  select array_agg(l) into ref_lines from (
    select regexp_replace(btrim(x), '\s+', ' ', 'g') as l
    from unnest(string_to_array(v_ref, E'\n')) as x
  ) t where l <> '';
  select array_agg(l) into my_lines from (
    select regexp_replace(btrim(x), '\s+', ' ', 'g') as l
    from unnest(string_to_array(p_content, E'\n')) as x
  ) t where l <> '';

  if my_lines is null or ref_lines is null then
    return jsonb_build_object('found', false);
  end if;

  foreach line in array my_lines loop
    total := total + 1;
    if line = any(ref_lines) then
      matched := matched + 1;
    else
      -- "거의 같은데 살짝 다른" 확정본 줄 찾기 (levenshtein = 다른 글자 수)
      best := null;
      best_d := null;
      foreach r in array ref_lines loop
        -- 길이 차이가 크면 비교 생략 (속도 + 무의미한 매칭 방지)
        if abs(char_length(r) - char_length(line)) <= 10
           and char_length(r) <= 200 and char_length(line) <= 200 then
          d := levenshtein(line, r);
          if best_d is null or d < best_d then
            best_d := d;
            best := r;
          end if;
        end if;
      end loop;
      -- 30% 이상 다르면 "다른 줄"이지 오탈자가 아님 → 제안 안 함 (가사 유출 방지 핵심)
      thresh := greatest(2, ceil(char_length(line) * 0.3));
      if best is not null and best_d <= thresh and jsonb_array_length(diffs) < 5 then
        diffs := diffs || jsonb_build_object('mine', line, 'suggestion', best);
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'found', true,
    'match_pct', (case when total = 0 then 0 else round(100.0 * matched / total) end)::int,
    'total_lines', total,
    'matched_lines', matched,
    'diffs', diffs
  );
end;
$$;

-- 함수 실행 권한: 저장은 로그인 사용자만, 대조는 누구나(추출은 비로그인도 가능하므로)
revoke all on function public.submit_reference_lyrics(text, text) from public;
revoke all on function public.compare_reference_lyrics(text, text) from public;
grant execute on function public.submit_reference_lyrics(text, text) to authenticated;
grant execute on function public.compare_reference_lyrics(text, text) to anon, authenticated;
