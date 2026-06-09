import type { Slide } from './text-doc';

// 폰트 옵션 4종
export type PptFont = 'nanum-myeongjo' | 'noto-serif-kr' | 'nanum-square' | 'noto-sans-kr';

// 폰트 표시 라벨 (UI에서 사용)
export const PPT_FONT_LABELS: Record<PptFont, string> = {
  'nanum-myeongjo': '나눔명조',
  'noto-serif-kr': '본명조 Pro',
  'nanum-square': '나눔스퀘어',
  'noto-sans-kr': '본고딕',
};

// 슬라이드 배경 템플릿 — 예배 분위기에 따라 선택
export type PptTheme = 'black' | 'white' | 'paper' | 'light' | 'dawn' | 'serene' | 'meadow' | 'cross' | 'bible';

export const PPT_THEME_LABELS: Record<PptTheme, string> = {
  'black': '검정 (어두운 예배실)',
  'white': '흰색 (밝은 예배실)',
  'paper': '종이 톤 (따뜻한 분위기)',
  // 홀리 그라데이션 3종 — scripts/gen-holy-bg.mjs로 생성한 빛/글로우 배경.
  'light': '빛내림 (어두운 예배실)',
  'dawn': '새벽 (따뜻한 톤)',
  'serene': '고요한빛 (밝은 예배실)',
  'meadow': '초원 (실사 이미지)',
  'cross': '십자가 (실사 이미지)',
  'bible': '성경책 (실사 이미지)',
};

// 슬라이드 세로 정렬 — 가사/제목을 화면의 위/가운데/아래 어디에 둘지 선택.
// 기본은 'middle'(가운데, 기존 동작). 예배실 스크린 위치나 하단 자막 영역에 따라 위·아래로 옮긴다.
// 이 값 하나가 미리보기(PreviewModal)와 실제 PPT 출력(아래 addText valign)에 동시에 적용된다.
export type PptVAlign = 'top' | 'middle' | 'bottom';

export const PPT_VALIGN_LABELS: Record<PptVAlign, string> = {
  'top': '상단',
  'middle': '가운데',
  'bottom': '하단',
};

type ThemeConfig =
  | { kind: 'solid'; bg: string; text: string }
  // overlay: 글자 가독성용 흰 반투명 레이어 사용 여부. 실사 사진은 true(기본),
  // 자체 대비가 충분한 그라데이션 배경은 false로 둬서 색이 흐려지지 않게 한다.
  | { kind: 'image'; path: string; text: string; overlay?: boolean };

const THEME_CONFIG: Record<PptTheme, ThemeConfig> = {
  // 검정은 어두운 예배실 투사 환경에서 가장 높은 대비를 주기 위해 선택했다.
  'black': { kind: 'solid', bg: '000000', text: 'FFFFFF' },
  // 흰색은 밝은 예배실과 인쇄/공유 화면에서 깨끗하게 보이도록 선택했다.
  'white': { kind: 'solid', bg: 'FFFFFF', text: '1F1B16' },
  // 종이 톤은 콘티노트의 따뜻한 문서 분위기와 찬양 가사에 어울리도록 선택했다.
  'paper': { kind: 'solid', bg: 'FAF5EC', text: '1F1B16' },
  // gradient는 이미지 오버레이 방식과 시각 규칙을 단순화하기 위해 제거했다.
  // 초원/십자가/성경책은 Unsplash 무료 저작권 이미지를 public/에 다운로드해서 사용한다.
  // 이미지 위 글자 가독성을 위해 흰 반투명 레이어를 먼저 깔고 검정 글자를 올린다.
  'meadow': { kind: 'image', path: '/pptx-bg-meadow.jpg', text: '1F1B16' },
  'cross': { kind: 'image', path: '/pptx-bg-cross.jpg', text: '1F1B16' },
  'bible': { kind: 'image', path: '/pptx-bg-bible.jpg', text: '1F1B16' },
  // 홀리 그라데이션 3종 — 자체 대비가 충분하므로 overlay를 끈다(흰 반투명 레이어 생략).
  // light/dawn는 어두운 배경이라 흰 글자, serene는 밝은 배경이라 검정 글자.
  'light': { kind: 'image', path: '/pptx-bg-light.jpg', text: 'FFFFFF', overlay: false },
  'dawn': { kind: 'image', path: '/pptx-bg-dawn.jpg', text: 'FFFFFF', overlay: false },
  'serene': { kind: 'image', path: '/pptx-bg-serene.jpg', text: '1F1B16', overlay: false },
};

