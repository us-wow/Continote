'use client';

// 4번 영역 — PPT 만들기 (별도 단계)
//
// "슬라이드가 필요한 사람만" 들어오는 영역.
// 03 콘티 편집의 다운로드 4종(클립보드/TXT/DOCX/PDF)과는 별도 출구.
//
// 컨트롤:
//   - 테마 6종 (검정/흰색/종이/초원/십자가/성경책)
//   - 폰트 4종 (본명조 추천)
//   - 저작권 슬라이드 토글 (CCLI 자동 표시)
//   - 미리보기 / PPT 다운로드
//   - "다른 형식으로 내보내기" → 공유 링크 / OpenSong / Plain Slides 등 보조 출구

import { PPT_FONT_LABELS, PPT_THEME_LABELS, PPT_VALIGN_LABELS, type PptFont, type PptTheme, type PptVAlign } from '@/lib/pptx';
import { fileToDataUrl, CUSTOM_BG_MAX_BYTES, type CustomBg } from '@/lib/custom-bg';
import { videoFileToGif } from '@/lib/video-to-gif';
import type { SavedBg } from '@/lib/custom-bg-cloud';
import { useEffect, useRef, useState } from 'react';

type PptSectionProps = {
  slideCount: number;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  // 세로 정렬 — 상단/가운데/하단. 선택 즉시 미리보기와 PPT 출력에 함께 반영된다.
  pptVAlign: PptVAlign;
  setPptVAlign: (v: PptVAlign) => void;
  // 글꼴 포함(임베드) 토글 — 켜면 본명조를 PPT에 심는다.
  embedFont: boolean;
  setEmbedFont: (v: boolean) => void;
  // 로그인 여부 — "자주 쓰는 배경" 줄은 로그인한 사용자에게만 보인다
  isLoggedIn: boolean;
  // 유료 기능(움직이는 배경 + 교회 PPT 등록) 잠금 — 운영자 계정만 해제.
  // 잠긴 사용자에겐 보이되 어둡게 표시되고, 누르면 유료 안내만 나온다.
  premiumUnlocked: boolean;
  onLockedPremium: () => void;                   // 잠긴 상태에서 클릭 시 (유료 안내 토스트)
  // 내 교회 PPT(커스텀 배경) — 이미지/GIF/짧은 영상(브라우저에서 GIF로 변환)
  customBg: CustomBg | null;                     // 지금 적용 중인 배경 (없으면 null)
  onCustomBgChange: (bg: CustomBg, note?: string) => void; // 업로드/변환 성공 (부모가 적용+저장 흐름)
  onCustomNotice: (msg: string) => void;         // 안내/오류 토스트 (용량 초과, 형식 불가 등)
  // 클라우드에 저장된 "내 배경" 목록 (유료 기능 — 지금은 운영자만 채워짐)
  savedBgs: SavedBg[];
  onSelectSaved: (bg: SavedBg) => void;
  onDeleteSaved: (bg: SavedBg) => void;
  onOpenPreview: () => void;
  onDownloadPptx: () => void;
  // "다른 형식으로 내보내기" — 토글 펼치면 보임
  onCopyShareLink: () => void;
  onDownloadOpenSong: () => void;
  onDownloadPlainSlides: () => void;
  busy?: boolean;
};

