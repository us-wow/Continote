// 콘티 모음(저장된 콘티 세트) 클라우드 동기화 — Supabase conti_sets 테이블 기반.
// 로그인 상태에 따라 자동으로 클라우드 또는 localStorage로 라우팅한다.
//
// 설계 원칙:
// - 비로그인 상태에서는 기존 conti-storage(localStorage) 그대로 동작 — 기존 사용자 영향 X
// - 로그인 상태에서는 클라우드를 단일 소스로 사용 (localStorage는 fallback 캐시 역할만)
// - 첫 로그인 시 localStorage → 클라우드 자동 마이그레이션 (덮어쓰기 방지: 클라우드가 비어있을 때만)
//
// DB 스키마 매핑 (사용자가 만든 테이블):
//   conti_sets.id           = SavedSet.id (UUID)
//   conti_sets.name         = SavedSet.name
//   conti_sets.doc (jsonb)  = { songs, doc } 통째로 저장 — songs 컬럼을 따로 추가하지 않기 위함
//   conti_sets.created_at   = SavedSet.savedAt (ms로 변환)

import { getSupabaseClient } from './supabase';
import {
  listSavedSets as listLocal,
  saveSet as saveLocal,
  removeSet as removeLocal,
  type SavedSet,
} from './conti-storage';
import { ensureText } from './text-doc';
import type { Song } from './types';

async function getCurrentUserId(): Promise<string | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

// DB row를 SavedSet 형태로 변환. doc 컬럼 안에 { songs, doc }가 들어있다.
// 기존(Phase 2 이전) 저장 행의 doc는 Block[]일 수 있고, 새 저장은 string.
// ensureText()가 두 케이스 다 처리해 string으로 정규화한다.
function rowToSavedSet(row: any): SavedSet {
  const payload = row.doc ?? {};
  const savedAtSource = row.updated_at ?? row.created_at;
  return {
    id: row.id,
    name: row.name,
    savedAt: savedAtSource ? new Date(savedAtSource).getTime() : Date.now(),
    songs: Array.isArray(payload.songs) ? payload.songs : [],
    doc: ensureText(payload.doc),
  };
}

// 모든 콘티 세트 조회 (최근 순). 로그인 안 했으면 localStorage 반환.
export async function listSetsAsync(): Promise<SavedSet[]> {
  const userId = await getCurrentUserId();
  if (!userId) return []; // 컷: 비로그인은 클라우드만(로컬 보관함 없음)

  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('conti_sets')
    .select('id, name, doc, created_at, updated_at')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[conti-cloud] listSetsAsync 실패, localStorage로 fallback:', error.message);
    return listLocal();
  }
  return (data ?? []).map(rowToSavedSet);
}

// 새 콘티 세트 저장. 로그인 안 했으면 localStorage에 저장.
// Phase 3: doc은 단일 string (텍스트 모델). 기존 호출부는 ensureText로 변환됨.
export async function saveSetAsync(
  name: string,
  songs: Song[],
  doc: string
): Promise<SavedSet> {
  const userId = await getCurrentUserId();
  // 컷: 비로그인은 저장 불가 → 호출부가 잡아서 "로그인하면 저장돼요" 안내.
  if (!userId) throw new Error('로그인하면 저장돼요');

  const sb = getSupabaseClient()!;
  const { data, error } = await sb
    .from('conti_sets')
    .insert({
      user_id: userId,
      name: name.trim() || '제목 없음',
      doc: { songs, doc },
    })
    .select('id, name, doc, created_at, updated_at')
    .single();

  if (error || !data) {
    console.error('[conti-cloud] saveSetAsync 실패:', error?.message);
    throw new Error(error?.message ?? '저장 실패');
  }
  return rowToSavedSet(data);
}

// 특정 id 세트 삭제. 로그인 안 했으면 localStorage에서 삭제.
export async function removeSetAsync(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return; // 컷: 비로그인은 로컬 데이터가 없음

  const sb = getSupabaseClient()!;
  const { error } = await sb.from('conti_sets').delete().eq('id', id);
  if (error) {
    console.error('[conti-cloud] removeSetAsync 실패:', error.message);
    throw new Error(error.message);
  }
}

// 첫 로그인 시 localStorage → 클라우드 자동 업로드.
// 클라우드가 이미 비어있지 않으면 스킵 (덮어쓰기 방지).
// 반환 값: 옮긴 개수 + 스킵 사유.
export type MigrationResult =
  | { migrated: number; reason?: 'not_logged_in' | 'no_local' | 'cloud_not_empty' | 'error' }
  | { migrated: 0; reason: 'not_logged_in' | 'no_local' | 'cloud_not_empty' | 'error'; error?: string };

export async function migrateLocalToCloud(): Promise<MigrationResult> {
  const userId = await getCurrentUserId();
  if (!userId) return { migrated: 0, reason: 'not_logged_in' };

  const sb = getSupabaseClient()!;
  // 클라우드 데이터 존재 여부만 확인 (count + head로 row 안 받음).
  const { count, error: countError } = await sb
    .from('conti_sets')
    .select('id', { count: 'exact', head: true });
  if (countError) {
    return { migrated: 0, reason: 'error', error: countError.message };
  }
  if ((count ?? 0) > 0) return { migrated: 0, reason: 'cloud_not_empty' };

  const localSets = listLocal();
  if (localSets.length === 0) return { migrated: 0, reason: 'no_local' };

  // 일괄 insert. created_at/updated_at을 원래 저장 시각으로 맞춰 UI 정렬 유지.
  const rows = localSets.map((s) => ({
    user_id: userId,
    name: s.name,
    doc: { songs: s.songs, doc: s.doc },
    created_at: new Date(s.savedAt).toISOString(),
    updated_at: new Date(s.savedAt).toISOString(),
  }));
  const { error } = await sb.from('conti_sets').insert(rows);
  if (error) return { migrated: 0, reason: 'error', error: error.message };

  return { migrated: localSets.length };
}
