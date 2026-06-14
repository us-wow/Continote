// 배경 단일 진실원(SSOT).
//
// ⭐ 한 배경의 "모든 속성"(이름·무료/유료·분류·실제 색/그림·미리보기 색·오버레이·움직임)을
//    여기 BACKGROUNDS 배열 한 줄에 담는다. 나머지 맵들은 전부 여기서 파생된다:
//      - lib/pptx.ts        → PPT_THEME_LABELS, THEME_CONFIG (실제 PPT 출력)
//      - lib/slide-visual.ts→ THEME_BG / THEME_FG / THEME_OVERLAY (미리보기 카드)
//      - 이 파일           → BG_CATALOG (배경 패널 검색·필터·배지)
//    → 새 배경 추가 = BACKGROUNDS에 한 줄 추가가 전부다(예전엔 5곳을 고쳐야 했음).
//
// 색 표기 규칙:
//   - solid.bg / solid.text / image.text / image.fallback = '#' 없는 6자리 HEX (pptxgenjs 형식)
//   - image.previewColor = '#' 붙인 CSS 색 (미리보기 카드 배경 폴백)
//   - image.overlay = 흰 반투명 스크림 CSS rgba (있으면 가독성 레이어 ON). 실제 PPT는 흰 65% 고정.

export type BgTier = 'free' | 'paid';

// 한 배경의 정의.
// - solid: 단색 배경(검정/흰색/종이).
// - image: 실사 사진(jpg) 또는 움직이는 배경(gif). animated=true면 움직임.
export type BgDef = {
  key: string;
  label: string;          // PPT_THEME_LABELS
  tier: BgTier;
  categories: string[];   // 검색·필터 태그
  animated?: boolean;     // 움직이는(GIF) 배경 → "움직임" 배지
  hidden?: boolean;       // 배경 패널에 노출 안 함(custom = 내 교회 PPT)
  solid?: { bg: string; text: string };
  image?: {
    path: string;          // public/ 경로 ('' = 런타임에 사용자 이미지로 채움 — custom)
    text: string;          // 글자색
    previewColor: string;  // 미리보기 카드 배경 폴백색
    overlay?: string;      // 흰 스크림 rgba (있으면 가독성 레이어 ON)
    fallback?: string;     // pptx 이미지 로드 실패 시 깔리는 단색
  };
};

