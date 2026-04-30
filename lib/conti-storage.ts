// 콘티 세트(contionote 콘티 한 묶음)을 localStorage에 저장/불러오기.
// 사용자가 명시적으로 "저장"을 누를 때만 저장하고(자동 저장 X — 사용자 요청),
// "불러오기"로 과거 콘티를 다시 끌어다 쓸 수 있게 한다.

import type { Song } from './types';

// localStorage 키 — 콘티노트 전용 namespace
const STORAGE_KEY = 'contionote-saved-sets';

// 저장되는 한 콘티의 형태 (page.tsx의 Block 타입과 호환되도록 광역 타입으로 둔다)
export type SavedSet = {
  id: string; // 고유 식별자 (저장 시각 ms 기반)
  name: string; // 사용자가 입력한 이름 (예배명 / 날짜 등)
  savedAt: number; // 저장 시각 ms (정렬용)
  songs: Song[];
  doc: any[]; // Block[] — circular import 회피를 위해 any로 둠
};

// 모든 저장 세트를 시각 역순으로 반환 (최근 순)
export function listSavedSets(): SavedSet[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedSet[];
    if (!Array.isArray(parsed)) return [];
    // 최근 저장 순 정렬
    return [...parsed].sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// 새 콘티 세트 저장 (id 자동 생성)
export function saveSet(name: string, songs: Song[], doc: any[]): SavedSet {
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

// 사람이 읽기 좋은 시각 표기 (예: "오늘 14:32" / "어제" / "4월 28일")
export function formatSavedAt(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
