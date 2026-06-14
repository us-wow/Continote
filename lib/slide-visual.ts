// 슬라이드 "미리보기 시각" 단일 진실원(SSOT).
//
// 미리보기 카드(LivePreview / PreviewModal)가 쓰는 배경·글자색·오버레이·폰트 매핑을 한 곳에 모은다.
// 원칙: 이 값들은 lib/pptx.ts의 "실제 PPT 출력"을 화면으로 베낀 거울이다 → 실제 출력과 어긋나면 안 된다.
// (예전에는 PreviewModal 안에 흩어져 있어 LivePreview에서 재사용할 수 없었고, cross 색이 실제와 달랐다.)

import type { PptFont, PptTheme, PptVAlign } from '@/lib/pptx';
import { BG_DEFS } from '@/lib/bg-catalog';

// 아래 세 맵(THEME_BG/FG/OVERLAY)은 모두 배경 SSOT(BACKGROUNDS)에서 파생된다.
// → 실제 PPT 출력(lib/pptx.ts)과 같은 원천을 쓰므로 미리보기와 출력이 어긋날 수 없다.
const _bg: Record<string, string> = {};
const _fg: Record<string, string> = {};
const _overlay: Record<string, string> = {};
for (const d of BG_DEFS) {
  if (d.solid) {
    _bg[d.key] = '#' + d.solid.bg;
    _fg[d.key] = '#' + d.solid.text;
  } else {
    const im = d.image!;
    // custom(내 교회 PPT)은 path가 비어 폴백색만, 나머지는 "이미지 + 폴백색".
    _bg[d.key] = im.path === '' ? im.previewColor : `url('${im.path}') center/cover, ${im.previewColor}`;
    _fg[d.key] = '#' + im.text;
    // 흰 스크림(오버레이)이 정의된 이미지만 가독성 레이어를 올린다.
    if (im.overlay) _overlay[d.key] = im.overlay;
  }
}

// 테마별 카드 배경 (실사·GIF는 public 이미지 + 폴백색, 단색은 색만).
export const THEME_BG = _bg as Record<PptTheme, string>;

// 테마별 글자색 (lib/pptx.ts THEME_CONFIG의 text 값과 일치).
export const THEME_FG = _fg as Record<PptTheme, string>;

// 실사 이미지 테마는 흰 반투명 오버레이 위에 검정 글자 (lib/pptx.ts useOverlay 규칙과 일치).
export const THEME_OVERLAY = _overlay as Partial<Record<PptTheme, string>>;

// 미리보기 글씨체를 실제 PPT 출력 폰트와 일치시킨다 (layout.tsx가 해당 웹폰트를 로드해야 함).
export const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'nanum-gothic': "'Nanum Gothic', 'Noto Sans KR', 'Pretendard Variable', sans-serif",
  'nanum-myeongjo': "'Nanum Myeongjo', 'Noto Serif KR', serif",
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-square': "'NanumSquare', 'Noto Sans KR', 'Pretendard Variable', sans-serif",
  'noto-sans-kr': "'Noto Sans KR', 'Pretendard Variable', sans-serif",
};

export type SlideVisual = { bg: string; fg: string; overlay?: string };

// 한 테마의 카드 배경/글자색/오버레이를 계산한다.
// 곡별 배경에서 슬라이드마다 다른 테마를 쓰므로 함수로 둔다.
export function themeVisual(
  theme: PptTheme,
  customBgUrl?: string | null,
  customBgIsGif?: boolean
): SlideVisual {
  const isCustomGif = theme === 'custom' && customBgIsGif === true;
  // 커스텀 GIF는 어두운 배경 가정 → 오버레이 없이 흰 글자 (lib/pptx.ts와 동일 규칙).
  const overlay = isCustomGif ? undefined : THEME_OVERLAY[theme];
  const fg = isCustomGif ? '#FFFFFF' : THEME_FG[theme];
  // custom 테마면 사용자가 올린 이미지를 카드 배경으로 (실제 PPT 출력과 동일한 그림).
  const bg =
    theme === 'custom' && customBgUrl
      ? `url('${customBgUrl}') center/cover, ${isCustomGif ? '#000000' : '#FFFFFF'}`
      : THEME_BG[theme];
  return { bg, fg, overlay };
}

// 세로 정렬값(top/middle/bottom) → flexbox alignItems (실제 PPT valign과 일치).
export function vAlignToFlex(v: PptVAlign): 'flex-start' | 'center' | 'flex-end' {
  return v === 'top' ? 'flex-start' : v === 'bottom' ? 'flex-end' : 'center';
}

// pt → cqw(카드 폭의 %) 환산. 실제 슬라이드(가로 13.333in ≈ 960px) 비율로 글씨를 그린다.
// 0.95는 폰트 미세 차이로 글자가 줄을 이탈하지 않게 하는 안전 여유.
export const ptToCqw = (pt: number) => `${((pt / 960) * 95).toFixed(2)}cqw`;
