import type { Slide } from './text-doc';

// 폰트 옵션 5종 — 나눔고딕이 기본(첫 외부 사용자 피드백: 가장 보기 좋다고 함)
export type PptFont = 'nanum-gothic' | 'nanum-myeongjo' | 'noto-serif-kr' | 'nanum-square' | 'noto-sans-kr';

// 폰트 표시 라벨 (UI에서 사용)
export const PPT_FONT_LABELS: Record<PptFont, string> = {
  'nanum-gothic': '나눔고딕',
  'nanum-myeongjo': '나눔명조',
  'noto-serif-kr': '본명조',
  'nanum-square': '나눔스퀘어',
  'noto-sans-kr': '본고딕',
};

// 슬라이드 배경 템플릿 — 예배 분위기에 따라 선택
// light~violet 7종 = 움직이는 홀리 배경(빛내림 + 글로우·빛망울 색 계열 6종)
// 'custom' = 사용자가 직접 올린 교회 PPT 이미지 (유료 예정이지만 현재 전체 공개)
export type PptTheme =
  | 'black' | 'white' | 'paper' | 'meadow' | 'cross' | 'bible'
  | 'light' | 'dawn' | 'serene' | 'green' | 'gold' | 'pink' | 'violet'
  | 'wave' | 'mist' | 'candle' | 'grace' | 'aurora' | 'crosslight'
  | 'custom';

