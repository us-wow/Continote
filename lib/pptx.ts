// 폰트 옵션 4종
export type PptFont = 'nanum-myeongjo' | 'noto-serif-kr' | 'nanum-square' | 'noto-sans-kr';

// 폰트 표시 라벨 (UI에서 사용)
export const PPT_FONT_LABELS: Record<PptFont, string> = {
  'nanum-myeongjo': '나눔명조',
  'noto-serif-kr': '본명조 Pro',
  'nanum-square': '나눔스퀘어',
  'noto-sans-kr': '본고딕',
};

// 한 슬라이드의 입력 — 이미 줄바꿈으로 분리된 lines
export type PptSlide = {
  lines: string[]; // 각 항목이 한 줄
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

const SLIDE_TEXT_RULES: Record<number, { maxCharsPerLine: number; fontSize: number }> = {
  1: { maxCharsPerLine: 14, fontSize: 96 },
  2: { maxCharsPerLine: 17, fontSize: 80 },
  3: { maxCharsPerLine: 21, fontSize: 64 },
  4: { maxCharsPerLine: 25, fontSize: 54 },
};

// 한 슬라이드 검증 + 폰트사이즈 자동 결정
export function validateSlide(slide: PptSlide): PptValidation {
  const lineCount = slide.lines.length;

  // 빈 슬라이드는 사용자가 의도적으로 여백을 넣을 수 있어 허용하고,
  // 실제 표시 텍스트가 없으므로 최대 크기 기준인 96pt를 돌려준다.
  if (lineCount === 0) return { ok: true, fontSize: 96, lineCount: 0 };

  // 16:9 와이드 슬라이드의 가운데 텍스트 박스에서 읽기 좋은 최대 줄 수를 4줄로 제한한다.
  // 5줄 이상은 예배/발표 화면에서 한눈에 읽기 어려워 검증 실패로 처리한다.
  if (lineCount >= 5) return { ok: false, reason: 'too-many-lines', lineCount };

  const { maxCharsPerLine, fontSize } = SLIDE_TEXT_RULES[lineCount];

  // 14/17/21/25자와 96/80/64/54pt는 16:9 가운데 정렬 가독성 기준이다.
  // Array.from으로 세면 한글과 이모지 같은 유니코드 문자를 화면 글자 단위에 가깝게 다룰 수 있다.
  if (slide.lines.some((line) => Array.from(line).length > maxCharsPerLine)) {
    return { ok: false, reason: 'line-too-long', lineCount, maxCharsPerLine };
  }

  return { ok: true, fontSize, lineCount };
}

// 모든 슬라이드 PPT로 변환해서 다운로드
export async function exportToPptx(
  slides: PptSlide[],
  font: PptFont,
  fileName: string
): Promise<void> {
  // Next.js 서버 렌더링 경로에서 pptxgenjs가 브라우저 API를 건드리지 않도록
  // 다운로드 시점에만 동적으로 로드한다.
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  for (const pptSlide of slides) {
    const slide = pres.addSlide();
    slide.background = { path: '/pptx-bg-starry.png' };

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
      color: 'FFFFFF',
      fontFace: FONT_FACE_MAP[font],
      fontSize: validation.ok ? validation.fontSize : 32,
      paraSpaceAfter: 8,
      bold: false,
    });
  }

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}