// swatch 배경 — 실제 PPT에 들어가는 색/이미지를 그대로 보여준다 (mock 그라데이션 X).
// 이미지 테마는 lib/pptx.ts와 동일하게 public/pptx-bg-*.jpg 사용.
// custom은 THEME_ORDER에 없고(별도 타일) 사용자가 올린 이미지로 런타임에 그린다 — 여기 값은 placeholder.
const THEME_SWATCH_BG: Record<PptTheme, string> = {
  custom: '#FFFFFF',
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  // 움직이는 홀리 7종 — GIF를 스와치 배경으로 그대로 보여준다(브라우저에선 스와치도 움직임).
  light: "url('/pptx-bg-light.gif') center/cover",
  dawn: "url('/pptx-bg-dawn.gif') center/cover",
  serene: "url('/pptx-bg-serene.gif') center/cover",
  green: "url('/pptx-bg-green.gif') center/cover",
  gold: "url('/pptx-bg-gold.gif') center/cover",
  pink: "url('/pptx-bg-pink.gif') center/cover",
  violet: "url('/pptx-bg-violet.gif') center/cover",
  wave: "url('/pptx-bg-wave.gif') center/cover",
  mist: "url('/pptx-bg-mist.gif') center/cover",
  candle: "url('/pptx-bg-candle.gif') center/cover",
  grace: "url('/pptx-bg-grace.gif') center/cover",
  aurora: "url('/pptx-bg-aurora.gif') center/cover",
  crosslight: "url('/pptx-bg-crosslight.gif') center/cover",
  meadow: "url('/pptx-bg-meadow.jpg') center/cover",
  cross: "url('/pptx-bg-cross.jpg') center/cover",
  bible: "url('/pptx-bg-bible.jpg') center/cover",
  sunrise: "url('/pptx-bg-sunrise.jpg') center/cover",
  milkyway: "url('/pptx-bg-milkyway.jpg') center/cover",
  godrays: "url('/pptx-bg-godrays.jpg') center/cover",
  wheat: "url('/pptx-bg-wheat.jpg') center/cover",
  sea: "url('/pptx-bg-sea.jpg') center/cover",
  flowers: "url('/pptx-bg-flowers.jpg') center/cover",
  easter: "url('/pptx-bg-easter.jpg') center/cover",
  christmas: "url('/pptx-bg-christmas.jpg') center/cover",
  lent: "url('/pptx-bg-lent.jpg') center/cover",
  harvest: "url('/pptx-bg-harvest.jpg') center/cover",
  skyglow: "url('/pptx-bg-skyglow.jpg') center/cover",
  ocean: "url('/pptx-bg-ocean.jpg') center/cover",
  ripple: "url('/pptx-bg-ripple.gif') center/cover",
  candlelive: "url('/pptx-bg-candlelive.gif') center/cover",
  dawnsea: "url('/pptx-bg-dawnsea.jpg') center/cover",
  tomb: "url('/pptx-bg-tomb.jpg') center/cover",
  starnight: "url('/pptx-bg-starnight.jpg') center/cover",
  nativity: "url('/pptx-bg-nativity.jpg') center/cover",
  stormlight: "url('/pptx-bg-stormlight.jpg') center/cover",
  churchcross: "url('/pptx-bg-churchcross.jpg') center/cover",
  wheatcloud: "url('/pptx-bg-wheatcloud.jpg') center/cover",
  bluesky: "url('/pptx-bg-bluesky.jpg') center/cover",
  sunsetcloud: "url('/pptx-bg-sunsetcloud.jpg') center/cover",
  goldsea: "url('/pptx-bg-goldsea.jpg') center/cover",
  seaofclouds: "url('/pptx-bg-seaofclouds.jpg') center/cover",
  mistymtn: "url('/pptx-bg-mistymtn.jpg') center/cover",
  forestray: "url('/pptx-bg-forestray.jpg') center/cover",
  wildflower: "url('/pptx-bg-wildflower.jpg') center/cover",
  sunrays: "url('/pptx-bg-sunrays.jpg') center/cover",
  clouds: "url('/pptx-bg-clouds.gif') center/cover",
};
// 글자색 — lib/pptx.ts의 text 컬러와 동일. 이미지 테마는 흰 반투명 오버레이 위에 검정 잉크.
const THEME_SWATCH_FG: Record<PptTheme, string> = {
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
  cross: '#1F1B16',
  bible: '#1F1B16',
  sunrise: '#1F1B16',
  milkyway: '#FFFFFF',
  godrays: '#1F1B16',
  wheat: '#1F1B16',
  sea: '#1F1B16',
  flowers: '#1F1B16',
  easter: '#1F1B16',
  harvest: '#1F1B16',
  skyglow: '#1F1B16',
  ocean: '#1F1B16',
  christmas: '#FFFFFF',
  lent: '#FFFFFF',
  ripple: '#FFFFFF',
  candlelive: '#FFFFFF',
  dawnsea: '#1F1B16',
  tomb: '#FFFFFF',
  starnight: '#FFFFFF',
  nativity: '#FFFFFF',
  stormlight: '#FFFFFF',
  churchcross: '#1F1B16',
  wheatcloud: '#1F1B16',
  bluesky: '#1F1B16',
  sunsetcloud: '#1F1B16',
  goldsea: '#1F1B16',
  seaofclouds: '#1F1B16',
  mistymtn: '#1F1B16',
  forestray: '#1F1B16',
  wildflower: '#1F1B16',
  sunrays: '#1F1B16',
  clouds: '#1F1B16',
};
// 흰 반투명 오버레이를 까는 실사 테마 — lib/pptx.ts와 동일 규칙 (은하수는 어두워서 제외)
const OVERLAY_THEMES: PptTheme[] = ['meadow', 'cross', 'bible', 'sunrise', 'godrays', 'wheat', 'sea', 'flowers', 'easter', 'harvest', 'skyglow', 'ocean', 'dawnsea', 'churchcross', 'wheatcloud', 'bluesky', 'sunsetcloud', 'goldsea', 'seaofclouds', 'mistymtn', 'forestray', 'wildflower', 'sunrays'];
const isImageTheme = (theme: PptTheme): boolean => OVERLAY_THEMES.includes(theme);

