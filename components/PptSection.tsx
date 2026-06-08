'use client';

// 4번 영역 — PPT 만들기 (별도 단계)
//
// "슬라이드가 필요한 사람만" 들어오는 영역.
// 03 콘티 편집의 다운로드 4종(클립보드/TXT/DOCX/PDF)과는 별도 출구.
//
// 컨트롤:
//   - 테마 6종 (검정/흰색/종이/초원/십자가/성경책)
//   - 폰트 4종 (본명조 Pro 추천)
//   - 저작권 슬라이드 토글 (CCLI 자동 표시)
//   - 미리보기 / PPT 다운로드
//   - "다른 형식으로 내보내기" → 공유 링크 / OpenSong / Plain Slides 등 보조 출구

import { PPT_FONT_LABELS, PPT_THEME_LABELS, PPT_VALIGN_LABELS, type PptFont, type PptTheme, type PptVAlign } from '@/lib/pptx';
import { useState } from 'react';

type PptSectionProps = {
  slideCount: number;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  // 세로 정렬 — 상단/가운데/하단. 선택 즉시 미리보기와 PPT 출력에 함께 반영된다.
  pptVAlign: PptVAlign;
  setPptVAlign: (v: PptVAlign) => void;
  includeCopyright: boolean;
  setIncludeCopyright: (next: boolean) => void;
  onOpenPreview: () => void;
  onDownloadPptx: () => void;
  // "다른 형식으로 내보내기" — 토글 펼치면 보임
  onCopyShareLink: () => void;
  onDownloadOpenSong: () => void;
  onDownloadPlainSlides: () => void;
  busy?: boolean;
  // 선택형 CCLI 입력 — 4개 prop 모두 넘어오고 includeCopyright가 켜졌을 때만 입력 폼 노출.
  // 데스크톱은 교회 템플릿 모달에서 별도 입력하므로 안 넘기고, 모바일에서만 인라인으로 받게 한다.
  ccliNumber?: string;
  setCcliNumber?: (next: string) => void;
  licenseLabel?: string;
  setLicenseLabel?: (next: string) => void;
};

// swatch 배경 — 실제 PPT에 들어가는 색/이미지를 그대로 보여준다 (mock 그라데이션 X).
// 이미지 테마는 lib/pptx.ts와 동일하게 public/pptx-bg-*.jpg 사용.
const THEME_SWATCH_BG: Record<PptTheme, string> = {
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  // 홀리 그라데이션 3종 — 실제 .jpg를 스와치 배경으로 그대로 보여준다(미리보기=실제 출력).
  light: "url('/pptx-bg-light.jpg') center/cover",
  dawn: "url('/pptx-bg-dawn.jpg') center/cover",
  serene: "url('/pptx-bg-serene.jpg') center/cover",
  meadow: "url('/pptx-bg-meadow.jpg') center/cover",
  cross: "url('/pptx-bg-cross.jpg') center/cover",
  bible: "url('/pptx-bg-bible.jpg') center/cover",
};
// 글자색 — lib/pptx.ts의 text 컬러와 동일. 이미지 테마는 흰 반투명 오버레이 위에 검정 잉크.
const THEME_SWATCH_FG: Record<PptTheme, string> = {
  black: '#FFFFFF',
  white: '#1F1B16',
  paper: '#1F1B16',
  // 빛내림/새벽은 어두운 배경 → 흰 글자, 고요한빛은 밝은 배경 → 검정 글자.
  light: '#FFFFFF',
  dawn: '#FFFFFF',
  serene: '#1F1B16',
  meadow: '#1F1B16',
  cross: '#1F1B16',
  bible: '#1F1B16',
};
// 이미지 테마 여부 — 흰 반투명 오버레이 깔지 결정.
const isImageTheme = (theme: PptTheme): boolean =>
  theme === 'meadow' || theme === 'cross' || theme === 'bible';

