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
export type PptTheme = 'black' | 'white' | 'paper' | 'gradient' | 'meadow' | 'cross' | 'bible';

export const PPT_THEME_LABELS: Record<PptTheme, string> = {
  'black': '검정 (어두운 예배실)',
  'white': '흰색 (밝은 예배실)',
  'paper': '종이 톤 (따뜻한 분위기)',
  'gradient': '그라데이션 (베이지→잉크)',
  'meadow': '초원 톤 (녹색 그라데이션)',
  'cross': '십자가 톤 (보라 그라데이션)',
  'bible': '성경 톤 (갈색 그라데이션)',
};

type ThemeConfig =
  | { kind: 'solid'; bg: string; text: string }
  | { kind: 'gradient'; top: string; bottom: string; text: string };

const THEME_CONFIG: Record<PptTheme, ThemeConfig> = {
  // 검정은 어두운 예배실 투사 환경에서 가장 높은 대비를 주기 위해 선택했다.
  'black': { kind: 'solid', bg: '000000', text: 'FFFFFF' },
  // 흰색은 밝은 예배실과 인쇄/공유 화면에서 깨끗하게 보이도록 선택했다.
  'white': { kind: 'solid', bg: 'FFFFFF', text: '1F1B16' },
  // 종이 톤은 콘티노트의 따뜻한 문서 분위기와 찬양 가사에 어울리도록 선택했다.
  'paper': { kind: 'solid', bg: 'FAF5EC', text: '1F1B16' },
  // 베이지에서 잉크로 내려가는 그라데이션은 따뜻함과 묵직한 집중감을 함께 주기 위해 선택했다.
  'gradient': { kind: 'gradient', top: 'FAF5EC', bottom: '1F1B16', text: 'FFFFFF' },
  // 초원 톤은 자연스럽고 편안한 예배 분위기를 만들기 위해 녹색 계열로 선택했다.
  'meadow': { kind: 'gradient', top: '7BA776', bottom: '2E5232', text: 'FFFFFF' },
  // 십자가 톤은 절제된 보라색으로 경건하고 차분한 분위기를 주기 위해 선택했다.
  'cross': { kind: 'gradient', top: '4B3F72', bottom: '1F1B36', text: 'FFFFFF' },
  // 성경 톤은 가죽 표지와 오래된 종이의 묵직한 인상을 살리기 위해 갈색 계열로 선택했다.
  'bible': { kind: 'gradient', top: 'A37D5C', bottom: '4A3422', text: 'FFFFFF' },
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

export async function createGradientDataUrl(top: string, bottom: string): Promise<string> {
  // OffscreenCanvas는 DOM에 실제 canvas 엘리먼트를 붙이지 않고도 브라우저에서 PNG를 만들 수 있어
  // PPT 배경용 16:9 그라데이션 이미지를 다운로드 직전에 메모리에서 생성하기 적합하다.
  const canvas = new OffscreenCanvas(1920, 1080);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Failed to create gradient canvas context.');

  const gradient = context.createLinearGradient(0, 0, 0, 1080);
  gradient.addColorStop(0, `#${top}`);
  gradient.addColorStop(1, `#${bottom}`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 1920, 1080);

  const blob = await canvas.convertToBlob({ type: 'image/png' });

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read gradient PNG data.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Failed to convert gradient PNG to data URL.'));
        return;
      }
      resolve(reader.result.replace(/^data:/, ''));
    };
    reader.readAsDataURL(blob);
  });
}

// 모든 슬라이드 PPT로 변환해서 다운로드
export async function exportToPptx(
  slides: PptSlide[],
  font: PptFont,
  fileName: string,
  theme: PptTheme = 'black'
): Promise<void> {
  // Next.js 서버 렌더링 경로에서 pptxgenjs가 브라우저 API를 건드리지 않도록
  // 다운로드 시점에만 동적으로 로드한다.
  const pptxgen = (await import('pptxgenjs')).default;
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';

  // 테마에 맞는 배경/글자색 선택
  const config = THEME_CONFIG[theme];
  const gradientPng = config.kind === 'gradient'
    ? await createGradientDataUrl(config.top, config.bottom)
    : undefined;

  for (const pptSlide of slides) {
    const slide = pres.addSlide();
    slide.background = config.kind === 'solid'
      ? { color: config.bg }
      : { data: gradientPng };

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
      // 이미지/그라데이션 배경 위 글자 가독성을 위해 텍스트박스 뒤에 약한 반투명 검정 fill을 둔다.
      ...(config.kind === 'gradient' ? { fill: { color: '000000', transparency: 65 } } : {}),
      // 한도 통과 후에도 폰트마다 미세하게 박스를 넘는 케이스가 있어
      // PowerPoint의 자동 축소(shrink-to-fit)를 켜서 한 줄에 들어가게 보장한다.
      fit: 'shrink',
    });
  }

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}
