// 콘티 세트(contionote 콘티 한 묶음)을 localStorage에 저장/불러오기.
// 사용자가 명시적으로 "저장"을 누를 때만 저장하고(자동 저장 X — 사용자 요청),
// "불러오기"로 과거 콘티를 다시 끌어다 쓸 수 있게 한다.

import type { Song } from './types';
import { ensureText } from './text-doc';

// localStorage 키 — 콘티노트 전용 namespace
const STORAGE_KEY = 'contionote-saved-sets';

// 저장되는 한 콘티의 형태.
// Phase 3에서 doc 모델이 Block[] → string으로 바뀜.
// 기존 사용자가 저장해둔 Block[] 형태는 ensureText로 자동 변환하여 호환 유지.
export type SavedSet = {
  id: string;
  name: string;
  savedAt: number;
  songs: Song[];
  // 콘티 본문 — 텍스트 단일 string. 빈 줄=슬라이드 분리.
  // 기존 Block[] 데이터는 ensureText()에서 자동 변환됨.
  doc: string;
};

// 모든 저장 세트를 시각 역순으로 반환 (최근 순).
// 기존 Block[] 데이터 자동 마이그레이션 포함.
export function listSavedSets(): SavedSet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<SavedSet, 'doc'> & { doc: unknown }>;
    if (!Array.isArray(parsed)) return [];
    // 최근 저장 순 정렬 + doc 형태 자동 변환 (string 또는 Block[])
    return [...parsed]
      .sort((a, b) => b.savedAt - a.savedAt)
      .map((s) => ({ ...s, doc: ensureText(s.doc) }));
  } catch {
    return [];
  }
}

// 새 콘티 세트 저장 (id 자동 생성)
export function saveSet(name: string, songs: Song[], doc: string): SavedSet {
  const set: SavedSet = {
    id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || '제목 없음',
    savedAt: Date.now(),
    songs,
    doc,
  };
  const all = listSavedSets();
  // 같은 이름이 있어도 그대로 두 개 저장 — 사용자가 직접 정리하도록 (덮어쓰기 강요 X)
  const next = [set, ...all];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return set;
}

// 특정 id 세트 삭제
export function removeSet(id: string): void {
  const all = listSavedSets();
  const next = all.filter((s) => s.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