// 순서: 단색 3종 → 홀리 그라데이션 3종 → 실사 사진 3종.
const THEME_ORDER: PptTheme[] = ['black', 'white', 'paper', 'light', 'dawn', 'serene', 'meadow', 'cross', 'bible'];
const FONT_ORDER: PptFont[] = ['noto-serif-kr', 'nanum-myeongjo', 'nanum-square', 'noto-sans-kr'];
// 세로 정렬 버튼 순서 — 화면 위→아래 순으로 자연스럽게 배치.
const VALIGN_ORDER: PptVAlign[] = ['top', 'middle', 'bottom'];
// 각 정렬을 한눈에 알리는 화살표 아이콘 (↑ 위 / ↕ 가운데 / ↓ 아래).
const VALIGN_ICON: Record<PptVAlign, string> = { top: '↑', middle: '↕', bottom: '↓' };
// 추천 폰트 — 한글 호환성 최고
const RECOMMENDED_FONT: PptFont = 'noto-serif-kr';

const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-myeongjo': "'Noto Serif KR', serif",
  'nanum-square': "'Pretendard Variable', sans-serif",
  'noto-sans-kr': "'Pretendard Variable', sans-serif",
};

export default function PptSection({
  slideCount,
  pptFont,
  setPptFont,
  pptTheme,
  setPptTheme,
  pptVAlign,
  setPptVAlign,
  includeCopyright,
  setIncludeCopyright,
  onOpenPreview,
  onDownloadPptx,
  onCopyShareLink,
  onDownloadOpenSong,
  onDownloadPlainSlides,
  busy = false,
  ccliNumber,
  setCcliNumber,
  licenseLabel,
  setLicenseLabel,
}: PptSectionProps) {
  // 4개 prop 모두 들어왔을 때만 인라인 CCLI 입력 폼을 그린다(주로 모바일).
  // 데스크톱은 교회 템플릿 모달에서 따로 입력받으므로 이 값이 undefined로 들어와 폼 미노출.
  const canEditCopyrightInline =
    typeof ccliNumber === 'string' &&
    typeof setCcliNumber === 'function' &&
    typeof licenseLabel === 'string' &&
    typeof setLicenseLabel === 'function';
  const isEmpty = slideCount === 0;
  const [moreOpen, setMoreOpen] = useState(false);

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
            {THEME_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`theme-sw ${pptTheme === key ? 'is-active' : ''}`}
                onClick={() => setPptTheme(key)}
                aria-pressed={pptTheme === key}
                aria-label={`${PPT_THEME_LABELS[key]} 테마`}
                title={PPT_THEME_LABELS[key]}
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
                {pptTheme === key && (
                  <div className="theme-sw-check" aria-hidden="true">
                    ✓
                  </div>
                )}
              </button>
            ))}
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
          <div className="ppt-fonts">
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

        {/* 저작권 슬라이드 토글 */}
        <div className="ppt-ctrl-block">
          <div className="ppt-toggle-row">
            <button
              type="button"
              className="toggle-pill"
              role="switch"
              aria-checked={includeCopyright}
              data-on={includeCopyright}
              onClick={() => setIncludeCopyright(!includeCopyright)}
            />
            <div className="ppt-toggle-text">
              <div className="ppt-toggle-title">저작권 슬라이드 포함</div>
              <div className="ppt-toggle-sub">PPT 마지막에 곡 제목 + CCLI 번호 자동 표시</div>
            </div>
          </div>
          {/* 인라인 CCLI 입력 — 모바일처럼 별도 템플릿 모달이 없는 환경에서 직접 입력받기 위한 폼.
              4개 prop이 모두 넘어오고 토글이 켜졌을 때만 렌더. 데스크톱은 prop 미전달로 자동 미노출. */}
          {canEditCopyrightInline && includeCopyright && (
            <div
              style={{
                marginTop: 10,
                display: 'grid',
                gap: 8,
                paddingLeft: 4,
              }}
            >
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink-3)' }}>CCLI 번호 (선택)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="예: 1234567"
                  value={ccliNumber}
                  onChange={(e) => setCcliNumber!(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--rule)',
                    background: 'var(--surface, #fff)',
                    color: 'var(--ink)',
                    fontSize: 14,
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink-3)' }}>라이선스 표기 (선택)</span>
                <input
                  type="text"
                  placeholder="예: 사용허가 받음"
                  value={licenseLabel}
                  onChange={(e) => setLicenseLabel!(e.target.value)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--rule)',
                    background: 'var(--surface, #fff)',
                    color: 'var(--ink)',
                    fontSize: 14,
                  }}
                />
              </label>
            </div>
          )}
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
