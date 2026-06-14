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
  | 'sunrise' | 'milkyway' | 'godrays' | 'wheat' | 'sea' | 'flowers'
  | 'light' | 'dawn' | 'serene' | 'green' | 'gold' | 'pink' | 'violet'
  | 'wave' | 'mist' | 'candle' | 'grace' | 'aurora' | 'crosslight'
  // 2026-06 추가(Pexels 상업무료) — 절기·컨셉 확장
  | 'easter' | 'christmas' | 'lent' | 'harvest' | 'skyglow' | 'ocean'
  | 'ripple' | 'candlelive'
  | 'dawnsea' | 'tomb' | 'starnight' | 'nativity' | 'stormlight' | 'churchcross'
  | 'wheatcloud' | 'bluesky' | 'sunsetcloud' | 'goldsea' | 'seaofclouds' | 'mistymtn'
  | 'forestray' | 'wildflower' | 'sunrays' | 'clouds'
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
  // 무료 실사 6종 — Pexels 무료 스톡 (상업 무료·출처표기 불요)
  'sunrise': '일출 (산 위 운해)',
  'milkyway': '은하수 (밤하늘)',
  'godrays': '숲빛 (사이로 드는 해)',
  'wheat': '들녘 (황금 밀밭)',
  'sea': '바다 (새벽 수평선)',
  'flowers': '들꽃 (가을 역광)',
  // 2026-06 추가 — 절기·컨셉(Pexels 상업무료). 이름은 짧고 자연스럽게.
  'easter': '부활절',
  'christmas': '성탄절',
  'lent': '사순절',
  'harvest': '추수감사',
  'skyglow': '저녁노을',
  'ocean': '수평선',
  'ripple': '잔물결',
  'candlelive': '촛불빛',
  'dawnsea': '새벽바다',
  'tomb': '빈무덤',
  'starnight': '별밤',
  'nativity': '구유',
  'stormlight': '빛줄기',
  'churchcross': '예배당',
  'wheatcloud': '가을들녘',
  'bluesky': '하늘',
  'sunsetcloud': '노을구름',
  'goldsea': '금빛바다',
  'seaofclouds': '운해',
  'mistymtn': '안개산',
  'forestray': '숲빛',
  'wildflower': '들꽃',
  'sunrays': '햇살',
  'clouds': '구름결',
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
  // 무료 실사 6종(Pexels) — 밝은 사진은 흰 오버레이+검정 글자, 은하수만 어두워서 흰 글자
  'sunrise': { kind: 'image', path: '/pptx-bg-sunrise.jpg', text: '1F1B16' },
  'milkyway': { kind: 'image', path: '/pptx-bg-milkyway.jpg', text: 'FFFFFF', overlay: false, fallback: '060A14' },
  'godrays': { kind: 'image', path: '/pptx-bg-godrays.jpg', text: '1F1B16' },
  'wheat': { kind: 'image', path: '/pptx-bg-wheat.jpg', text: '1F1B16' },
  'sea': { kind: 'image', path: '/pptx-bg-sea.jpg', text: '1F1B16' },
  'flowers': { kind: 'image', path: '/pptx-bg-flowers.jpg', text: '1F1B16' },
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
  // 2026-06 추가 — 절기·컨셉(Pexels 상업무료). 밝은 사진=흰 오버레이+검정글자, 어두운 사진=흰글자.
  'easter': { kind: 'image', path: '/pptx-bg-easter.jpg', text: '1F1B16' },
  'harvest': { kind: 'image', path: '/pptx-bg-harvest.jpg', text: '1F1B16' },
  'skyglow': { kind: 'image', path: '/pptx-bg-skyglow.jpg', text: '1F1B16' },
  'ocean': { kind: 'image', path: '/pptx-bg-ocean.jpg', text: '1F1B16' },
  'christmas': { kind: 'image', path: '/pptx-bg-christmas.jpg', text: 'FFFFFF', overlay: false, fallback: '120E0A' },
  'lent': { kind: 'image', path: '/pptx-bg-lent.jpg', text: 'FFFFFF', overlay: false, fallback: '14161F' },
  // 움직이는 신규(영상→GIF)
  'ripple': { kind: 'image', path: '/pptx-bg-ripple.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '0A1420' },
  'candlelive': { kind: 'image', path: '/pptx-bg-candlelive.gif', text: 'FFFFFF', overlay: false, animated: true, fallback: '1A1206' },
  'dawnsea': { kind: 'image', path: '/pptx-bg-dawnsea.jpg', text: '1F1B16' },
  'tomb': { kind: 'image', path: '/pptx-bg-tomb.jpg', text: 'FFFFFF', overlay: false, fallback: '15120E' },
  'starnight': { kind: 'image', path: '/pptx-bg-starnight.jpg', text: 'FFFFFF', overlay: false, fallback: '05060B' },
  'nativity': { kind: 'image', path: '/pptx-bg-nativity.jpg', text: 'FFFFFF', overlay: false, fallback: '1A130A' },
  'stormlight': { kind: 'image', path: '/pptx-bg-stormlight.jpg', text: 'FFFFFF', overlay: false, fallback: '15161B' },
  'churchcross': { kind: 'image', path: '/pptx-bg-churchcross.jpg', text: '1F1B16' },
  'wheatcloud': { kind: 'image', path: '/pptx-bg-wheatcloud.jpg', text: '1F1B16' },
  'bluesky': { kind: 'image', path: '/pptx-bg-bluesky.jpg', text: '1F1B16' },
  'sunsetcloud': { kind: 'image', path: '/pptx-bg-sunsetcloud.jpg', text: '1F1B16' },
  'goldsea': { kind: 'image', path: '/pptx-bg-goldsea.jpg', text: '1F1B16' },
  'seaofclouds': { kind: 'image', path: '/pptx-bg-seaofclouds.jpg', text: '1F1B16' },
  'mistymtn': { kind: 'image', path: '/pptx-bg-mistymtn.jpg', text: '1F1B16' },
  'forestray': { kind: 'image', path: '/pptx-bg-forestray.jpg', text: '1F1B16' },
  'wildflower': { kind: 'image', path: '/pptx-bg-wildflower.jpg', text: '1F1B16' },
  'sunrays': { kind: 'image', path: '/pptx-bg-sunrays.jpg', text: '1F1B16' },
  'clouds': { kind: 'image', path: '/pptx-bg-clouds.gif', text: '1F1B16', overlay: false, animated: true, fallback: '7FA8C8' },
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

// 한 줄의 '화면 폭'을 칸 단위로 잰다 — 한글/한자/전각은 1칸, 영문·숫자·기호·공백은 0.55칸.
// (글자 개수가 아니라 폭으로 재야 영어 가사가 부당하게 작아지지 않는다.)
function visualWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    // 한글(자모·완성형)·CJK 한자·전각 기호 = 넓은 글자(1칸)
    const isWide = /[ᄀ-ᇿ　-鿿가-힯豈-﫿＀-￯]/.test(ch);
    width += isWide ? 1 : 0.55;
  }
  return width;
}

