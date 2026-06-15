// 추출한 곡을 localStorage에 자동 누적해 다음에 재사용한다.
// 같은 제목 곡은 최신으로 갱신(중복 누적 X).
// 검색은 제목 + 섹션 text 모두 대상.

import type { Song } from './types';

export type LibrarySong = Song & {
  id: string;        // title 기반 안정적 id (정규화)
  savedAt: number;   // 저장/갱신 시각 ms
};

const STORAGE_KEY = 'contionote-song-library';
const MAX_KEEP = 200; // localStorage 한도(약 5MB) 보호

// 제목을 안정적 id로 정규화 (공백/특수문자 정리)
function makeId(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function listLibrary(): LibrarySong[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibrarySong[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.savedAt - a.savedAt) : [];
  } catch {
    return [];
  }
}

// 추출된 곡들을 라이브러리에 누적/갱신.
// 같은 id(정규화된 title) 있으면 최신 sections로 덮어쓰기.
export function addToLibrary(songs: Song[]): void {
  if (typeof window === 'undefined') return;
  if (!songs || songs.length === 0) return;
  const existing = listLibrary();
  const map = new Map<string, LibrarySong>();
  for (const s of existing) map.set(s.id, s);
  for (const s of songs) {
    const id = makeId(s.title || 'untitled');
    map.set(id, { ...s, id, savedAt: Date.now() });
  }
  // 최신 순 정렬 + 한도 컷
  const all = Array.from(map.values())
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, MAX_KEEP);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function removeFromLibrary(id: string): void {
  if (typeof window === 'undefined') return;
  const all = listLibrary();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(all.filter((s) => s.id !== id))
  );
}
