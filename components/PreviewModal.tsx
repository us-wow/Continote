'use client';

// PPT 전체 미리보기 모달 — 04 PPT 만들기의 "전체 미리보기" 버튼이 트리거.
// 슬라이드 배열을 그리드로 보여줘 사용자가 다운로드 전에 한눈에 검토할 수 있다.
//
// 실제 PPT 다운로드는 page.tsx 의 handleSavePptx 가 pptxgenjs 로 처리하고,
// 이 모달은 시각 검토 전용이라 종이 위에 인쇄된 듯한 단순 카드만 보여준다.

import { useEffect } from 'react';
import { buildSlidesFromText, type Slide } from '@/lib/text-doc';
import { PPT_FONT_LABELS, PPT_THEME_LABELS, type PptFont, type PptTheme } from '@/lib/pptx';

type PreviewModalProps = {
  open: boolean;
  onClose: () => void;
  text: string;
  pptTheme: PptTheme;
  pptFont: PptFont;
};

const THEME_BG: Record<PptTheme, string> = {
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  meadow: "url('/pptx-bg-meadow.jpg') center/cover, #B8D27A",
  cross: "url('/pptx-bg-cross.jpg') center/cover, #1a140e",
  bible: "url('/pptx-bg-bible.jpg') center/cover, #c19b6e",
};
const THEME_FG: Record<PptTheme, string> = {
  black: '#FFFFFF',
  white: '#1F1B16',
  paper: '#1F1B16',
  meadow: '#1F1B16',
  cross: '#F4E8D2',
  bible: '#1F1B16',
};
// 실사 이미지 테마는 흰 반투명 오버레이 위에 검정 글자 (lib/pptx.ts 와 동일 규칙)
const THEME_OVERLAY: Partial<Record<PptTheme, string>> = {
  meadow: 'rgba(255,255,255,0.65)',
  cross: 'rgba(0,0,0,0.40)',
  bible: 'rgba(255,255,255,0.55)',
};

const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-myeongjo': "'Noto Serif KR', serif",
  'nanum-square': "'Pretendard Variable', sans-serif",
  'noto-sans-kr': "'Pretendard Variable', sans-serif",
};

export default function PreviewModal({
  open,
  onClose,
  text,
  pptTheme,
  pptFont,
}: PreviewModalProps) {
  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const slides = buildSlidesFromText(text);
  const overlay = THEME_OVERLAY[pptTheme];

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="PPT 전체 미리보기"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(31, 27, 22, 0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          maxWidth: 1100,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 28px',
          position: 'relative',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.3)',
          border: '1px solid var(--rule)',
        }}
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: '1px solid var(--rule)',
            background: 'var(--paper)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ✕
        </button>

        <header style={{ marginBottom: 18, paddingRight: 32 }}>
          <h2
            className="h-display"
            style={{ margin: 0, fontSize: 22 }}
          >
            전체 미리보기
          </h2>
          <p className="caption" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
            {slides.length}장 슬라이드 · {PPT_THEME_LABELS[pptTheme]} · {PPT_FONT_LABELS[pptFont]}
          </p>
        </header>

        {slides.length === 0 ? (
          <div
            className="caption"
            style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--ink-3)' }}
          >
            아직 슬라이드가 없어요. 콘티 편집에서 가사를 추가하세요.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 14,
            }}
          >
            {slides.map((slide, i) => (
              <SlidePreview
                key={i}
                slide={slide}
                index={i + 1}
                themeBg={THEME_BG[pptTheme]}
                themeFg={THEME_FG[pptTheme]}
                overlay={overlay}
                fontFamily={FONT_FAMILY_PREVIEW[pptFont]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SlidePreview({
  slide,
  index,
  themeBg,
  themeFg,
  overlay,
  fontFamily,
}: {
  slide: Slide;
  index: number;
  themeBg: string;
  themeFg: string;
  overlay?: string;
  fontFamily: string;
}) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: themeBg,
          color: themeFg,
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          fontFamily,
        }}
      >
        {/* 실사 테마는 흰/검 반투명 오버레이 — lib/pptx.ts 슬라이드 렌더링과 톤 일치 */}
        {overlay && (
          <div
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, background: overlay }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 14px',
            textAlign: 'center',
          }}
        >
          {slide.kind === 'title' ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>{slide.title}</div>
              {slide.subtitle && (
                <div style={{ marginTop: 6, fontSize: 11, opacity: 0.8 }}>{slide.subtitle}</div>
              )}
            </div>
          ) : slide.kind === 'memo' ? (
            <div style={{ fontStyle: 'italic', fontSize: 13, lineHeight: 1.4 }}>{slide.text}</div>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              {slide.lines.map((l, j) => (
                <div key={j}>{l}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      <figcaption className="mono" style={{ marginTop: 4, fontSize: 10, color: 'var(--ink-3)' }}>
        {String(index).padStart(2, '0')} ·{' '}
        {slide.kind === 'title' ? '제목' : slide.kind === 'memo' ? '메모' : '가사'}
      </figcaption>
    </figure>
  );
}
