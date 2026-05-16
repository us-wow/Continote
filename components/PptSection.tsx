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

import { PPT_FONT_LABELS, PPT_THEME_LABELS, type PptFont, type PptTheme } from '@/lib/pptx';
import { useState } from 'react';

type PptSectionProps = {
  slideCount: number;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  includeCopyright: boolean;
  setIncludeCopyright: (next: boolean) => void;
  onOpenPreview: () => void;
  onDownloadPptx: () => void;
  // "다른 형식으로 내보내기" — 토글 펼치면 보임
  onCopyShareLink: () => void;
  onDownloadOpenSong: () => void;
  onDownloadPlainSlides: () => void;
  busy?: boolean;
};

// 미리보기 swatch — 솔리드 색 또는 그라데이션 fallback (실사 이미지는 public/에서 로드)
const THEME_SWATCH_BG: Record<PptTheme, string> = {
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  meadow: 'linear-gradient(135deg, #6FA45C 0%, #B8D27A 60%, #E8D58A 100%)',
  cross: 'linear-gradient(180deg, #3a3128 0%, #1a140e 100%)',
  bible: 'linear-gradient(135deg, #7a5a36 0%, #c19b6e 50%, #f0dab4 100%)',
};
const THEME_SWATCH_FG: Record<PptTheme, string> = {
  black: '#FFFFFF',
  white: '#1F1B16',
  paper: '#1F1B16',
  meadow: '#1F1B16',
  cross: '#F4E8D2',
  bible: '#1F1B16',
};
const THEME_HINT: Partial<Record<PptTheme, string>> = {
  meadow: '🌿',
  cross: '✦',
  bible: '📖',
};

const THEME_ORDER: PptTheme[] = ['black', 'white', 'paper', 'meadow', 'cross', 'bible'];
const FONT_ORDER: PptFont[] = ['noto-serif-kr', 'nanum-myeongjo', 'nanum-square', 'noto-sans-kr'];
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
  includeCopyright,
  setIncludeCopyright,
  onOpenPreview,
  onDownloadPptx,
  onCopyShareLink,
  onDownloadOpenSong,
  onDownloadPlainSlides,
  busy = false,
}: PptSectionProps) {
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
                  <span
                    className="theme-sw-letter"
                    style={{ fontFamily: 'var(--font-display)', color: THEME_SWATCH_FG[key] }}
                  >
                    가
                  </span>
                  {THEME_HINT[key] && (
                    <span className="theme-sw-hint" aria-hidden="true">
                      {THEME_HINT[key]}
                    </span>
                  )}
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