export const PPT_THEME_LABELS: Record<PptTheme, string> = {
  'black': '검정 (어두운 예배실)',
  'white': '흰색 (밝은 예배실)',
  'paper': '종이 톤 (따뜻한 분위기)',
  // 움직이는 홀리 배경 — scripts/gen-holy-bg.mjs로 생성(발표 모드에서 재생).
  'light': '빛내림 (광선 다발)',
  'dawn': '새벽 (따뜻한 빛망울)',
  'serene': '푸른빛 (고요한 밤)',
  'green': '초록빛 (깊은 숲)',
  'gold': '금빛 (감사와 영광)',
  'pink': '분홍빛 (따뜻한 사랑)',
  'violet': '보랏빛 (경건한 묵상)',
  'wave': '물결 (달빛 수면)',
  'mist': '안개 (새벽 묵상)',
  'candle': '촛불 (따뜻한 기도)',
  'grace': '빛가루 (내리는 은혜)',
  'aurora': '오로라 (밤하늘 물결)',
  'crosslight': '십자가빛 (역광)',
  'meadow': '초원 (실사 이미지)',
  'cross': '십자가 (실사 이미지)',
  'bible': '성경책 (실사 이미지)',
  'custom': '내 교회 PPT (직접 등록)',
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
  // animated: 움직이는 GIF 배경. PowerPoint는 '배경 채우기'에 넣은 GIF를 첫 프레임
  // 정지화면으로만 보여주므로, 슬라이드 맨 뒤 전면 이미지(addImage)로 깔아야 움직인다.
  // fallback: 이미지 로드 실패 시(또는 GIF 뒤 안전망) 깔리는 단색 배경.
  | { kind: 'image'; path: string; text: string; overlay?: boolean; animated?: boolean; fallback?: string };

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
  // 움직이는 홀리 배경 7종 — GIF(scripts/gen-holy-bg.mjs v4, 4초 무한 루프).
  // 슬라이드쇼(발표) 모드에서만 움직이고 편집 화면에선 정지로 보인다(PowerPoint 동작).
  // 전부 어두운 배경이라 글자는 흰색, overlay 끔. fallback = 각 배경의 주조색.
  'light': { kind: 'image', path: '/pptx-bg-light.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '04060D' },
  'dawn': { kind: 'image', path: '/pptx-bg-dawn.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '1F0F20' },
  'serene': { kind: 'image', path: '/pptx-bg-serene.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '0A142B' },
  'green': { kind: 'image', path: '/pptx-bg-green.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '0A1F14' },
  'gold': { kind: 'image', path: '/pptx-bg-gold.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '241804' },
  'pink': { kind: 'image', path: '/pptx-bg-pink.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '260D1B' },
  'violet': { kind: 'image', path: '/pptx-bg-violet.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '150E2E' },
  'wave': { kind: 'image', path: '/pptx-bg-wave.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '060D1C' },
  'mist': { kind: 'image', path: '/pptx-bg-mist.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '141B28' },
  'candle': { kind: 'image', path: '/pptx-bg-candle.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '170E06' },
  'grace': { kind: 'image', path: '/pptx-bg-grace.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '0E0A1E' },
  'aurora': { kind: 'image', path: '/pptx-bg-aurora.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '050A18' },
  'crosslight': { kind: 'image', path: '/pptx-bg-crosslight.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '0C0908' },
  // 내 교회 PPT — 이미지 데이터는 exportToPptx의 customBgData 파라미터로 받는다(path 미사용).
  // 실사 테마처럼 흰 반투명 오버레이를 깔아 "투명도를 낮추고 가사를 얹는" 효과를 낸다.
  'custom': { kind: 'image', path: '', text: '1F1B16', overlay: true },
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
  // 'NanumGothic'(붙여쓰기)이 글꼴 파일의 실제 내부 family명 — 임베드 글꼴과 정확히 일치해야 연결됨.
  'nanum-gothic': 'NanumGothic',
  'nanum-myeongjo': 'Nanum Myeongjo',
  'noto-serif-kr': 'Noto Serif KR',
  'nanum-square': 'NanumSquare',
  'noto-sans-kr': 'Noto Sans KR',
};

// 임베드(글꼴 포함) 지원 글꼴 — public/fonts/의 서브셋 파일(scripts/gen-subset-font.py로 생성).
// 여기 없는 글꼴은 "글꼴 포함" 토글을 켜도 일반 PPT로 나간다.
const EMBED_FONT_FILES: Partial<Record<PptFont, { path: string; type: 'otf' | 'ttf' }>> = {
  'noto-serif-kr': { path: '/fonts/noto-serif-kr-kr.otf', type: 'otf' },
  'nanum-gothic': { path: '/fonts/nanum-gothic-kr.ttf', type: 'ttf' },
};

// UI에서 "이 글꼴은 포함돼요" 안내에 쓰는 헬퍼
export const isEmbeddableFont = (font: PptFont): boolean => Boolean(EMBED_FONT_FILES[font]);

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
  verticalAlign: PptVAlign = 'middle',
  // 글꼴 포함(임베드) — 켜고 본명조를 고르면 서브셋 글꼴을 PPT에 심어 글꼴 없는 PC에서도 그대로 보임.
  embedFont: boolean = false,
  // 내 교회 PPT(custom 테마) 배경 이미지 — FileReader dataURL 그대로 받는다.
  customBgData?: string
): Promise<void> {
  // Next.js 서버 렌더링 경로에서 pptxgenjs가 브라우저 API를 건드리지 않도록
  // 다운로드 시점에만 동적으로 로드한다.
  const pptxgen = (await import('pptxgenjs')).default;

  // 글꼴 임베드 — EMBED_FONT_FILES에 서브셋 파일이 있는 글꼴(본명조·나눔고딕)만 지원.
  // pptx-embed-fonts로 감싼 클래스를 쓰면 writeFile 때 글꼴이 PPT에 자동으로 심긴다.
  // 실패하면(라이브러리/네트워크) 조용히 일반 PPT로 폴백 → 다운로드 자체는 항상 된다.
  const embedFile = EMBED_FONT_FILES[font];
  const canEmbed = embedFont && Boolean(embedFile);
  let pres: InstanceType<typeof pptxgen>;
  if (canEmbed && embedFile) {
    try {
      // @ts-ignore — 서브패스('./pptxgenjs')에 타입 선언이 없어 무시
      const { withPPTXEmbedFonts } = await import('pptx-embed-fonts/pptxgenjs');
      const Enhanced = withPPTXEmbedFonts(pptxgen);
      const embedPres = new Enhanced();
      const res = await fetch(embedFile.path);
      if (!res.ok) throw new Error(`글꼴 파일 로드 실패 (${res.status})`);
      const fontBuf = await res.arrayBuffer();
      await embedPres.addFont({ fontFace: FONT_FACE_MAP[font], fontFile: fontBuf, fontType: embedFile.type });
      pres = embedPres as unknown as InstanceType<typeof pptxgen>;
    } catch (err) {
      console.warn('글꼴 임베드 실패 → 일반 PPT로 대체:', err);
      pres = new pptxgen();
    }
  } else {
    pres = new pptxgen();
  }
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
      if (theme === 'custom') {
        // 사용자가 올린 이미지 — pptxgenjs는 'data:' 접두사 없는 형식을 받는다.
        bgData = customBgData ? customBgData.replace(/^data:/, '') : undefined;
      } else {
        bgData = await loadPublicImageAsBase64(config.path);
      }
    } catch (err) {
      console.warn('이미지 배경 로드 실패 → 단색으로 대체:', err);
    }
  }

  const applyThemeBackground = (slide: ReturnType<typeof pres.addSlide>) => {
    if (config.kind === 'solid') {
      slide.background = { color: config.bg };
    } else if (bgData && config.animated) {
      // 움직이는 GIF 배경 — '배경 채우기'에 넣으면 PowerPoint가 첫 프레임 정지화면만
      // 보여주므로, 슬라이드 맨 처음(=맨 뒤 레이어)에 전면 이미지로 깐다.
      // 뒤에 단색을 깔아 GIF 로드가 늦거나 실패해도 글자가 읽히게 한다.
      // 재생은 슬라이드쇼(발표) 모드에서만 된다 — 편집 화면에선 정지로 보이는 게 정상.
      slide.background = { color: config.fallback ?? '000000' };
      slide.addImage({ data: bgData, x: 0, y: 0, w: 13.333, h: 7.5 });
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

  if (config.kind === 'image' && config.animated && bgData) {
    // 움직이는 배경은 pptxgenjs가 슬라이드마다 같은 GIF를 통째로 중복 저장한다
    // (10장이면 30MB+). zip을 열어 같은 내용의 GIF를 하나만 남기고 참조를 통일한 뒤 내려준다.
    // 후처리에 실패하면 중복 제거 없이(파일만 클 뿐 정상인) 원본을 그대로 내려준다.
    const blob: Blob = await (pres as any).write({ outputType: 'blob' });
    let finalBlob = blob;
    try {
      finalBlob = await dedupeGifMedia(blob);
    } catch (err) {
      console.warn('GIF 중복 제거 실패 → 원본 그대로 다운로드(파일이 클 수 있음):', err);
    }
    downloadBlob(finalBlob, fileName);
    return;
  }

  // 브라우저 환경에서는 pptxgenjs의 writeFile이 다운로드 처리를 맡는다.
  await pres.writeFile({ fileName });
}

// 생성된 pptx(zip) 안에서 내용이 똑같은 GIF를 하나만 남기고,
// 각 슬라이드의 참조(rels)를 남긴 파일로 바꿔치기한다.
// jszip은 pptxgenjs가 이미 쓰는 의존성이라 새로 설치할 게 없다.
async function dedupeGifMedia(blob: Blob): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(blob);
  const gifNames = Object.keys(zip.files)
    .filter((n) => /^ppt\/media\/.+\.gif$/.test(n))
    .sort();
  if (gifNames.length < 2) return blob;

  // 같은 내용 찾기 — 바이트 단위로 비교 (배경 GIF는 전부 같은 원본이라 한 그룹으로 묶인다)
  const keepers: { name: string; bytes: Uint8Array }[] = [];
  const rename = new Map<string, string>(); // 지울 파일명 → 남길 파일명
  for (const name of gifNames) {
    const bytes = await zip.files[name].async('uint8array');
    const same = keepers.find(
      (k) => k.bytes.length === bytes.length && k.bytes.every((b, i) => b === bytes[i])
    );
    if (same) {
      rename.set(name, same.name);
      zip.remove(name);
    } else {
      keepers.push({ name, bytes });
    }
  }
  if (rename.size === 0) return blob;

  // 슬라이드 rels에서 지운 GIF를 가리키던 참조를 남긴 GIF로 교체
  const relsNames = Object.keys(zip.files).filter((n) => /^ppt\/slides\/_rels\/.+\.rels$/.test(n));
  for (const relName of relsNames) {
    let xml = await zip.files[relName].async('string');
    let changed = false;
    for (const [oldName, keptName] of rename) {
      const oldRef = oldName.replace('ppt/', '../');   // 예: '../media/image3.gif'
      const keptRef = keptName.replace('ppt/', '../');
      if (xml.includes(oldRef)) {
        xml = xml.split(oldRef).join(keptRef);
        changed = true;
      }
    }
    if (changed) zip.file(relName, xml);
  }
  return zip.generateAsync({ type: 'blob' });
}

// 브라우저에서 Blob을 파일로 내려받게 한다 (pptxgenjs writeFile과 같은 동작).
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 다운로드가 시작될 시간을 준 뒤 메모리 해제
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