// 한 가사 슬라이드의 글씨 크기를 계산한다 (결과는 항상 MIN~MAX 사이).
function computeLyricFontSize(lines: string[]): number {
  // 실제 글자가 있는 줄만 센다 (공백 줄은 크기 계산에서 제외).
  const visible = lines.filter((line) => line.trim().length > 0);
  if (visible.length === 0) return MAX_FONT_SIZE;

  // 세로 기준 — 줄 수가 표에 없으면(8줄 이상) 최소 글씨로.
  const heightFont = HEIGHT_FONT_BY_LINES[visible.length] ?? MIN_FONT_SIZE;

  // 가로 기준 — 가장 긴 줄의 '실제 폭'으로 결정.
  // 글자 개수가 아니라 폭으로 세는 이유: 영문자·숫자·공백은 한글보다 훨씬 좁다.
  // 개수로 세면 영어 많은 찬양("Because of You")을 긴 줄로 착각해 글씨를 과하게 줄인다.
  // → 한글/한자/전각은 1칸, 그 외(영문·숫자·기호·공백)는 0.55칸으로 가중치를 준다.
  const longest = Math.max(...visible.map((line) => visualWidth(line)));
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

// ── 곡 단위 가사 글씨 크기 통일 ──────────────────────────────────────────
// 문제: 슬라이드마다 따로 크기를 계산하면(2줄=48pt, 4줄=32pt) 넘길 때 글씨가 튀어 통일감이 없다.
// 해법: "한 곡(# 제목 ~ 다음 # 제목)" 안의 가사 슬라이드들을 그 곡에서 '가장 빡빡한(가장 작은)'
//       크기로 전부 통일한다. → 곡 내내 글씨가 안 흔들리고, 제일 긴 가사도 안 넘친다.
//       단, computeLyricFontSize가 24pt(MIN_FONT_SIZE)에서 멈추므로 무한정 작아지진 않는다.
//       그래도 안 들어갈 만큼 긴 슬라이드는 addText의 fit:'shrink'가 그 한 장만 더 줄여 담고,
//       미리보기에서 빨간 경고로 "이 슬라이드를 둘로 나누세요"라고 알려준다(3단 방어).
// 반환: slides와 같은 길이의 배열 — 각 슬라이드가 쓸 글씨 크기(pt). title/memo는 고정 56.
export function computeUniformLyricSizes(slides: PptSlide[]): number[] {
  const sizes: number[] = new Array(slides.length).fill(MAX_FONT_SIZE);

  // 1) 곡 순번별로 가사 슬라이드 인덱스를 모은다 (title 슬라이드를 만날 때마다 곡이 바뀜).
  let songIndex = -1;
  const groups = new Map<number, number[]>(); // 곡 순번 → 그 곡 가사 슬라이드 인덱스들
  slides.forEach((slide, i) => {
    if (slide.kind === 'title') songIndex++;
    if (slide.kind === 'lyric') {
      const list = groups.get(songIndex) ?? [];
      list.push(i);
      groups.set(songIndex, list);
    }
  });

  // 2) 각 곡 그룹: 가사들의 '필요 크기' 중 가장 작은 값으로 통일.
  for (const indices of groups.values()) {
    let groupSize = MAX_FONT_SIZE;
    for (const i of indices) {
      const slide = slides[i];
      if (slide.kind !== 'lyric') continue;
      groupSize = Math.min(groupSize, computeLyricFontSize(slide.lines));
    }
    for (const i of indices) sizes[i] = groupSize;
  }

  // 3) title/memo는 자체 고정 크기(56).
  slides.forEach((slide, i) => {
    if (slide.kind === 'title' || slide.kind === 'memo') sizes[i] = 56;
  });

  return sizes;
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
  // 내 교회 PPT(custom 테마) 배경 — dataURL 또는 클라우드 https URL.
  customBgData?: string,
  // 커스텀 배경이 GIF(움직임)인지 — true면 홀리 배경처럼 전면 이미지+흰 글자로 출력.
  customBgIsGif?: boolean,
  // 곡별 배경(유료) — 곡 순번(0번부터)별 테마. 곡 경계는 title 슬라이드(# 제목)로 센다.
  // 비어 있거나 해당 곡이 undefined면 기본 theme를 쓴다 → 기존 동작과 100% 호환.
  songThemes?: (PptTheme | undefined)[]
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

  // ── 테마별 렌더 정보 ──────────────────────────────────────────────────
  // 곡별 배경 기능: 슬라이드마다 다른 테마를 쓸 수 있으므로, 테마 1개를 고정으로
  // 쓰던 기존 방식 대신 "쓰인 테마마다 배경을 1번씩 로드해 캐시"한다.
  // (같은 테마를 여러 곡이 써도 이미지는 한 번만 받아온다 → 네트워크·메모리 절약)
  type ThemeRender = {
    config: ThemeConfig;
    bgData?: string;       // 배경 이미지 데이터(없으면 단색 폴백)
    useOverlay: boolean;   // 흰 반투명 가독성 레이어 여부
    animatedBg: boolean;   // 움직이는 GIF 배경인지
    textColor: string;     // 글자색
    isLightText: boolean;  // 흰 글자 테마인지(이미지 로드 실패 시 폴백 배경색 결정)
  };
  const themeCache = new Map<PptTheme, ThemeRender>();

  // 한 테마의 배경을 로드해 렌더 정보로 만든다(이미 만든 건 캐시에서 바로 반환).
  const resolveTheme = async (t: PptTheme): Promise<ThemeRender> => {
    const cached = themeCache.get(t);
    if (cached) return cached;
    const cfg = THEME_CONFIG[t];
    // 흰 반투명 오버레이 — 실사 사진은 기본 ON, 그라데이션(overlay:false)은 OFF.
    const overlay = cfg.kind === 'image' ? cfg.overlay !== false : false;
    // 흰 글자 테마인지 — 이미지 로드 실패 시 폴백 배경색을 정하는 데 쓴다.
    const lightText = cfg.kind === 'image' && cfg.text.toUpperCase() === 'FFFFFF';
    // 움직이는 배경 — 홀리 GIF 테마이거나, 사용자가 올린 커스텀 GIF(custom 테마에서만).
    const animated = cfg.kind === 'image' && (cfg.animated === true || (t === 'custom' && customBgIsGif === true));
    // 커스텀 GIF는 어두운 배경 가정 → 흰 글자(홀리 테마와 동일 규칙).
    const txt = t === 'custom' && customBgIsGif ? 'FFFFFF' : cfg.text;
    let data: string | undefined;
    if (cfg.kind === 'image') {
      try {
        if (t === 'custom') {
          // dataURL이면 'data:' 접두사만 떼고, 클라우드 https URL이면 받아와서 base64로.
          data = customBgData
            ? customBgData.startsWith('data:')
              ? customBgData.replace(/^data:/, '')
              : await loadPublicImageAsBase64(customBgData)
            : undefined;
        } else {
          data = await loadPublicImageAsBase64(cfg.path);
        }
      } catch (err) {
        console.warn(`이미지 배경 로드 실패 → 단색으로 대체 (${t}):`, err);
      }
    }
    const entry: ThemeRender = {
      config: cfg, bgData: data, useOverlay: overlay,
      animatedBg: animated, textColor: txt, isLightText: lightText,
    };
    themeCache.set(t, entry);
    return entry;
  };

  // 기본 테마 + 곡별로 쓰인 테마를 미리 모두 로드해 캐시에 채운다.
  // (아래 슬라이드 루프는 동기로 그려야 하므로 배경 로드는 여기서 끝낸다.)
  const baseRender = await resolveTheme(theme);
  if (songThemes) {
    for (const st of songThemes) {
      if (st) await resolveTheme(st);
    }
  }

  // 한 슬라이드에 주어진 테마의 배경을 적용한다.
  const applyThemeBackground = (slide: ReturnType<typeof pres.addSlide>, tr: ThemeRender) => {
    const cfg = tr.config;
    if (cfg.kind === 'solid') {
      slide.background = { color: cfg.bg };
    } else if (tr.bgData && tr.animatedBg) {
      // 움직이는 GIF 배경 — '배경 채우기'에 넣으면 PowerPoint가 첫 프레임 정지화면만
      // 보여주므로, 슬라이드 맨 처음(=맨 뒤 레이어)에 전면 이미지로 깐다.
      // 뒤에 단색을 깔아 GIF 로드가 늦거나 실패해도 글자가 읽히게 한다.
      // 재생은 슬라이드쇼(발표) 모드에서만 된다 — 편집 화면에선 정지로 보이는 게 정상.
      slide.background = { color: ('fallback' in cfg ? cfg.fallback : undefined) ?? '000000' };
      slide.addImage({ data: tr.bgData, x: 0, y: 0, w: 13.333, h: 7.5 });
    } else if (tr.bgData) {
      slide.background = { data: tr.bgData };
      // 실사 이미지는 글자 가독성을 위해 흰 반투명 레이어를 깐다.
      // 그라데이션 배경은 자체 대비가 충분해 레이어를 생략(useOverlay=false)한다.
      if (tr.useOverlay) {
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
      slide.background = { color: tr.isLightText ? '111111' : 'FFFFFF' };
    }
  };

  // 슬라이드 박스 공통 위치 — 모든 종류에서 동일
  const boxFrame = { x: 0.5, y: 0.5, w: 12.333, h: 6.5 } as const;

  // 가사 글씨 크기 — 곡 단위로 통일한 값을 미리 계산(슬라이드 인덱스로 조회).
  const uniformSizes = computeUniformLyricSizes(slides);

  // 곡 순번 — title 슬라이드(# 제목)를 만날 때마다 1 증가. 첫 title 전 슬라이드는 -1(기본 테마).
  let songIndex = -1;
  // 한 슬라이드라도 움직이는 배경을 썼는지 — 마지막 GIF 후처리(dedupe) 트리거에 사용.
  let anyAnimated = false;
  // 슬라이드 인덱스 — uniformSizes 조회용.
  let slideIdx = -1;

  for (const pptSlide of slides) {
    slideIdx++;
    if (pptSlide.kind === 'title') songIndex++;
    // 이 슬라이드가 속한 곡의 테마(곡별 지정이 없으면 기본 theme).
    const slideTheme = (songIndex >= 0 && songThemes?.[songIndex]) || theme;
    const tr = themeCache.get(slideTheme) ?? baseRender;
    if (tr.animatedBg && tr.bgData) anyAnimated = true;
    // 글자색은 슬라이드가 속한 테마에 따라 달라진다(기존 전역 textColor 대체).
    const textColor = tr.textColor;

    const slide = pres.addSlide();
    applyThemeBackground(slide, tr);

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
        color: textColor,
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
        color: textColor,
        fontFace: FONT_FACE_MAP[font],
        fontSize: 36,
        paraSpaceAfter: 8,
        bold: false,
        fit: 'shrink',
      });
      continue;
    }

    // 가사 슬라이드 (kind === 'lyric')
    // 곡 단위로 통일된 글씨 크기를 쓴다 (항상 24~56pt 사이). 같은 곡 가사는 전부 같은 크기.
    const fontSize = uniformSizes[slideIdx];
    slide.addText(pptSlide.lines.join('\n'), {
      ...boxFrame,
      align: 'center',
      valign: verticalAlign,
      color: textColor,
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

  if (anyAnimated) {
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