// 한 슬라이드의 입력 — text-doc.ts의 Slide와 동일 구조를 그대로 재사용.
// 이전에는 { lines: string[] }로 평탄화되어 title/memo도 lyric처럼 그려졌다 →
// 제목 슬라이드가 PPT에서 볼드 처리가 안 되는 회귀의 원인이었음.
export type PptSlide = Slide;

export type PptCopyrightInfo = {
  // 사용자가 입력하지 않으면 곡 제목만 자동 표기
  songTitles: string[];
  ccliNumber?: string;
  licenseLabel?: string;
};

// 사이징 결과 — 이제는 "통과/실패"가 아니라 항상 통과시키고 글씨 크기만 돌려준다.
// (2026-05-31 변경: 줄 수/길이로 내보내기를 막지 않고, 글씨를 자동으로 줄여서 담는다.)
// ok 필드는 기존 호출부(app/page.tsx, app/m/page.tsx)와의 호환을 위해 남겨두며 항상 true다.
export type PptValidation = { ok: true; fontSize: number; lineCount: number };

const FONT_FACE_MAP: Record<PptFont, string> = {
  'nanum-myeongjo': 'Nanum Myeongjo',
  'noto-serif-kr': 'Noto Serif KR',
  'nanum-square': 'NanumSquare',
  'noto-sans-kr': 'Noto Sans KR',
};

// ── 가사 슬라이드 글씨 크기 자동 결정 ──────────────────────────────────
// 2026-05-31 변경: 예전에는 "한 슬라이드 4줄 + 줄당 글자수" 한도를 넘으면
// 빨간 경고를 띄우고 PPT 내보내기를 막았다(사용자가 직접 줄을 나눠야 했음).
// 이제는 막지 않고 "글씨를 알아서 줄여서 한 슬라이드에 담는다"는 방향으로 바꾼다.
//   1) 줄 수가 많을수록 글씨를 줄인다 (세로로 안 넘치게).
//   2) 한 줄이 길수록 글씨를 줄인다 (가로로 안 넘치게).
//   3) 단, MIN_FONT_SIZE 밑으로는 안 내려간다 (예배 화면 가독성 최소 한계 — 사용자 요청).
//      그래도 줄이 길면 PowerPoint 텍스트 박스가 알아서 다음 줄로 줄바꿈하고,
//      addText의 fit:'shrink'가 마지막 안전망으로 살짝 더 맞춰준다.

// 글씨 크기 상·하한 (pt)
const MAX_FONT_SIZE = 56; // 1줄 짧은 가사일 때 가장 큰 크기
const MIN_FONT_SIZE = 24; // 이 밑으로는 자동으로 안 줄임 — 너무 작으면 예배 화면에서 안 보이니까

// 줄 수에 따른 '세로 기준' 글씨 크기. 줄이 많아질수록 한 화면에 다 담기도록 작아진다.
// (16:9 와이드 가운데 박스 실측 기반. 표에 없는 줄 수(8줄 이상)는 최소값을 쓴다.)
const HEIGHT_FONT_BY_LINES: Record<number, number> = {
  1: 56,
  2: 48,
  3: 38,
  4: 32,
  5: 28,
  6: 26,
  7: 24,
};

// '가로 기준' 용량 상수 — (글씨크기 × 한 줄 글자수)가 대략 이 값을 넘으면 가로로 넘친다.
// 기존 한도표(56×19 ≈ 48×24 ≈ 38×29 ≈ 32×36 ≈ 1100)에서 뽑은 평균값.
const BOX_CHAR_CAPACITY = 1080;

