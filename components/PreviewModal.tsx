'use client';

// PPT 전체 미리보기 모달 — 04 PPT 만들기의 "전체 미리보기" 버튼이 트리거.
// 슬라이드 배열을 그리드로 보여줘 사용자가 다운로드 전에 한눈에 검토할 수 있다.
//
// 슬라이드 카드 렌더링은 공용 부품 LivePreview(mode='grid')에 위임한다 — 데스크탑 우측·모바일 독과
// 같은 부품이라 "미리보기 = 실제 PPT"가 한 곳에서 보장된다. 이 모달은 창(헤더·닫기·스크롤)만 담당.

import { useEffect } from 'react';
import { buildSlidesFromText } from '@/lib/text-doc';
import { PPT_FONT_LABELS, PPT_THEME_LABELS, type PptFont, type PptTheme, type PptVAlign } from '@/lib/pptx';
import LivePreview from '@/components/LivePreview';

type PreviewModalProps = {
  open: boolean;
  onClose: () => void;
  text: string;
  pptTheme: PptTheme;
  // 곡별 배경(유료) — 곡 순번(0번부터)별 테마. 없으면 해당 곡은 pptTheme를 따른다.
  songThemes?: (PptTheme | undefined)[];
  pptFont: PptFont;
  // 세로 정렬 — 실제 PPT 출력과 동일하게 카드 안 텍스트 위치를 위/가운데/아래로 맞춘다.
  pptVAlign: PptVAlign;
  // 4줄 한도를 넘는 슬라이드 인덱스 — 빨간 강조.
  overflowSlideIndices?: number[];
  // 내 교회 PPT(custom 테마) 이미지 — custom 테마일 때 카드 배경으로 사용.
  customBgUrl?: string | null;
  // 커스텀 배경이 GIF(움직임)면 흰 글자·오버레이 없음 (실제 출력과 동일 규칙)
  customBgIsGif?: boolean;
  // 카드 클릭 시 — 그 슬라이드로 점프해 편집(모달 닫기는 부모가 처리). 없으면 클릭 비활성.
  onSelectSlide?: (index: number) => void;
};

export default function PreviewModal({
  open,
  onClose,
  text,
  pptTheme,
  songThemes = [],
  pptFont,
  pptVAlign,
  overflowSlideIndices = [],
  customBgUrl = null,
  customBgIsGif = false,
  onSelectSlide,
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

  // 헤더 표기용 슬라이드 수 (카드 렌더는 LivePreview가 자체 계산).
  const slideCount = buildSlidesFromText(text).length;

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
          <h2 className="h-display" style={{ margin: 0, fontSize: 22 }}>
            전체 미리보기
          </h2>
          <p className="caption" style={{ marginTop: 6, color: 'var(--ink-3)' }}>
            {slideCount}장 슬라이드 · {PPT_THEME_LABELS[pptTheme]} · {PPT_FONT_LABELS[pptFont]}
          </p>
          {/* 사용자 PC에 해당 한국 폰트가 없으면 PowerPoint가 기본 폰트로 대체해 달라 보일 수 있다. */}
          <p className="caption" style={{ marginTop: 4, color: 'var(--ink-3)', fontSize: 11.5 }}>
            ※ PowerPoint에서 글씨체가 달라 보이면 사용 PC에 해당 한국 폰트를 설치해 주세요.
          </p>
          {onSelectSlide && slideCount > 0 && (
            <p className="caption" style={{ marginTop: 4, color: 'var(--accent, #0f766e)', fontSize: 12, fontWeight: 600 }}>
              슬라이드를 누르면 편집 화면으로 돌아가 바로 고칠 수 있어요.
            </p>
          )}
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

        {/* 카드 격자 — 공용 부품에 위임 */}
        <LivePreview
          text={text}
          pptTheme={pptTheme}
          songThemes={songThemes}
          pptFont={pptFont}
          pptVAlign={pptVAlign}
          overflowSlideIndices={overflowSlideIndices}
          customBgUrl={customBgUrl}
          customBgIsGif={customBgIsGif}
          mode="grid"
          onCardClick={onSelectSlide}
        />
      </div>
    </div>
  );
}