// ── 모든 배경 (순서 = 배경 선택 드롭다운·라벨 순서) ──────────────────────────
// 무료 = 단색 3 + 실사 3(십자가·성경책·초원). 나머지(실사·움직이는)는 전부 유료.
export const BACKGROUNDS = [
  // ── 단색 (무료) ──
  { key: 'black', label: '검정 (어두운 예배실)', tier: 'free', categories: ['단색'],
    solid: { bg: '000000', text: 'FFFFFF' } },
  { key: 'white', label: '흰색 (밝은 예배실)', tier: 'free', categories: ['단색'],
    solid: { bg: 'FFFFFF', text: '1F1B16' } },
  { key: 'paper', label: '종이 톤 (따뜻한 분위기)', tier: 'free', categories: ['단색'],
    solid: { bg: 'FAF5EC', text: '1F1B16' } },

  // ── 움직이는 홀리 배경 (유료) — scripts/gen-holy-bg.mjs 생성, 발표 모드에서 재생 ──
  { key: 'light', label: '빛내림 (광선 다발)', tier: 'paid', categories: ['빛'], animated: true,
    image: { path: '/pptx-bg-light.gif', text: 'FFFFFF', previewColor: '#04060D', fallback: '04060D' } },
  { key: 'dawn', label: '새벽 (따뜻한 빛망울)', tier: 'paid', categories: ['빛', '묵상'], animated: true,
    image: { path: '/pptx-bg-dawn.gif', text: 'FFFFFF', previewColor: '#1F0F20', fallback: '1F0F20' } },
  { key: 'serene', label: '푸른빛 (고요한 밤)', tier: 'paid', categories: ['묵상'], animated: true,
    image: { path: '/pptx-bg-serene.gif', text: 'FFFFFF', previewColor: '#0A142B', fallback: '0A142B' } },
  { key: 'green', label: '초록빛 (깊은 숲)', tier: 'paid', categories: ['자연'], animated: true,
    image: { path: '/pptx-bg-green.gif', text: 'FFFFFF', previewColor: '#0A1F14', fallback: '0A1F14' } },
  { key: 'gold', label: '금빛 (감사와 영광)', tier: 'paid', categories: ['빛'], animated: true,
    image: { path: '/pptx-bg-gold.gif', text: 'FFFFFF', previewColor: '#241804', fallback: '241804' } },
  { key: 'pink', label: '분홍빛 (따뜻한 사랑)', tier: 'paid', categories: ['빛'], animated: true,
    image: { path: '/pptx-bg-pink.gif', text: 'FFFFFF', previewColor: '#260D1B', fallback: '260D1B' } },
  { key: 'violet', label: '보랏빛 (경건한 묵상)', tier: 'paid', categories: ['묵상'], animated: true,
    image: { path: '/pptx-bg-violet.gif', text: 'FFFFFF', previewColor: '#150E2E', fallback: '150E2E' } },
  { key: 'wave', label: '물결 (달빛 수면)', tier: 'paid', categories: ['자연', '묵상'], animated: true,
    image: { path: '/pptx-bg-wave.gif', text: 'FFFFFF', previewColor: '#060D1C', fallback: '060D1C' } },
  { key: 'mist', label: '안개 (새벽 묵상)', tier: 'paid', categories: ['묵상'], animated: true,
    image: { path: '/pptx-bg-mist.gif', text: 'FFFFFF', previewColor: '#141B28', fallback: '141B28' } },
  { key: 'candle', label: '촛불 (따뜻한 기도)', tier: 'paid', categories: ['묵상', '절기:성탄'], animated: true,
    image: { path: '/pptx-bg-candle.gif', text: 'FFFFFF', previewColor: '#170E06', fallback: '170E06' } },
  { key: 'grace', label: '빛가루 (내리는 은혜)', tier: 'paid', categories: ['빛'], animated: true,
    image: { path: '/pptx-bg-grace.gif', text: 'FFFFFF', previewColor: '#0E0A1E', fallback: '0E0A1E' } },
  { key: 'aurora', label: '오로라 (밤하늘 물결)', tier: 'paid', categories: ['묵상'], animated: true,
    image: { path: '/pptx-bg-aurora.gif', text: 'FFFFFF', previewColor: '#050A18', fallback: '050A18' } },
  { key: 'crosslight', label: '십자가빛 (역광)', tier: 'paid', categories: ['십자가', '빛'], animated: true,
    image: { path: '/pptx-bg-crosslight.gif', text: 'FFFFFF', previewColor: '#0C0908', fallback: '0C0908' } },

  // ── 실사 (무료 3 + 유료) ──
  { key: 'meadow', label: '초원 (실사 이미지)', tier: 'free', categories: ['자연'],
    image: { path: '/pptx-bg-meadow.jpg', text: '1F1B16', previewColor: '#B8D27A', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'cross', label: '십자가 (실사 이미지)', tier: 'free', categories: ['십자가', '예배'],
    image: { path: '/pptx-bg-cross.jpg', text: '1F1B16', previewColor: '#1a140e', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'bible', label: '성경책 (실사 이미지)', tier: 'free', categories: ['예배'],
    image: { path: '/pptx-bg-bible.jpg', text: '1F1B16', previewColor: '#c19b6e', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'sunrise', label: '일출 (산 위 운해)', tier: 'paid', categories: ['자연', '빛'],
    image: { path: '/pptx-bg-sunrise.jpg', text: '1F1B16', previewColor: '#E8C8A0', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'milkyway', label: '은하수 (밤하늘)', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-milkyway.jpg', text: 'FFFFFF', previewColor: '#060A14', fallback: '060A14' } },
  { key: 'godrays', label: '숲빛 (사이로 드는 해)', tier: 'paid', categories: ['자연', '빛'],
    image: { path: '/pptx-bg-godrays.jpg', text: '1F1B16', previewColor: '#2A2418', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'wheat', label: '들녘 (황금 밀밭)', tier: 'paid', categories: ['자연', '절기:추수감사'],
    image: { path: '/pptx-bg-wheat.jpg', text: '1F1B16', previewColor: '#C89A50', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'sea', label: '바다 (새벽 수평선)', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-sea.jpg', text: '1F1B16', previewColor: '#A8C4D8', overlay: 'rgba(255,255,255,0.65)' } },
  { key: 'flowers', label: '들꽃 (가을 역광)', tier: 'paid', categories: ['자연'],
    image: { path: '/pptx-bg-flowers.jpg', text: '1F1B16', previewColor: '#B89060', overlay: 'rgba(255,255,255,0.65)' } },

  // ── 2026-06 추가 · 절기/컨셉 (Pexels 상업무료, 전부 유료) ──
  { key: 'easter', label: '부활절', tier: 'paid', categories: ['절기', '절기:부활', '자연', '빛'],
    image: { path: '/pptx-bg-easter.jpg', text: '1F1B16', previewColor: '#C9C2B8', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'harvest', label: '추수감사', tier: 'paid', categories: ['절기', '절기:추수감사', '자연'],
    image: { path: '/pptx-bg-harvest.jpg', text: '1F1B16', previewColor: '#C89A50', overlay: 'rgba(255,255,255,0.6)' } },
  { key: 'skyglow', label: '저녁노을', tier: 'paid', categories: ['자연', '빛'],
    image: { path: '/pptx-bg-skyglow.jpg', text: '1F1B16', previewColor: '#C99B8A', overlay: 'rgba(255,255,255,0.5)' } },
  { key: 'ocean', label: '수평선', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-ocean.jpg', text: '1F1B16', previewColor: '#A8C4D8', overlay: 'rgba(255,255,255,0.6)' } },
  { key: 'christmas', label: '성탄절', tier: 'paid', categories: ['절기', '절기:성탄', '묵상'],
    image: { path: '/pptx-bg-christmas.jpg', text: '1F1B16', previewColor: '#120E0A', overlay: 'rgba(255,255,255,0.6)', fallback: '120E0A' } },
  { key: 'lent', label: '사순절', tier: 'paid', categories: ['절기', '절기:사순', '십자가'],
    image: { path: '/pptx-bg-lent.jpg', text: '1F1B16', previewColor: '#14161F', overlay: 'rgba(255,255,255,0.55)', fallback: '14161F' } },
  { key: 'ripple', label: '잔물결', tier: 'paid', categories: ['자연', '묵상'], animated: true,
    image: { path: '/pptx-bg-ripple.gif', text: 'FFFFFF', previewColor: '#0A1420', fallback: '0A1420' } },
  { key: 'candlelive', label: '촛불빛', tier: 'paid', categories: ['묵상', '절기', '절기:성탄'], animated: true,
    image: { path: '/pptx-bg-candlelive.gif', text: 'FFFFFF', previewColor: '#1A1206', fallback: '1A1206' } },
  { key: 'dawnsea', label: '새벽바다', tier: 'paid', categories: ['절기', '절기:부활', '자연', '묵상'],
    image: { path: '/pptx-bg-dawnsea.jpg', text: '1F1B16', previewColor: '#A9BBC6', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'tomb', label: '빈무덤', tier: 'paid', categories: ['절기', '절기:부활', '십자가'],
    image: { path: '/pptx-bg-tomb.jpg', text: '1F1B16', previewColor: '#15120E', overlay: 'rgba(255,255,255,0.62)', fallback: '15120E' } },
  { key: 'starnight', label: '별밤', tier: 'paid', categories: ['절기', '절기:성탄', '묵상'],
    image: { path: '/pptx-bg-starnight.jpg', text: '1F1B16', previewColor: '#05060B', overlay: 'rgba(255,255,255,0.62)', fallback: '05060B' } },
  { key: 'nativity', label: '구유', tier: 'paid', categories: ['절기', '절기:성탄'],
    image: { path: '/pptx-bg-nativity.jpg', text: '1F1B16', previewColor: '#1A130A', overlay: 'rgba(255,255,255,0.62)', fallback: '1A130A' } },
  { key: 'stormlight', label: '빛줄기', tier: 'paid', categories: ['절기', '절기:사순', '빛'],
    image: { path: '/pptx-bg-stormlight.jpg', text: '1F1B16', previewColor: '#15161B', overlay: 'rgba(255,255,255,0.55)', fallback: '15161B' } },
  { key: 'churchcross', label: '예배당', tier: 'paid', categories: ['절기', '절기:사순', '십자가'],
    image: { path: '/pptx-bg-churchcross.jpg', text: '1F1B16', previewColor: '#AEB4BD', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'wheatcloud', label: '가을들녘', tier: 'paid', categories: ['절기', '절기:추수감사', '자연'],
    image: { path: '/pptx-bg-wheatcloud.jpg', text: '1F1B16', previewColor: '#C0A35A', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'bluesky', label: '하늘', tier: 'paid', categories: ['자연'],
    image: { path: '/pptx-bg-bluesky.jpg', text: '1F1B16', previewColor: '#8FB4D6', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'sunsetcloud', label: '노을구름', tier: 'paid', categories: ['자연', '빛'],
    image: { path: '/pptx-bg-sunsetcloud.jpg', text: '1F1B16', previewColor: '#C99B7A', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'goldsea', label: '금빛바다', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-goldsea.jpg', text: '1F1B16', previewColor: '#C79A5A', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'seaofclouds', label: '운해', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-seaofclouds.jpg', text: '1F1B16', previewColor: '#9AA6B4', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'mistymtn', label: '안개산', tier: 'paid', categories: ['자연', '묵상'],
    image: { path: '/pptx-bg-mistymtn.jpg', text: '1F1B16', previewColor: '#9DB0A0', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'forestray', label: '숲빛', tier: 'paid', categories: ['자연', '빛'],
    image: { path: '/pptx-bg-forestray.jpg', text: '1F1B16', previewColor: '#8FA08C', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'wildflower', label: '들꽃', tier: 'paid', categories: ['자연'],
    image: { path: '/pptx-bg-wildflower.jpg', text: '1F1B16', previewColor: '#C0A06E', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'sunrays', label: '햇살', tier: 'paid', categories: ['빛'],
    image: { path: '/pptx-bg-sunrays.jpg', text: '1F1B16', previewColor: '#B9A98E', overlay: 'rgba(255,255,255,0.55)' } },
  { key: 'clouds', label: '구름결', tier: 'paid', categories: ['자연', '빛'], animated: true,
    image: { path: '/pptx-bg-clouds.gif', text: '1F1B16', previewColor: '#7FA8C8', fallback: '7FA8C8' } },

  // ── 내 교회 PPT (직접 등록) — 패널 비노출, 이미지는 런타임에 채움 ──
  { key: 'custom', label: '내 교회 PPT (직접 등록)', tier: 'paid', categories: [], hidden: true,
    image: { path: '', text: '1F1B16', previewColor: '#FFFFFF', overlay: 'rgba(255,255,255,0.65)' } },
] as const satisfies readonly BgDef[];

// 배경 키 = 테마 식별자. 카탈로그에서 파생된다(union 타입 유지 → 오타·누락 컴파일 단계 검출).
export type PptTheme = (typeof BACKGROUNDS)[number]['key'];

// 순회용 뷰 — `as const`는 원소를 정확한 리터럴로 좁혀 옵셔널 필드(solid/image) 접근을 막으므로,
// 맵을 파생할 땐 BgDef[]로 보는 이 별칭으로 순회한다(키 union은 BACKGROUNDS가 그대로 보존).
export const BG_DEFS: readonly BgDef[] = BACKGROUNDS;

// ── 배경 패널용 메타 (검색·필터·배지) ─────────────────────────────────────
export type BgMeta = {
  key: PptTheme;
  categories: string[];
  tier: BgTier;
  animated: boolean;
};

// hidden(custom)을 뺀 노출 배경만 패널에 보낸다.
export const BG_CATALOG: BgMeta[] = BG_DEFS.filter((d) => !d.hidden).map((d) => ({
  key: d.key as PptTheme,
  categories: [...d.categories],
  tier: d.tier,
  animated: d.animated === true,
}));

// 필터 칩으로 보여줄 주요 분류(순서 고정). 절기 세부 태그는 검색으로 찾게 둔다.
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
