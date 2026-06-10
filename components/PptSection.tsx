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
import { fileToDataUrl } from '@/lib/custom-bg';
import { useRef, useState } from 'react';

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
  // 유료 기능(움직이는 배경 + 교회 PPT 등록) 잠금 — 운영자 계정만 해제.
  // 잠긴 사용자에겐 보이되 어둡게 표시되고, 누르면 유료 안내만 나온다.
  premiumUnlocked: boolean;
  onLockedPremium: () => void;                   // 잠긴 상태에서 클릭 시 (유료 안내 토스트)
  // 내 교회 PPT(커스텀 배경)
  customBg: string | null;                       // 업로드된 이미지 dataURL (없으면 null)
  onCustomBgChange: (dataUrl: string) => void;   // 업로드 완료 시 (부모가 custom 테마로 전환)
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
};
// 흰 반투명 오버레이를 까는 실사 테마 — lib/pptx.ts와 동일 규칙 (은하수는 어두워서 제외)
const OVERLAY_THEMES: PptTheme[] = ['meadow', 'cross', 'bible', 'sunrise', 'godrays', 'wheat', 'sea', 'flowers'];
const isImageTheme = (theme: PptTheme): boolean => OVERLAY_THEMES.includes(theme);

// 순서(사용자 지정): 단색·실사 6종 → 움직이는 홀리 13종 → (별도) 교회 PPT 등록 타일.
const THEME_ORDER: PptTheme[] = [
  'black', 'white', 'paper', 'bible', 'meadow', 'cross',
  'sunrise', 'milkyway', 'godrays', 'wheat', 'sea', 'flowers',
  'light', 'dawn', 'serene', 'green', 'gold', 'pink', 'violet',
  'wave', 'mist', 'candle', 'grace', 'aurora', 'crosslight',
];
// 유료 예정 기능(움직이는 배경 전부) — 오른쪽 위에 왕관 표시 (지금은 모두 무료로 열려 있음)
const PREMIUM_THEMES: PptTheme[] = [
  'light', 'dawn', 'serene', 'green', 'gold', 'pink', 'violet',
  'wave', 'mist', 'candle', 'grace', 'aurora', 'crosslight',
];

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
  premiumUnlocked,
  onLockedPremium,
  customBg,
  onCustomBgChange,
  onOpenPreview,
  onDownloadPptx,
  onCopyShareLink,
  onDownloadOpenSong,
  onDownloadPlainSlides,
  busy = false,
}: PptSectionProps) {
  const isEmpty = slideCount === 0;
  const [moreOpen, setMoreOpen] = useState(false);
  // 교회 PPT 이미지 업로드용 숨김 input — 등록 타일 클릭 시 연다
  const customFileRef = useRef<HTMLInputElement>(null);

  const handleCustomTileClick = () => {
    if (!premiumUnlocked) {
      onLockedPremium(); // 잠김 — "유료 준비 중" 안내
      return;
    }
    customFileRef.current?.click();
  };

  const handleCustomFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 같은 파일 재선택도 onChange가 다시 불리게 초기화
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    onCustomBgChange(dataUrl); // 부모가 저장 + custom 테마로 전환
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
        {/* 테마 */}
        <div className="ppt-ctrl-block">
          <div className="ppt-ctrl-label label">테마</div>
          <div className="ppt-themes">
            {THEME_ORDER.map((key) => {
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
                  {/* 이미지 테마는 lib/pptx.ts와 동일하게 흰 반투명 레이어 위에 검정 글자.
                      transparency 35 = 65% 불투명. */}
                  {isImageTheme(key) && (
                    <div className="theme-sw-overlay" aria-hidden="true" />
                  )}
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
            })}
            {/* 등록된 내 교회 PPT — 일반 테마처럼 선택 가능한 스와치로 표시 */}
            {customBg && (
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
                  style={{ background: `url('${customBg}') center/cover`, color: '#1F1B16' }}
                >
                  {/* 실제 PPT와 동일하게 흰 반투명 오버레이("투명도 낮춤") 위에 검정 글자 */}
                  <div className="theme-sw-overlay" aria-hidden="true" />
                  <span className="theme-sw-letter" style={{ fontFamily: 'var(--font-display)', color: '#1F1B16' }}>
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
            {/* 교회 PPT 등록 타일 — 유료 예정(왕관)이지만 지금은 누구나 등록 가능 */}
            <button
              type="button"
              className="theme-sw theme-sw-add"
              onClick={handleCustomTileClick}
              title="교회에서 쓰는 PPT 이미지를 올리면 배경이 돼요 (투명도는 자동으로 낮춰져요)"
            >
              <div className="theme-sw-preview theme-sw-add-preview">
                <span className="theme-sw-add-plus" aria-hidden="true">+</span>
              </div>
              <div className="theme-sw-name">{customBg ? '이미지 바꾸기' : '교회 PPT 등록'}</div>
              <CrownBadge />
            </button>
            <input
              ref={customFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleCustomFile}
              style={{ display: 'none' }}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>
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
          onClick={onDownloadPptx}
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