// 테마 26개를 묶음별로 접었다 펼 수 있게 그룹핑.
// 기본 세팅은 "전부 펼침" — 접는 건 사용자의 선택이고, 접힘 상태는 localStorage에 기억된다.
const THEME_GROUPS: { id: string; label: string; premium: boolean; themes: PptTheme[] }[] = [
  {
    id: 'free', label: '기본 배경(무료)', premium: false,
    themes: ['black', 'white', 'paper', 'cross', 'bible', 'meadow'],
  },
  {
    id: 'paidstatic', label: '유료 배경', premium: true,
    themes: ['easter', 'christmas', 'lent', 'harvest', 'sunrise', 'skyglow', 'ocean', 'godrays', 'wheat', 'sea', 'flowers', 'milkyway',
      'dawnsea', 'tomb', 'starnight', 'nativity', 'stormlight', 'churchcross', 'wheatcloud', 'bluesky', 'sunsetcloud', 'goldsea', 'seaofclouds', 'mistymtn', 'forestray', 'wildflower', 'sunrays'],
  },
  {
    id: 'motion', label: '움직이는 배경(유료)', premium: true,
    themes: ['ripple', 'candlelive', 'clouds', 'light', 'dawn', 'serene', 'green', 'gold', 'pink', 'violet', 'wave', 'mist', 'candle', 'grace', 'aurora', 'crosslight'],
  },
];
// 기본 접힘 상태 — 전부 펼침 (사용자 요청: "기본 세팅이 다 보이는 게 세팅")
const GROUP_DEFAULT_OPEN: Record<string, boolean> = { freq: true, free: true, motion: true, mine: true };

