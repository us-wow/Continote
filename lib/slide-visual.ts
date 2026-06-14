// 슬라이드 "미리보기 시각" 단일 진실원(SSOT).
//
// 미리보기 카드(LivePreview / PreviewModal)가 쓰는 배경·글자색·오버레이·폰트 매핑을 한 곳에 모은다.
// 원칙: 이 값들은 lib/pptx.ts의 "실제 PPT 출력"을 화면으로 베낀 거울이다 → 실제 출력과 어긋나면 안 된다.
// (예전에는 PreviewModal 안에 흩어져 있어 LivePreview에서 재사용할 수 없었고, cross 색이 실제와 달랐다.)

import type { PptFont, PptTheme, PptVAlign } from '@/lib/pptx';

// 테마별 카드 배경 (실사·GIF는 public 이미지 + 폴백색, 단색은 색만).
export const THEME_BG: Record<PptTheme, string> = {
  // custom(내 교회 PPT)은 사용자가 올린 이미지로 런타임에 결정 — 여기 값은 이미지 없을 때 폴백.
  custom: '#FFFFFF',
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  // 움직이는 홀리 13종 — GIF + 로드 전 폴백색(배경의 주조색). 미리보기 카드도 움직인다.
  light: "url('/pptx-bg-light.gif') center/cover, #04060D",
  dawn: "url('/pptx-bg-dawn.gif') center/cover, #1F0F20",
  serene: "url('/pptx-bg-serene.gif') center/cover, #0A142B",
  green: "url('/pptx-bg-green.gif') center/cover, #0A1F14",
  gold: "url('/pptx-bg-gold.gif') center/cover, #241804",
  pink: "url('/pptx-bg-pink.gif') center/cover, #260D1B",
  violet: "url('/pptx-bg-violet.gif') center/cover, #150E2E",
  wave: "url('/pptx-bg-wave.gif') center/cover, #060D1C",
  mist: "url('/pptx-bg-mist.gif') center/cover, #141B28",
  candle: "url('/pptx-bg-candle.gif') center/cover, #170E06",
  grace: "url('/pptx-bg-grace.gif') center/cover, #0E0A1E",
  aurora: "url('/pptx-bg-aurora.gif') center/cover, #050A18",
  crosslight: "url('/pptx-bg-crosslight.gif') center/cover, #0C0908",
  meadow: "url('/pptx-bg-meadow.jpg') center/cover, #B8D27A",
  cross: "url('/pptx-bg-cross.jpg') center/cover, #1a140e",
  bible: "url('/pptx-bg-bible.jpg') center/cover, #c19b6e",
  sunrise: "url('/pptx-bg-sunrise.jpg') center/cover, #E8C8A0",
  milkyway: "url('/pptx-bg-milkyway.jpg') center/cover, #060A14",
  godrays: "url('/pptx-bg-godrays.jpg') center/cover, #2A2418",
  wheat: "url('/pptx-bg-wheat.jpg') center/cover, #C89A50",
  sea: "url('/pptx-bg-sea.jpg') center/cover, #A8C4D8",
  flowers: "url('/pptx-bg-flowers.jpg') center/cover, #B89060",
  // 2026-06 추가 — 절기·컨셉
  easter: "url('/pptx-bg-easter.jpg') center/cover, #C9C2B8",
  christmas: "url('/pptx-bg-christmas.jpg') center/cover, #120E0A",
  lent: "url('/pptx-bg-lent.jpg') center/cover, #14161F",
  harvest: "url('/pptx-bg-harvest.jpg') center/cover, #C89A50",
  skyglow: "url('/pptx-bg-skyglow.jpg') center/cover, #C99B8A",
  ocean: "url('/pptx-bg-ocean.jpg') center/cover, #A8C4D8",
  ripple: "url('/pptx-bg-ripple.gif') center/cover, #0A1420",
  candlelive: "url('/pptx-bg-candlelive.gif') center/cover, #1A1206",
};

// 테마별 글자색 (lib/pptx.ts THEME_CONFIG의 text 값과 일치해야 한다).
export const THEME_FG: Record<PptTheme, string> = {
  custom: '#1F1B16',
  black: '#FFFFFF',
  white: '#1F1B16',
  paper: '#1F1B16',
  // 움직이는 홀리 13종은 전부 어두운 배경 → 흰 글자.
  light: '#FFFFFF',
  dawn: '#FFFFFF',
  serene: '#FFFFFF',
  green: '#FFFFFF',
  gold: '#FFFFFF',
  pink: '#FFFFFF',
  violet: '#FFFFFF',
  wave: '#FFFFFF',
  mist: '#FFFFFF',
  candle: '#FFFFFF',
  grace: '#FFFFFF',
  aurora: '#FFFFFF',
  crosslight: '#FFFFFF',
  meadow: '#1F1B16',
  // cross: 실제 PPT 출력(lib/pptx.ts: text '1F1B16' + 흰 오버레이)과 맞춘다.
  // 예전 미리보기는 '#F4E8D2'(밝은 글자) + 어두운 오버레이라 실제 출력과 달랐다 → 버그 수정.
  cross: '#1F1B16',
  bible: '#1F1B16',
  sunrise: '#1F1B16',
  milkyway: '#FFFFFF',
  godrays: '#1F1B16',
  wheat: '#1F1B16',
  sea: '#1F1B16',
  flowers: '#1F1B16',
  // 2026-06 추가 — 밝은 사진=검정글자, 어두운 사진/움직이는=흰글자
  easter: '#1F1B16',
  harvest: '#1F1B16',
  skyglow: '#1F1B16',
  ocean: '#1F1B16',
  christmas: '#FFFFFF',
  lent: '#FFFFFF',
  ripple: '#FFFFFF',
  candlelive: '#FFFFFF',
};

// 실사 이미지 테마는 흰 반투명 오버레이 위에 검정 글자 (lib/pptx.ts useOverlay 규칙과 일치).
export const THEME_OVERLAY: Partial<Record<PptTheme, string>> = {
  meadow: 'rgba(255,255,255,0.65)',
  // cross: 실제 출력은 흰 오버레이(useOverlay=true) — 예전 'rgba(0,0,0,0.40)'(어두운)는 버그였음.
  cross: 'rgba(255,255,255,0.65)',
  bible: 'rgba(255,255,255,0.55)',
  sunrise: 'rgba(255,255,255,0.65)',
  godrays: 'rgba(255,255,255,0.65)',
  wheat: 'rgba(255,255,255,0.65)',
  sea: 'rgba(255,255,255,0.65)',
  flowers: 'rgba(255,255,255,0.65)',
  // 내 교회 PPT — 실제 출력(overlay:true, 흰 65%)과 동일 톤.
  custom: 'rgba(255,255,255,0.65)',
  // 2026-06 추가 — 밝은 실사만 흰 오버레이(어두운/움직이는은 오버레이 없음).
  easter: 'rgba(255,255,255,0.55)',
  harvest: 'rgba(255,255,255,0.6)',
  skyglow: 'rgba(255,255,255,0.5)',
  ocean: 'rgba(255,255,255,0.6)',
};

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
