// 배경 카탈로그 — 분류(절기·컨셉)·무료/유료·움직임 메타데이터의 단일 진실원(SSOT).
//
// 실제 배경 그림/색은 lib/pptx.ts(THEME_CONFIG)와 lib/slide-visual.ts(THEME_BG/FG/OVERLAY)가 가진다.
// 이 파일은 그 위에 "어느 분류인지 / 무료인지 유료인지 / 움직이는지"만 얹어 배경 패널 UI(검색·필터·배지)를 돌린다.
// 새 배경을 추가할 때: ① public/에 파일 → ② pptx.ts(PptTheme·THEME_CONFIG) → ③ slide-visual.ts(THEME_BG/FG/OVERLAY) → ④ 여기(BG_CATALOG) 한 줄.

import type { PptTheme } from '@/lib/pptx';

export type BgTier = 'free' | 'paid';

export type BgMeta = {
  key: PptTheme;
  categories: string[]; // 컨셉/절기 태그(검색·필터용). 예: '자연', '빛', '십자가', '묵상', '절기:성탄'
  tier: BgTier;
  animated: boolean; // 움직이는(GIF) 배경 여부 → "움직임" 배지
};

// 무료 = 단색 3 + 실사 3(십자가·성경책·일출). 나머지(실사·움직이는)는 전부 유료.
export const BG_CATALOG: BgMeta[] = [
  // ── 무료 ──
  { key: 'black', categories: ['단색'], tier: 'free', animated: false },
  { key: 'white', categories: ['단색'], tier: 'free', animated: false },
  { key: 'paper', categories: ['단색'], tier: 'free', animated: false },
  { key: 'cross', categories: ['십자가', '예배'], tier: 'free', animated: false },
  { key: 'bible', categories: ['예배'], tier: 'free', animated: false },
  { key: 'meadow', categories: ['자연'], tier: 'free', animated: false },

  // ── 유료 · 정적 실사 ──
  { key: 'sunrise', categories: ['자연', '빛'], tier: 'paid', animated: false },
  { key: 'godrays', categories: ['자연', '빛'], tier: 'paid', animated: false },
  { key: 'wheat', categories: ['자연', '절기:추수감사'], tier: 'paid', animated: false },
  { key: 'sea', categories: ['자연', '묵상'], tier: 'paid', animated: false },
  { key: 'flowers', categories: ['자연'], tier: 'paid', animated: false },
  { key: 'milkyway', categories: ['자연', '묵상'], tier: 'paid', animated: false },

  // ── 유료 · 움직이는 ──
  { key: 'light', categories: ['빛'], tier: 'paid', animated: true },
  { key: 'dawn', categories: ['빛', '묵상'], tier: 'paid', animated: true },
  { key: 'serene', categories: ['묵상'], tier: 'paid', animated: true },
  { key: 'green', categories: ['자연'], tier: 'paid', animated: true },
  { key: 'gold', categories: ['빛'], tier: 'paid', animated: true },
  { key: 'pink', categories: ['빛'], tier: 'paid', animated: true },
  { key: 'violet', categories: ['묵상'], tier: 'paid', animated: true },
  { key: 'wave', categories: ['자연', '묵상'], tier: 'paid', animated: true },
  { key: 'mist', categories: ['묵상'], tier: 'paid', animated: true },
  { key: 'candle', categories: ['묵상', '절기:성탄'], tier: 'paid', animated: true },
  { key: 'grace', categories: ['빛'], tier: 'paid', animated: true },
  { key: 'aurora', categories: ['묵상'], tier: 'paid', animated: true },
  { key: 'crosslight', categories: ['십자가', '빛'], tier: 'paid', animated: true },

  // ── 2026-06 추가 · 절기/컨셉(Pexels 상업무료) ──
  { key: 'easter', categories: ['절기', '절기:부활', '자연', '빛'], tier: 'paid', animated: false },
  { key: 'christmas', categories: ['절기', '절기:성탄', '묵상'], tier: 'paid', animated: false },
  { key: 'lent', categories: ['절기', '절기:사순', '십자가'], tier: 'paid', animated: false },
  { key: 'harvest', categories: ['절기', '절기:추수감사', '자연'], tier: 'paid', animated: false },
  { key: 'skyglow', categories: ['자연', '빛'], tier: 'paid', animated: false },
  { key: 'ocean', categories: ['자연', '묵상'], tier: 'paid', animated: false },
  { key: 'ripple', categories: ['자연', '묵상'], tier: 'paid', animated: true },
  { key: 'candlelive', categories: ['묵상', '절기', '절기:성탄'], tier: 'paid', animated: true },
  { key: 'dawnsea', categories: ['절기', '절기:부활', '자연', '묵상'], tier: 'paid', animated: false },
  { key: 'tomb', categories: ['절기', '절기:부활', '십자가'], tier: 'paid', animated: false },
  { key: 'starnight', categories: ['절기', '절기:성탄', '묵상'], tier: 'paid', animated: false },
  { key: 'nativity', categories: ['절기', '절기:성탄'], tier: 'paid', animated: false },
  { key: 'stormlight', categories: ['절기', '절기:사순', '빛'], tier: 'paid', animated: false },
  { key: 'churchcross', categories: ['절기', '절기:사순', '십자가'], tier: 'paid', animated: false },
  { key: 'wheatcloud', categories: ['절기', '절기:추수감사', '자연'], tier: 'paid', animated: false },
  { key: 'bluesky', categories: ['자연'], tier: 'paid', animated: false },
  { key: 'sunsetcloud', categories: ['자연', '빛'], tier: 'paid', animated: false },
  { key: 'goldsea', categories: ['자연', '묵상'], tier: 'paid', animated: false },
  { key: 'seaofclouds', categories: ['자연', '묵상'], tier: 'paid', animated: false },
  { key: 'mistymtn', categories: ['자연', '묵상'], tier: 'paid', animated: false },
  { key: 'forestray', categories: ['자연', '빛'], tier: 'paid', animated: false },
  { key: 'wildflower', categories: ['자연'], tier: 'paid', animated: false },
  { key: 'sunrays', categories: ['빛'], tier: 'paid', animated: false },
  { key: 'clouds', categories: ['자연', '빛'], tier: 'paid', animated: true },
];

// 필터 칩으로 보여줄 주요 분류(순서 고정). 절기 태그는 검색으로 찾게 둔다.
export const BG_FILTER_CATEGORIES = ['절기', '자연', '빛', '십자가', '묵상', '예배', '단색'];

// 한 배경이 검색어/분류에 맞는지 — label은 호출부에서 PPT_THEME_LABELS로 넘긴다.
export function bgMatches(meta: BgMeta, label: string, query: string, category: string | null): boolean {
  if (category && !meta.categories.includes(category)) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // 라벨·분류·절기 태그에 검색어 포함되면 매치
  if (label.toLowerCase().includes(q)) return true;
  if (meta.categories.some((c) => c.toLowerCase().includes(q))) return true;
  return false;
}