// 자주 쓰는 배경 — PPT 다운로드할 때마다 그 테마를 세서 localStorage에 기억.
// 로그인한 사용자에게만 맨 위 줄로 보여준다 (로그인할 이유 하나 추가).
const USAGE_KEY = 'cn-theme-usage';
function readUsage(): Record<string, number> {
  try {
    return JSON.parse(window.localStorage.getItem(USAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}
// 유료 예정 기능(움직이는 배경 전부) — 오른쪽 위에 왕관 표시 (지금은 운영자만 사용 가능)
const PREMIUM_THEMES: PptTheme[] = THEME_GROUPS.filter((g) => g.premium).flatMap((g) => g.themes);

// 그룹 제목용 인라인 왕관 — 배지(절대 배치)와 달리 글자 옆에 흐름대로 놓인다
function CrownInline() {
  return (
    <svg className="theme-group-crowninline" width="13" height="11" viewBox="0 0 24 21" fill="none" aria-label="유료 예정">
      <path d="M3 18 L3 6 L8.5 10.5 L12 3 L15.5 10.5 L21 6 L21 18 Z" stroke="#F2C14E" strokeWidth="2.4" strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

// 왕관 배지 — 노란 선으로 그린 투명 왕관 (이모지 X, 사용자 지정 스타일)
// 측면이 수직이고 모서리가 뾰족한 "각진" 왕관 — 둥글면 산맥처럼 보인다는 피드백 반영.
function CrownBadge() {
  return (
    <span className="theme-sw-crown" title="유료 예정 기능" aria-label="유료 예정">
      <svg width="17" height="15" viewBox="0 0 24 21" fill="none" aria-hidden="true">
        <path
          d="M3 18 L3 6 L8.5 10.5 L12 3 L15.5 10.5 L21 6 L21 18 Z"
          stroke="#F2C14E"
          strokeWidth="2.2"
          strokeLinejoin="miter"
          fill="none"
        />
      </svg>
    </span>
  );
}
// 나눔고딕이 맨 앞 — 기본값이자 추천(첫 외부 사용자 피드백: 가장 보기 좋다고 함 · 임베드 지원).
const FONT_ORDER: PptFont[] = ['nanum-gothic', 'noto-serif-kr', 'nanum-myeongjo', 'nanum-square', 'noto-sans-kr'];
// 세로 정렬 버튼 순서 — 화면 위→아래 순으로 자연스럽게 배치.
const VALIGN_ORDER: PptVAlign[] = ['top', 'middle', 'bottom'];
// 각 정렬을 한눈에 알리는 화살표 아이콘 (↑ 위 / ↕ 가운데 / ↓ 아래).
const VALIGN_ICON: Record<PptVAlign, string> = { top: '↑', middle: '↕', bottom: '↓' };
// 추천 폰트 — 사용자 피드백으로 나눔고딕 (글꼴 임베드도 지원)
const RECOMMENDED_FONT: PptFont = 'nanum-gothic';
// 글꼴 포함(임베드) 지원 글꼴 — lib/pptx.ts EMBED_FONT_FILES와 같은 목록.
const EMBEDDABLE_FONTS: PptFont[] = ['nanum-gothic', 'noto-serif-kr'];

// 각 옵션 라벨을 실제 폰트로 보여준다(레이아웃의 웹폰트 로드 기준). 폴백도 같은 계열.
// 예전엔 나눔명조→Noto Serif, 나눔스퀘어/본고딕→Pretendard로 잘못 매핑돼 라벨이 다 비슷해 보였음.
const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'nanum-gothic': "'Nanum Gothic', 'Noto Sans KR', sans-serif",
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-myeongjo': "'Nanum Myeongjo', 'Noto Serif KR', serif",
  'nanum-square': "'NanumSquare', 'Noto Sans KR', sans-serif",
  'noto-sans-kr': "'Noto Sans KR', sans-serif",
};

export default function PptSection({
  slideCount,
  pptFont,
  setPptFont,
  pptTheme,
  setPptTheme,
  pptVAlign,
  setPptVAlign,
  embedFont,
  setEmbedFont,
  isLoggedIn,
  premiumUnlocked,
  onLockedPremium,
  customBg,
  onCustomBgChange,
  onCustomNotice,
  savedBgs,
  onSelectSaved,
  onDeleteSaved,
  onOpenPreview,
  onDownloadPptx,
  onCopyShareLink,
  onDownloadOpenSong,
  onDownloadPlainSlides,
  busy = false,
}: PptSectionProps) {
  const isEmpty = slideCount === 0;
  const [moreOpen, setMoreOpen] = useState(false);

  // 테마 스와치 한 칸 — 그룹 목록과 "자주 쓰는" 줄에서 같이 쓴다
  const renderThemeTile = (key: PptTheme) => {
    // 움직이는 배경은 유료 예정 — 잠긴 사용자에겐 보이되 어둡게, 선택 불가
    const locked = PREMIUM_THEMES.includes(key) && !premiumUnlocked;
    return (
      <button
        key={key}
        type="button"
        className={`theme-sw ${pptTheme === key ? 'is-active' : ''}${locked ? ' theme-sw-plocked' : ''}`}
        onClick={() => (locked ? onLockedPremium() : setPptTheme(key))}
        aria-pressed={pptTheme === key}
        aria-disabled={locked}
        aria-label={`${PPT_THEME_LABELS[key]} 테마${locked ? ' (유료 준비 중)' : ''}`}
        title={locked ? `${PPT_THEME_LABELS[key]} — 유료 기능으로 준비 중이에요` : PPT_THEME_LABELS[key]}
      >
        <div
          className="theme-sw-preview"
          style={{
            background: THEME_SWATCH_BG[key],
            color: THEME_SWATCH_FG[key],
          }}
        >
          {/* 이미지 테마는 lib/pptx.ts와 동일하게 흰 반투명 레이어 위에 검정 글자 (65% 불투명) */}
          {isImageTheme(key) && <div className="theme-sw-overlay" aria-hidden="true" />}
          <span
            className="theme-sw-letter"
            style={{ fontFamily: 'var(--font-display)', color: THEME_SWATCH_FG[key] }}
          >
            가
          </span>
        </div>
        <div className="theme-sw-name">{PPT_THEME_LABELS[key].split(' ')[0]}</div>
        {/* 왕관은 오른쪽 위 — 선택 체크(✓)와 같은 자리라, 선택 중엔 ✓만 보여준다 */}
        {PREMIUM_THEMES.includes(key) && pptTheme !== key && <CrownBadge />}
        {pptTheme === key && (
          <div className="theme-sw-check" aria-hidden="true">
            ✓
          </div>
        )}
      </button>
    );
  };
  // 교회 PPT 파일 업로드용 숨김 input — 등록 타일 클릭 시 연다
  const customFileRef = useRef<HTMLInputElement>(null);
  // 영상→GIF 변환 진행 상태 — 변환 중엔 타일에 % 표시, 클릭 잠금
  const [converting, setConverting] = useState<{ pct: number; label: string } | null>(null);

  // 테마 그룹 접힘 상태 — localStorage에 기억. 첫 화면은 SSR과 같게(기본값) 그리고,
  // 마운트 후에 저장값 복원 + 지금 선택된 테마가 든 그룹은 펼쳐준다.
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(GROUP_DEFAULT_OPEN);
  useEffect(() => {
    const next = { ...GROUP_DEFAULT_OPEN };
    for (const id of [...THEME_GROUPS.map((g) => g.id), 'mine']) {
      const v = window.localStorage.getItem('cn-theme-group.' + id);
      if (v === '1') next[id] = true;
      else if (v === '0') next[id] = false;
    }
    const holder = THEME_GROUPS.find((g) => g.themes.includes(pptTheme));
    if (holder) next[holder.id] = true;
    if (pptTheme === 'custom') next.mine = true;
    setGroupOpen(next);
    // 마운트 1회만 — 이후 접고 펴는 건 사용자 조작이 진실
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleGroup = (id: string, open: boolean) => {
    setGroupOpen((prev) => (prev[id] === open ? prev : { ...prev, [id]: open }));
    try {
      window.localStorage.setItem('cn-theme-group.' + id, open ? '1' : '0');
    } catch {
      /* 사생활 보호 모드 등 저장 불가 환경 — 기억만 못 할 뿐 동작엔 지장 없음 */
    }
  };

  // 자주 쓰는 배경 — 다운로드 횟수 기준. 마운트 후 localStorage에서 읽는다(hydration 안전).
  const [usage, setUsage] = useState<Record<string, number>>({});
  useEffect(() => {
    setUsage(readUsage());
  }, []);
  const recordThemeUsage = () => {
    const next = { ...readUsage(), [pptTheme]: (readUsage()[pptTheme] ?? 0) + 1 };
    setUsage(next);
    try {
      window.localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch { /* 저장 불가 환경 무시 */ }
  };
  // 2회 이상 쓴 테마 중 상위 4개 (custom은 저장 배경과 헷갈려서 제외)
  const allThemeKeys = THEME_GROUPS.flatMap((g) => g.themes);
  const frequentThemes = isLoggedIn
    ? (Object.entries(usage)
        .filter(([key, count]) => count >= 2 && allThemeKeys.includes(key as PptTheme))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([key]) => key) as PptTheme[])
    : [];

  const handleCustomTileClick = () => {
    if (!premiumUnlocked) {
      onLockedPremium(); // 잠김 — "유료 준비 중" 안내
      return;
    }
    if (converting) return;
    customFileRef.current?.click();
  };

  // 파일 종류별 처리: 이미지=그대로 / GIF=용량 검사 / 영상=브라우저에서 GIF 변환
  const handleCustomFile = async (file: File) => {
    try {
      if (file.type.startsWith('video/')) {
        setConverting({ pct: 0, label: '변환 준비' });
        const res = await videoFileToGif(file, (pct, label) => setConverting({ pct, label }));
        if (res.bytes > CUSTOM_BG_MAX_BYTES) {
          onCustomNotice('변환해도 10MB가 넘어요 — 더 짧거나 단순한 영상으로 해주세요');
          return;
        }
        onCustomBgChange({ src: res.dataUrl, kind: 'gif' }, res.trimmed ? '영상이 길어서 앞 10초만 사용했어요' : undefined);
      } else if (file.type === 'image/gif') {
        if (file.size > CUSTOM_BG_MAX_BYTES) {
          onCustomNotice('GIF가 10MB를 넘어요 — 더 작은 파일로 해주세요');
          return;
        }
        onCustomBgChange({ src: await fileToDataUrl(file), kind: 'gif' });
      } else if (/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        onCustomBgChange({ src: await fileToDataUrl(file), kind: 'image' });
      } else {
        onCustomNotice('이미지(JPG·PNG)·GIF·짧은 영상(MP4)만 올릴 수 있어요');
      }
    } catch (err) {
      console.warn('[custom-bg] 처리 실패:', err);
      onCustomNotice('파일을 처리하지 못했어요 — 다른 파일로 해보세요');
    } finally {
      setConverting(null);
    }
  };

  const handleCustomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택도 onChange가 다시 불리게 초기화
    if (file) void handleCustomFile(file);
  };

  // 드래그앤드롭 — 등록 타일에 파일을 끌어다 놓으면 바로 처리
  const handleCustomDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!premiumUnlocked) {
      onLockedPremium();
      return;
    }
    if (converting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleCustomFile(file);
  };

  return (
    <section className="panel ppt-panel" aria-labelledby="ppt-h">
      <div className="section-head">
        <div className="left">
          <span className="step-num-inline">04</span>
          <h2 id="ppt-h">PPT 만들기</h2>
        </div>
        <div className="mono ppt-meta">
          {isEmpty ? '콘티가 비어있음' : `${slideCount}장 슬라이드`}
        </div>
      </div>

      <div className="ppt-controls">
        {/* 테마 — 묶음별 접이식 (기본/실사/움직이는 배경/내 배경) */}
        <div className="ppt-ctrl-block">
          <div className="ppt-ctrl-label label">테마</div>
          {/* 자주 쓰는 배경 — 다운로드 2회 이상 한 테마 상위 4개 (로그인 시에만) */}
          {frequentThemes.length > 0 && (
            <details
              className="theme-group"
              open={!!groupOpen.freq}
              onToggle={(e) => toggleGroup('freq', (e.target as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="theme-group-arrow" aria-hidden="true">▸</span>
                자주 쓰는
                <span className="theme-group-count mono">{frequentThemes.length}</span>
              </summary>
              <div className="ppt-themes">{frequentThemes.map(renderThemeTile)}</div>
            </details>
          )}
          {THEME_GROUPS.map((group) => (
            <details
              key={group.id}
              className="theme-group"
              open={!!groupOpen[group.id]}
              onToggle={(e) => toggleGroup(group.id, (e.target as HTMLDetailsElement).open)}
            >
              <summary>
                <span className="theme-group-arrow" aria-hidden="true">▸</span>
                {group.label}
                {group.premium && <CrownInline />}
                <span className="theme-group-count mono">{group.themes.length}</span>
              </summary>
              <div className="ppt-themes">
            {group.themes.map(renderThemeTile)}
              </div>
            </details>
          ))}

          {/* 내 배경 — 저장된 것 + 방금 올린 것 + 등록 타일 */}
          <details
            className="theme-group"
            open={!!groupOpen.mine}
            onToggle={(e) => toggleGroup('mine', (e.target as HTMLDetailsElement).open)}
          >
            <summary>
              <span className="theme-group-arrow" aria-hidden="true">▸</span>
              내 배경
              <CrownInline />
              <span className="theme-group-count mono">{savedBgs.length}</span>
            </summary>
            <div className="ppt-themes">
            {/* 클라우드에 저장된 "내 배경" 목록 — 선택·삭제 가능 (유료 기능, 지금은 운영자만) */}
            {savedBgs.map((bg) => {
              const active = pptTheme === 'custom' && customBg?.src === bg.url;
              return (
                <button
                  key={bg.id}
                  type="button"
                  className={`theme-sw ${active ? 'is-active' : ''}`}
                  onClick={() => onSelectSaved(bg)}
                  aria-pressed={active}
                  title={`${bg.name} (저장된 내 배경)`}
                >
                  <div
                    className="theme-sw-preview"
                    style={{ background: `url('${bg.url}') center/cover` }}
                  >
                    {/* 이미지는 실제 출력처럼 흰 오버레이+검정, GIF는 어두운 배경 가정이라 흰 글자 */}
                    {bg.kind === 'image' && <div className="theme-sw-overlay" aria-hidden="true" />}
                    <span
                      className="theme-sw-letter"
                      style={{ fontFamily: 'var(--font-display)', color: bg.kind === 'gif' ? '#FFFFFF' : '#1F1B16' }}
                    >
                      가
                    </span>
                  </div>
                  <div className="theme-sw-name">{bg.name}</div>
                  {/* 저장 배경 삭제 — 스와치 왼쪽 위 작은 ✕ */}
                  <span
                    className="theme-sw-del"
                    role="button"
                    aria-label={`${bg.name} 삭제`}
                    title="삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSaved(bg);
                    }}
                  >
                    ✕
                  </span>
                  {active && <div className="theme-sw-check" aria-hidden="true">✓</div>}
                </button>
              );
            })}
            {/* 방금 올린(아직 저장 안 된) 배경 — 세션 한정 스와치 */}
            {customBg && customBg.src.startsWith('data:') && (
              <button
                type="button"
                className={`theme-sw ${pptTheme === 'custom' ? 'is-active' : ''}`}
                onClick={() => setPptTheme('custom')}
                aria-pressed={pptTheme === 'custom'}
                aria-label="내 교회 PPT 테마"
                title={PPT_THEME_LABELS['custom']}
              >
                <div
                  className="theme-sw-preview"
                  style={{ background: `url('${customBg.src}') center/cover` }}
                >
                  {customBg.kind === 'image' && <div className="theme-sw-overlay" aria-hidden="true" />}
                  <span
                    className="theme-sw-letter"
                    style={{ fontFamily: 'var(--font-display)', color: customBg.kind === 'gif' ? '#FFFFFF' : '#1F1B16' }}
                  >
                    가
                  </span>
                </div>
                <div className="theme-sw-name">내 교회</div>
                {pptTheme !== 'custom' && <CrownBadge />}
                {pptTheme === 'custom' && (
                  <div className="theme-sw-check" aria-hidden="true">✓</div>
                )}
              </button>
            )}
            {/* 교회 PPT 등록 타일 — 이미지·GIF·짧은 영상(자동 GIF 변환). 드래그앤드롭 지원 */}
            <button
              type="button"
              className="theme-sw theme-sw-add"
              onClick={handleCustomTileClick}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleCustomDrop}
              title="교회 PPT 이미지·GIF·짧은 영상(10초)을 올리면 배경이 돼요 — 끌어다 놔도 됩니다"
            >
              <div className="theme-sw-preview theme-sw-add-preview">
                {converting ? (
                  <span className="theme-sw-add-progress">{converting.label} {converting.pct}%</span>
                ) : (
                  <span className="theme-sw-add-plus" aria-hidden="true">+</span>
                )}
              </div>
              <div className="theme-sw-name">{converting ? '영상 변환 중' : customBg ? '배경 바꾸기' : '교회 PPT 등록'}</div>
              <CrownBadge />
            </button>
            </div>
          </details>
          <input
            ref={customFileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
            onChange={handleCustomInput}
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        {/* 폰트 */}
        <div className="ppt-ctrl-block">
          <div className="ppt-ctrl-label label">폰트</div>
          <div className="ppt-fonts">
            {FONT_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`ppt-font ${pptFont === key ? 'is-active' : ''}`}
                onClick={() => setPptFont(key)}
                aria-pressed={pptFont === key}
              >
                <div className="ppt-font-name" style={{ fontFamily: FONT_FAMILY_PREVIEW[key] }}>
                  {PPT_FONT_LABELS[key]}
                </div>
                {key === RECOMMENDED_FONT && <div className="ppt-font-rec">추천</div>}
              </button>
            ))}
          </div>
        </div>

        {/* 세로 정렬 — 가사를 슬라이드 위/가운데/아래 어디에 둘지. 미리보기와 PPT에 즉시 반영. */}
        <div className="ppt-ctrl-block">
          <div className="ppt-ctrl-label label">세로 정렬</div>
          <div className="ppt-fonts ppt-valign">
            {VALIGN_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`ppt-font ${pptVAlign === key ? 'is-active' : ''}`}
                onClick={() => setPptVAlign(key)}
                aria-pressed={pptVAlign === key}
                aria-label={`${PPT_VALIGN_LABELS[key]} 정렬`}
              >
                <div className="ppt-font-name">
                  <span aria-hidden="true" style={{ marginRight: 5, opacity: 0.7 }}>
                    {VALIGN_ICON[key]}
                  </span>
                  {PPT_VALIGN_LABELS[key]}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 글꼴 포함 — 켜면 본명조를 PPT에 심어, 글꼴 안 깔린 PC에서도 그대로 보인다.
            (서브셋이라 파일 ~1MB만 커짐 · 현재 본명조 1종 지원) */}
        <div className="ppt-ctrl-block">
          <div className="ppt-ctrl-label label">글꼴 포함</div>
          <div
            className="toggle"
            data-on={embedFont}
            onClick={() => setEmbedFont(!embedFont)}
            role="switch"
            aria-checked={embedFont}
          >
            <span className="track" />
            <span>PPT에 글꼴 포함 {embedFont ? '(켜짐)' : '(꺼짐)'}</span>
          </div>
          <div className="caption" style={{ color: 'var(--ink-3)', marginTop: 6, fontSize: 12 }}>
            {EMBEDDABLE_FONTS.includes(pptFont)
              ? '글꼴 안 깔린 PC에서도 그대로 보여요 · 파일 약 1MB 커짐'
              : '나눔고딕(추천)·본명조를 고르면 적용돼요 — 지금 글꼴은 포함 안 됨'}
          </div>
        </div>
      </div>

      {/* 미리보기 / PPT 다운로드 */}
      <div className="ppt-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onOpenPreview}
          disabled={isEmpty || busy}
        >
          👁 전체 미리보기
        </button>
        <button
          type="button"
          className="btn btn-primary btn-lg ppt-download"
          onClick={() => {
            recordThemeUsage(); // "자주 쓰는 배경" 집계 — 다운로드가 가장 확실한 사용 신호
            onDownloadPptx();
          }}
          disabled={isEmpty || busy}
        >
          ⬇ PPT 다운로드 (.pptx)
        </button>
      </div>

      {/* 다른 형식으로 내보내기 (보조 출구) */}
      <details
        className="ppt-more"
        open={moreOpen}
        onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          <span
            style={{
              display: 'inline-block',
              transform: moreOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 160ms',
              marginRight: 6,
            }}
          >
            ▾
          </span>
          다른 형식으로 내보내기
        </summary>
        <div className="ppt-more-grid">
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onCopyShareLink}
            disabled={isEmpty || busy}
            title="콘티를 URL에 인코딩해서 복사 (외부 서버 X)"
          >
            🔗 공유 링크 복사
          </button>
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onDownloadPlainSlides}
            disabled={isEmpty || busy}
            title="다른 PPT 도구용 plain slides .txt"
          >
            📄 Plain Slides (.txt)
          </button>
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onDownloadOpenSong}
            disabled={isEmpty || busy}
            title="OpenSong 등 찬양 전용 SW용"
          >
            🎵 OpenSong (.xml)
          </button>
        </div>
      </details>
    </section>
  );
}
