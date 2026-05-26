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
  // 4줄 한도를 넘는 슬라이드 인덱스 — 빨간 테두리 + "4줄 초과" 배지로 강조.
  // 사용자가 해당 슬라이드를 줄이면 부모가 새 indices를 넘기면서 빨간색 자동 풀림.
  overflowSlideIndices?: number[];
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

// 미리보기 글씨체를 실제 PPT 출력 폰트와 일치시킨다.
// 이전에는 4개 폰트 옵션을 단 2개 웹폰트(Noto Serif KR / Pretendard)로 뭉뚱그려 표시했는데,
// 그러면 사용자가 "나눔명조"를 골라도 미리보기에선 다른 폰트가 보였다.
// 각 옵션을 같은 이름의 웹폰트로 매핑하고, fallback도 같은 계열로 둔다.
// (앞단에서 layout.tsx가 해당 웹폰트들을 로드해야 시각적으로 일치)
const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'nanum-myeongjo': "'Nanum Myeongjo', 'Noto Serif KR', serif",
  'noto-serif-kr': "'Noto Serif KR', serif",
  'nanum-square': "'NanumSquare', 'Noto Sans KR', 'Pretendard Variable', sans-serif",
  'noto-sans-kr': "'Noto Sans KR', 'Pretendard Variable', sans-serif",
};

export default function PreviewModal({
  open,
  onClose,
  text,
  pptTheme,
  pptFont,
  overflowSlideIndices = [],
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
          {/* 사용자 PC에 해당 한국 폰트가 안 깔려 있으면 PowerPoint가 기본 폰트로 대체해 미리보기와
              달라 보일 수 있다. 한 줄 안내로 사용자가 원인을 빠르게 파악하게 함. */}
          <p className="caption" style={{ marginTop: 4, color: 'var(--ink-3)', fontSize: 11.5 }}>
            ※ PowerPoint에서 글씨체가 달라 보이면 사용 PC에 해당 한국 폰트를 설치해 주세요.
          </p>
          {overflowSlideIndices.length > 0 && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '8px 12px',
                background: 'color-mix(in oklab, var(--danger) 10%, transparent)',
                border: '1px solid color-mix(in oklab, var(--danger) 40%, transparent)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 12.5,
                color: 'var(--danger)',
                fontWeight: 500,
              }}
            >
              ⚠ {overflowSlideIndices.map((i) => i + 1).join(', ')}번 슬라이드가 <b>4줄을 넘어요</b>.
              빨간 테두리로 표시된 슬라이드를 줄여주세요.
            </div>
          )}
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
                isOverflow={overflowSlideIndices.includes(i)}
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
  isOverflow,
  themeBg,
  themeFg,
  overlay,
  fontFamily,
}: {
  slide: Slide;
  index: number;
  isOverflow: boolean;
  themeBg: string;
  themeFg: string;
  overlay?: string;
  fontFamily: string;
}) {
  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      {/* 좌상단 번호 뱃지 — 항상 표시. 사용자가 토스트의 "11번 슬라이드"를 즉시 찾을 수 있게.
          overflow일 땐 빨강, 평소엔 회색. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 4,
          left: 4,
          zIndex: 2,
          minWidth: 22,
          height: 22,
          padding: '0 6px',
          borderRadius: 11,
          background: isOverflow ? 'var(--danger)' : 'rgba(31,27,22,0.78)',
          color: '#fff',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: '0.02em',
        }}
      >
        {index}
      </div>
      <div
        style={{
          position: 'relative',
          aspectRatio: '16 / 9',
          background: themeBg,
          color: themeFg,
          /* overflow 슬라이드는 빨강 굵은 테두리 + 살짝 빨강 글로우로 즉시 눈에 띄게. */
          border: isOverflow ? '2px solid var(--danger)' : '1px solid var(--rule)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          fontFamily,
          boxShadow: isOverflow
            ? '0 0 0 3px color-mix(in oklab, var(--danger) 20%, transparent)'
            : undefined,
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
      <figcaption
        className="mono"
        style={{
          marginTop: 4,
          fontSize: 10,
          color: isOverflow ? 'var(--danger)' : 'var(--ink-3)',
          fontWeight: isOverflow ? 700 : 400,
        }}
      >
        {String(index).padStart(2, '0')} ·{' '}
        {slide.kind === 'title' ? '제목' : slide.kind === 'memo' ? '메모' : '가사'}
        {isOverflow && ' · 4줄 초과'}
      </figcaption>
    </figure>
  );
}
