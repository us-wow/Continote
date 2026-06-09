// 곡 라이브러리 클라우드 동기화 — Supabase songs 테이블.
// 비로그인 → song-library(localStorage), 로그인 → songs 테이블.
//
// 동작 차이 한 가지:
// localStorage 버전은 같은 제목이면 자동으로 최신 sections로 덮어쓴다(makeId 기반).
// 클라우드는 unique 제약을 안 걸어둬서 client-side에서 동등 제목 행을 미리 찾아 update하거나 insert한다.
// (사용자가 SQL을 한 번 더 돌리지 않게 하기 위함)

import { getSupabaseClient } from './supabase';
import {
  listLibrary as listLocal,
  addToLibrary as addLocal,
  removeFromLibrary as removeLocal,
  type LibrarySong,
} from './song-library';
import type { Song } from './types';

async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// 같은 곡인지 비교할 때 쓰는 정규화 키 — song-library.makeId와 동일 규칙.
function normalizeTitle(title: string): string {
  return (title || 'untitled').trim().toLowerCase().replace(/\s+/g, ' ');
}

function rowToLibrarySong(row: any): LibrarySong {
  const ts = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  return {
    id: row.id,
    title: row.title,
    sections: Array.isArray(row.sections) ? row.sections : [],
    savedAt: ts,
  };
}

export async function listLibraryAsync(): Promise<LibrarySong[]> {
  const userId = await getCurrentUserId();
  // 컷: 비로그인은 저장 안 함 → 라이브러리는 클라우드(로그인)만. 로컬 조회 X.
  if (!userId) return [];

  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('songs')
    .select('id, title, sections, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[song-cloud] listLibraryAsync 실패, 로컬 fallback:', error.message);
    return listLocal();
  }
  return (data ?? []).map(rowToLibrarySong);
}

// 추출된 곡들을 라이브러리에 누적/갱신.
// 이미 같은 제목 행이 있으면 sections를 update, 없으면 insert.
export async function addToLibraryAsync(songs: Song[]): Promise<void> {
  if (!songs || songs.length === 0) return;
  const userId = await getCurrentUserId();
  // 컷: 비로그인은 누적 저장 안 함(로컬 X). 로그인해야 클라우드에 쌓임.
  if (!userId) return;

  const sb = getSupabaseClient()!;
  // 사용자의 기존 곡 제목 목록을 한 번에 가져와 client-side에서 매칭.
  const { data: existing, error: fetchError } = await sb
    .from('songs')
    .select('id, title')
    .order('created_at', { ascending: false });
  if (fetchError) {
    console.error('[song-cloud] addToLibraryAsync 조회 실패:', fetchError.message);
    return;
  }
  const titleToId = new Map<string, string>();
  for (const r of existing ?? []) {
    titleToId.set(normalizeTitle(r.title), r.id);
  }

  // 같은 제목은 update, 처음 보는 제목은 insert로 분리.
  const toUpdate: { id: string; sections: any[] }[] = [];
  const toInsert: { user_id: string; title: string; sections: any[] }[] = [];
  for (const song of songs) {
    const norm = normalizeTitle(song.title);
    const existingId = titleToId.get(norm);
    if (existingId) {
      toUpdate.push({ id: existingId, sections: song.sections });
    } else {
      toInsert.push({
        user_id: userId,
        title: song.title || 'Untitled',
        sections: song.sections,
      });
      // 같은 배치 안에서 중복 입력 방지 — 이번에 insert될 제목도 map에 미리 등록.
      titleToId.set(norm, 'pending');
    }
  }

  // update는 한 행씩(supabase-js는 single-where update가 기본). 행 수가 많지 않아 충분히 빠르다.
  for (const u of toUpdate) {
    const { error } = await sb
      .from('songs')
      .update({ sections: u.sections })
      .eq('id', u.id);
    if (error) console.error('[song-cloud] update 실패:', error.message);
  }
  if (toInsert.length > 0) {
    const { error } = await sb.from('songs').insert(toInsert);
    if (error) console.error('[song-cloud] insert 실패:', error.message);
  }
}

export async function removeFromLibraryAsync(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return; // 컷: 비로그인은 로컬 데이터가 없음
  const sb = getSupabaseClient()!;
  const { error } = await sb.from('songs').delete().eq('id', id);
  if (error) console.error('[song-cloud] remove 실패:', error.message);
}

// 로그인 마이그레이션 — localStorage 곡들을 클라우드로 "병합" 업로드.
// (예전엔 "클라우드가 비었을 때만" 올려서, 한 번이라도 로그인했던 계정은 로컬 곡이 누락됐음.
//  이제 클라우드에 데이터가 있어도 항상 병합한다.)
export async function migrateSongLibraryToCloud(): Promise<{ migrated: number }> {
  const userId = await getCurrentUserId();
  if (!userId) return { migrated: 0 };

  const local = listLocal();
  if (local.length === 0) return { migrated: 0 };

  // addToLibraryAsync가 제목 매칭으로 update/insert를 처리 → 클라우드 상태와 무관하게
  // 로컬 곡이 전부 올라가고, 같은 제목은 갱신되어 중복이 안 생긴다.
  await addToLibraryAsync(local);
  return { migrated: local.length };
}