// 한 가사 슬라이드의 글씨 크기를 계산한다 (결과는 항상 MIN~MAX 사이).
function computeLyricFontSize(lines: string[]): number {
  // 실제 글자가 있는 줄만 센다 (공백 줄은 크기 계산에서 제외).
  const visible = lines.filter((line) => line.trim().length > 0);
  if (visible.length === 0) return MAX_FONT_SIZE;

  // 세로 기준 — 줄 수가 표에 없으면(8줄 이상) 최소 글씨로.
  const heightFont = HEIGHT_FONT_BY_LINES[visible.length] ?? MIN_FONT_SIZE;

  // 가로 기준 — 가장 긴 줄의 글자수로 결정.
  // Array.from으로 세면 한글·이모지 같은 유니코드 문자를 화면 글자 단위에 가깝게 센다.
  const longest = Math.max(...visible.map((line) => Array.from(line).length));
  const widthFont = longest > 0 ? Math.floor(BOX_CHAR_CAPACITY / longest) : MAX_FONT_SIZE;

  // 세로·가로 중 더 빡빡한(작은) 쪽을 택하고, 최소~최대 범위로 자른다.
  const raw = Math.min(heightFont, widthFont);
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, raw));
}

// 한 슬라이드의 글씨 크기 결정. 더 이상 줄 수/길이로 막지 않고 항상 통과시킨다.
// title/memo 슬라이드는 자체 레이아웃 규칙이 따로 있어 고정 크기를 돌려준다.
export function validateSlide(slide: PptSlide): PptValidation {
  if (slide.kind === 'title' || slide.kind === 'memo') {
    return { ok: true, fontSize: 56, lineCount: 1 };
  }
  const lineCount = slide.lines.length;

  // 빈 슬라이드(의도적 여백)는 표시 텍스트가 없으므로 큰 크기로 fallback.
  if (lineCount === 0) return { ok: true, fontSize: MAX_FONT_SIZE, lineCount: 0 };

  // 줄 수·길이에 맞춰 글씨를 자동으로 줄여서 한 슬라이드에 담는다.
  return { ok: true, fontSize: computeLyricFontSize(slide.lines), lineCount };
}

// public/ 경로의 이미지 파일을 fetch해서 base64로 변환.
// pptxgenjs background.path는 브라우저에서 동작하지 않아 'image/jpeg;base64,...' 형식의 data 문자열이 필요하다.
async function loadPublicImageAsBase64(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`이미지를 가져오지 못했습니다 (${res.status}): ${path}`);
  const blob = await res.blob();
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  // 'data:' 접두사 제거 → pptxgenjs가 받는 형식
  return dataUrl.replace(/^data:/, '');
}

