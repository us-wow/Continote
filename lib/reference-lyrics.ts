// 가사 대조 검토 — "쌓고(확정 시) 대조한다(추출 시)".
//
// 흐름:
//   1) 사용자가 '나누기 확정'을 누르면 → submitReferenceLyrics()가 제목+가사를
//      Supabase reference_lyrics에 저장 (로그인 사용자만, 같은 제목은 갱신).
//   2) 새로 추출된 곡은 → compareReferenceLyrics()가 같은 제목의 확정본과
//      줄 단위로 대조해 일치율 + "살짝 다른 줄" 교정 제안을 받아온다.
//
// 저작권 설계: 남의 가사를 통째로 받아오는 게 아니라, DB 함수가
// "이미 거의 알고 있는 줄"의 오탈자 교정만 돌려준다 (docs/reference-lyrics.sql 참고).
//
// graceful degradation: Supabase 미설정·SQL 미설치(함수 없음)·비로그인이어도
// 에러를 던지지 않고 조용히 건너뛴다 → 기존 추출 흐름은 절대 안 막힘.

import type { Dispatch, SetStateAction } from 'react';
import { getSupabaseClient } from './supabase';
import type { Song, RefCheck } from './types';

// '새 곡' 같은 의미 없는 제목은 쌓지도 대조하지도 않는다
// (여러 사용자의 무제목 곡이 한 키에 섞이는 것 방지)
const EXCLUDED_TITLES = new Set(['새 곡', 'untitled', '제목 없음', '제목없음']);

function normalizeTitle(title: string): string {
  return (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isUsableTitle(title: string): boolean {
  const norm = normalizeTitle(title);
  return norm.length > 0 && !EXCLUDED_TITLES.has(norm);
}

// 곡의 묶음들을 빈 줄로 이어붙여 "가사 전체 텍스트"로 만든다 (저장·대조 공통 형식)
function joinSections(song: Song): string {
  return song.sections
    .map((s) => s.text)
    .filter((t) => t && t.trim())
    .join('\n\n');
}

// 확정한 가사를 쌓는다 — fire-and-forget (실패해도 사용자 흐름에 영향 없음)
export async function submitReferenceLyrics(song: Song): Promise<void> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return;
    if (!isUsableTitle(song.title)) return;
    const content = joinSections(song);
    if (!content.trim()) return;

    // 로그인 사용자만 기여 (RPC도 한 번 더 검사하지만, 불필요한 호출을 줄인다)
    const { data } = await sb.auth.getUser();
    if (!data.user) return;

    const { error } = await sb.rpc('submit_reference_lyrics', {
      p_title: song.title,
      p_content: content,
    });
    // SQL 미설치(함수 없음) 등 — 기능이 꺼진 것뿐이니 콘솔에만 남긴다
    if (error) console.warn('[ref-lyrics] 저장 건너뜀:', error.message);
  } catch (err) {
    console.warn('[ref-lyrics] 저장 실패(무시):', err);
  }
}

// 추출된 곡을 확정본과 대조한다. 확정본이 없으면 null.
export async function compareReferenceLyrics(song: Song): Promise<RefCheck | null> {
  try {
    const sb = getSupabaseClient();
    if (!sb) return null;
    if (!isUsableTitle(song.title)) return null;
    const content = joinSections(song);
    if (!content.trim()) return null;

    const { data, error } = await sb.rpc('compare_reference_lyrics', {
      p_title: song.title,
      p_content: content,
    });
    if (error || !data || data.found !== true) return null;

    return {
      matchPct: Number(data.match_pct) || 0,
      totalLines: Number(data.total_lines) || 0,
      matchedLines: Number(data.matched_lines) || 0,
      diffs: Array.isArray(data.diffs)
        ? data.diffs
            .filter((d: any) => d && typeof d.mine === 'string' && typeof d.suggestion === 'string')
            .map((d: any) => ({ mine: d.mine, suggestion: d.suggestion }))
        : [],
    };
  } catch (err) {
    console.warn('[ref-lyrics] 대조 실패(무시):', err);
    return null;
  }
}

// 추출 직후 새 곡들에 대조 결과를 비동기로 붙인다.
// 곡 객체의 identity(===)로 매칭하므로, 대조가 끝나기 전에 사용자가 그 곡을
// 수정했다면(객체가 교체됨) 낡은 결과를 덮어쓰지 않고 조용히 건너뛴다.
export function attachRefChecks(
  newSongs: Song[],
  setSongs: Dispatch<SetStateAction<Song[]>>
): void {
  for (const song of newSongs) {
    void compareReferenceLyrics(song).then((refCheck) => {
      if (!refCheck) return;
      setSongs((prev) => prev.map((s) => (s === song ? { ...s, refCheck } : s)));
    });
  }
}
