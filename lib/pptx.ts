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
    // 배경은 검정 단색 — 사용자 요청. 별 배경 이미지 사용 시 텍스트 가독성 저하 + 파일 용량 증가 문제가 있어 단순화.
    slide.background = { color: '000000' };

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
      // 한도 통과 후에도 폰트마다 미세하게 박스를 넘는 케이스가 있어
      // PowerPoint의 자동 축소(shrink-to-fit)를 켜서 한 줄에 들어가게 보장한다.
      fit: 'shrink',
    });
  }

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}