// 모든 슬라이드 PPT로 변환해서 다운로드
export async function exportToPptx(
  slides: PptSlide[],
  font: PptFont,
  fileName: string,
  theme: PptTheme = 'black',
  copyright?: PptCopyrightInfo,
  // 세로 정렬 — 기본값 'middle'로 두어 기존 호출/동작과 호환. 제목·메모·가사 슬라이드에 적용한다.
  verticalAlign: PptVAlign = 'middle'
): Promise<void> {
  // Next.js 서버 렌더링 경로에서 pptxgenjs가 브라우저 API를 건드리지 않도록
  // 다운로드 시점에만 동적으로 로드한다.
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  // 테마에 맞는 배경/글자색 선택. 이미지는 한 번만 만들어 모든 슬라이드 재사용.
  const config = THEME_CONFIG[theme];
  // 흰 반투명 오버레이 사용 여부 — 실사 사진은 기본 ON, 그라데이션(overlay:false)은 OFF.
  const useOverlay = config.kind === 'image' ? config.overlay !== false : false;
  // 흰 글자 테마(빛내림/새벽)인지 — 이미지 로드 실패 시 폴백 배경색을 정하는 데 쓴다.
  const isLightText = config.kind === 'image' && config.text.toUpperCase() === 'FFFFFF';
  let bgData: string | undefined;
  if (config.kind === 'image') {
    try {
      bgData = await loadPublicImageAsBase64(config.path);
    } catch (err) {
      console.warn('이미지 배경 로드 실패 → 단색으로 대체:', err);
    }
  }

  const applyThemeBackground = (slide: ReturnType<typeof pres.addSlide>) => {
    if (config.kind === 'solid') {
      slide.background = { color: config.bg };
    } else if (bgData) {
      slide.background = { data: bgData };
      // 실사 이미지는 글자 가독성을 위해 흰 반투명 레이어를 깐다.
      // 그라데이션 배경은 자체 대비가 충분해 레이어를 생략(useOverlay=false)한다.
      if (useOverlay) {
        slide.addShape('rect', {
          x: 0,
          y: 0,
          w: 13.333,
          h: 7.5,
          fill: { color: 'FFFFFF', transparency: 35 },
          line: { type: 'none' },
        });
      }
    } else {
      // 이미지 로드 실패 시 글자색과 대비되는 단색으로 폴백 (흰 글자면 어두운 배경).
      slide.background = { color: isLightText ? '111111' : 'FFFFFF' };
    }
  };

  // 슬라이드 박스 공통 위치 — 모든 종류에서 동일
  const boxFrame = { x: 0.5, y: 0.5, w: 12.333, h: 6.5 } as const;

  for (const pptSlide of slides) {
    const slide = pres.addSlide();
    applyThemeBackground(slide);

    if (pptSlide.kind === 'title') {
      // 제목 슬라이드 — 제목은 크고 굵게, 부제는 작게.
      // 미리보기(PreviewModal.tsx)가 fontWeight: 700으로 그리는 것과 일치시킨다.
      // pptxgenjs의 addText는 [{ text, options }] 배열을 받으면 paragraph마다 다른 스타일이 가능.
      const paragraphs: { text: string; options: Record<string, unknown> }[] = [
        { text: pptSlide.title, options: { bold: true, fontSize: 60 } },
      ];
      if (pptSlide.subtitle) {
        paragraphs.push({
          text: pptSlide.subtitle,
          // breakLine: true 로 줄바꿈을 명시. 부제는 본문 가독성을 위해 살짝 작게.
          options: { bold: false, fontSize: 28, breakLine: true },
        });
      }
      slide.addText(paragraphs as any, {
        ...boxFrame,
        align: 'center',
        valign: verticalAlign,
        color: config.text,
        fontFace: FONT_FACE_MAP[font],
        paraSpaceAfter: 12,
        fit: 'shrink',
      });
      continue;
    }

    if (pptSlide.kind === 'memo') {
      // 메모 슬라이드 — 광고/기도제목 같은 자유 텍스트. 가사보다 살짝 작은 폰트.
      slide.addText(pptSlide.text, {
        ...boxFrame,
        align: 'center',
        valign: verticalAlign,
        color: config.text,
        fontFace: FONT_FACE_MAP[font],
        fontSize: 36,
        paraSpaceAfter: 8,
        bold: false,
        fit: 'shrink',
      });
      continue;
    }

    // 가사 슬라이드 (kind === 'lyric')
    // 줄 수·줄 길이에 맞춰 자동 계산된 글씨 크기를 쓴다 (항상 24~56pt 사이).
    const { fontSize } = validateSlide(pptSlide);
    slide.addText(pptSlide.lines.join('\n'), {
      ...boxFrame,
      align: 'center',
      valign: verticalAlign,
      color: config.text,
      fontFace: FONT_FACE_MAP[font],
      fontSize,
      paraSpaceAfter: 8,
      bold: false,
      // 자동 글씨 크기가 최소(24pt)에 닿았는데도 줄이 길면, PowerPoint가 박스 안에서
      // 자동으로 줄바꿈 + 살짝 더 축소(shrink-to-fit)해서 한 슬라이드에 담기게 한다.
      fit: 'shrink',
    });
  }

  // 저작권(CCLI) 슬라이드 제거됨 — 한국 교회는 거의 안 써서. copyright 파라미터는 호환 위해 남겨두고 미사용.

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}
