// 교회별 PPT 기본값(폰트, 배경, 저작권) 저장.
// 사용자가 매주 같은 설정을 반복 입력하지 않도록 한 번 저장 → 적용.

import type { PptFont, PptTheme } from './pptx';

const STORAGE_KEY = 'contionote-church-templates';

export type ChurchTemplate = {
  id: string;
  name: string; // 예: "OO교회 청년부 PPT"
  createdAt: number;
  // PPT 기본값
  font: PptFont;
  theme: PptTheme;
  ccliNumber?: string;
  licenseLabel?: string;
};

export function listTemplates(): ChurchTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChurchTemplate[];
    return Array.isArray(parsed) ? parsed.sort((a, b) => b.createdAt - a.createdAt) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(t: Omit<ChurchTemplate, 'id' | 'createdAt'>): ChurchTemplate {
  const next: ChurchTemplate = {
    ...t,
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    name: t.name.trim() || '제목 없음',
  };
  const all = listTemplates();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...all]));
  return next;
}

export function removeTemplate(id: string): void {
  const all = listTemplates();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(all.filter((t) => t.id !== id))
  );
}
