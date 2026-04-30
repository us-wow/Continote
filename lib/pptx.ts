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
export type PptTheme = 'black' | 'white' | 'paper' | 'meadow' | 'cross' | 'bible';

export const PPT_THEME_LABELS: Record<PptTheme, string> = {
  'black': '검정 (어두운 예배실)',
  'white': '흰색 (밝은 예배실)',
  'paper': '종이 톤 (따뜻한 분위기)',
  'meadow': '초원 (실사 이미지)',
  'cross': '십자가 (실사 이미지)',
  'bible': '성경책 (실사 이미지)',
};

type ThemeConfig =
  | { kind: 'solid'; bg: string; text: string }
  | { kind: 'image'; path: string; text: string };

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
};

// 한 슬라이드의 입력 — 이미 줄바꿈으로 분리된 lines
export type PptSlide = {
  lines: string[]; // 각 항목이 한 줄
};

export type PptCopyrightInfo = {
  // 사용자가 입력하지 않으면 곡 제목만 자동 표기
  songTitles: string[];
  ccliNumber?: string;
  licenseLabel?: string;
};

// 검증/사이징 결과
export type PptValidation =
  | { ok: true; fontSize: number; lineCount: number }
  | { ok: false; reason: 'too-many-lines'; lineCount: number }
  | { ok: false; reason: 'line-too-long'; lineCount: number; maxCharsPerLine: number };

const FONT_FACE_MAP: Record<PptFont, string> = {
  'nanum-myeongjo': 'Nanum Myeongjo',
  'noto-serif-kr': 'Noto Serif KR',
  'nanum-square': 'NanumSquare',
  'noto-sans-kr': 'Noto Sans KR',
};

// 한도는 실제 PowerPoint에서 한국어 명조 + 16:9 가운데 정렬 박스 폭 기준 실측치(보수적).
// 22자에서도 줄이 밀리는 케이스가 있어 한도를 한 글자 정도 더 줄이고,
// 추가 안전망으로 addText에 fit:'shrink'를 켜서 박스를 넘치면 PowerPoint가 자동으로 살짝 축소한다.
const SLIDE_TEXT_RULES: Record<number, { maxCharsPerLine: number; fontSize: number }> = {
  1: { maxCharsPerLine: 17, fontSize: 64 },
  2: { maxCharsPerLine: 21, fontSize: 54 },
  3: { maxCharsPerLine: 26, fontSize: 44 },
  4: { maxCharsPerLine: 32, fontSize: 36 },
};

// 한 슬라이드 검증 + 폰트사이즈 자동 결정
export function validateSlide(slide: PptSlide): PptValidation {
  const lineCount = slide.lines.length;

  // 빈 슬라이드는 사용자가 의도적으로 여백을 넣을 수 있어 허용하고,
  // 실제 표시 텍스트가 없으므로 최대 크기인 64pt(1줄)를 돌려준다.
  if (lineCount === 0) return { ok: true, fontSize: 64, lineCount: 0 };

  // 16:9 와이드 슬라이드의 가운데 텍스트 박스에서 읽기 좋은 최대 줄 수를 4줄로 제한한다.
  // 5줄 이상은 예배/발표 화면에서 한눈에 읽기 어려워 검증 실패로 처리한다.
  if (lineCount >= 5) return { ok: false, reason: 'too-many-lines', lineCount };

  const { maxCharsPerLine, fontSize } = SLIDE_TEXT_RULES[lineCount];

  // 20/25/30/36자와 64/54/44/36pt는 16:9 가운데 정렬 + 모니터 투영 가독성 기준이다.
  // Array.from으로 세면 한글과 이모지 같은 유니코드 문자를 화면 글자 단위에 가깝게 다룰 수 있다.
  if (slide.lines.some((line) => Array.from(line).length > maxCharsPerLine)) {
    return { ok: false, reason: 'line-too-long', lineCount, maxCharsPerLine };
  }

  return { ok: true, fontSize, lineCount };
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
  copyright?: PptCopyrightInfo
): Promise<void> {
  // Next.js 서버 렌더링 경로에서 pptxgenjs가 브라우저 API를 건드리지 않도록
  // 다운로드 시점에만 동적으로 로드한다.
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  // 테마에 맞는 배경/글자색 선택. 이미지는 한 번만 만들어 모든 슬라이드 재사용.
  const config = THEME_CONFIG[theme];
  let bgData: string | undefined;
  if (config.kind === 'image') {
    try {
      bgData = await loadPublicImageAsBase64(config.path);
    } catch (err) {
      console.warn('이미지 배경 로드 실패 → 흰색 단색으로 대체:', err);
    }
  }

  const applyThemeBackground = (slide: ReturnType<typeof pres.addSlide>) => {
    if (config.kind === 'solid') {
      slide.background = { color: config.bg };
    } else if (bgData) {
      slide.background = { data: bgData };
      // 이미지 위 글자 가독성을 위해 슬라이드 전체에 흰 반투명 레이어를 깐다.
      // 텍스트는 이 레이어 위에 검정색으로 올려 배경 디테일과 충돌하지 않게 한다.
      slide.addShape('rect', {
        x: 0,
        y: 0,
        w: 13.333,
        h: 7.5,
        fill: { color: 'FFFFFF', transparency: 35 },
        line: { type: 'none' },
      });
    } else {
      // 이미지 로드 실패 시 검정 글자가 보이도록 흰색 단색 fallback을 사용한다.
      slide.background = { color: 'FFFFFF' };
    }
  };

  for (const pptSlide of slides) {
    const slide = pres.addSlide();
    applyThemeBackground(slide);
    const validation = validateSlide(pptSlide);

    // 검증 실패 슬라이드도 파일 생성을 막지 않고, 사용자가 내용을 확인할 수 있게
    // 32pt fallback으로 작게 넣는다.
    slide.addText(pptSlide.lines.join('\n'), {
      x: 0.5,
      y: 0.5,
      w: 12.333,
      h: 6.5,
      align: 'center',
      valign: 'middle',
      color: config.text,
      fontFace: FONT_FACE_MAP[font],
      fontSize: validation.ok ? validation.fontSize : 32,
      paraSpaceAfter: 8,
      bold: false,
      // 한도 통과 후에도 폰트마다 미세하게 박스를 넘는 케이스가 있어
      // PowerPoint의 자동 축소(shrink-to-fit)를 켜서 한 줄에 들어가게 보장한다.
      fit: 'shrink',
    });
  }

  if (copyright && copyright.songTitles.length > 0) {
    const slide = pres.addSlide();
    applyThemeBackground(slide);
    const licenseInfo = [
      copyright.ccliNumber ? `CCLI ${copyright.ccliNumber}` : '',
      copyright.licenseLabel ?? '',
    ].filter(Boolean).join(' · ');
    const text = licenseInfo
      ? `${copyright.songTitles.join('\n')}\n${licenseInfo}`
      : copyright.songTitles.join('\n');

    // 한국 교회 관행상 PPT 마지막에 곡 정보 표기. 사용자가 입력 안 하면 자동으로 곡 제목만
    slide.addText(text, {
      x: 0.5,
      y: 0.5,
      w: 12.333,
      h: 6.5,
      align: 'center',
      valign: 'middle',
      color: config.text,
      fontFace: FONT_FACE_MAP[font],
      fontSize: 18,
      paraSpaceAfter: 8,
      bold: false,
      fit: 'shrink',
    });
  }

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}
