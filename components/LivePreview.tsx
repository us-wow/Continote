'use client';

// 실시간 슬라이드 미리보기 — 재사용 부품(SSOT).
//
// 한 곳에서 슬라이드 카드를 그리고, 세 가지 모드로 쓴다:
//   - 'single' : 한 장만 크게 (데스크탑 우측·모바일 하단 독 — 커서가 있는 슬라이드)
//   - 'strip'  : 가로 스크롤 작은 카드들 (좁은 화면)
//   - 'grid'   : 격자 (전체 미리보기 모달)
//
// 시각(배경/글자색/오버레이/폰트)은 lib/slide-visual.ts, 글씨 크기는 lib/pptx.ts(곡 단위 통일)에서 가져온다.
// → "미리보기 = 실제 PPT 출력" 이 깨지지 않게 한 부품만 고치면 데스크탑·모바일·모달이 동시에 맞는다.

import { useMemo } from 'react';
import { buildSlidesFromText, type Slide } from '@/lib/text-doc';
import { computeUniformLyricSizes, type PptFont, type PptTheme, type PptVAlign } from '@/lib/pptx';
import { themeVisual, vAlignToFlex, vAlignVPad, ptToCqw, FONT_FAMILY_PREVIEW } from '@/lib/slide-visual';

export type LivePreviewMode = 'single' | 'strip' | 'grid';

type LivePreviewProps = {
  text: string;
  pptTheme: PptTheme;
  // 곡별 배경(유료) — 곡 순번별 테마. 없으면 해당 곡은 pptTheme.
  songThemes?: (PptTheme | undefined)[];
  pptFont: PptFont;
  pptVAlign: PptVAlign;
  // 4줄 초과 슬라이드 인덱스(0-base) — 빨간 강조.
  overflowSlideIndices?: number[];
  customBgUrl?: string | null;
  customBgIsGif?: boolean;
  mode: LivePreviewMode;
  // single 모드에서 크게 보여줄 슬라이드 인덱스(0-base). 범위를 벗어나면 자동으로 맞춘다.
  activeSlideIndex?: number;
  // grid 모드에서 카드 클릭 시 호출(전체 보기 → 그 슬라이드로 점프해 편집). 없으면 클릭 비활성.
  onCardClick?: (index: number) => void;
};

export default function LivePreview({
  text,
  pptTheme,
  songThemes,
  pptFont,
  pptVAlign,
  overflowSlideIndices = [],
  customBgUrl = null,
  customBgIsGif = false,
  mode,
  activeSlideIndex = 0,
  onCardClick,
}: LivePreviewProps) {
  // 슬라이드·글씨크기는 text가 바뀔 때만 다시 계산(매 렌더 재계산 방지).
  const slides = useMemo(() => buildSlidesFromText(text), [text]);
  const lyricSizes = useMemo(() => computeUniformLyricSizes(slides), [slides]);

  // 슬라이드별 테마 해석 — 곡(제목) 순번을 세어 곡별 배경을 반영(lib/pptx.ts와 동일 규칙).
  const perSlideTheme = useMemo(() => {
    let songIndex = -1;
    return slides.map((s) => {
      if (s.kind === 'title') songIndex++;
      return (songIndex >= 0 && songThemes?.[songIndex]) || pptTheme;
    });
  }, [slides, songThemes, pptTheme]);

  const vAlignItems = vAlignToFlex(pptVAlign);
  const fontFamily = FONT_FAMILY_PREVIEW[pptFont];

  if (slides.length === 0) {
    return (
      <div className="lp-empty" style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
        아직 슬라이드가 없어요. 콘티를 입력하면 여기에 바로 보여요.
      </div>
    );
  }

  // 한 장 카드를 그리는 헬퍼 (모드 공통).
  const renderCard = (slide: Slide, i: number) => {
    const v = themeVisual(perSlideTheme[i], customBgUrl, customBgIsGif);
    return (
      <SlidePreview
        key={i}
        slide={slide}
        index={i + 1}
        isOverflow={overflowSlideIndices.includes(i)}
        themeBg={v.bg}
        themeFg={v.fg}
        overlay={v.overlay}
        lyricFontPt={lyricSizes[i]}
        fontFamily={fontFamily}
        vAlignItems={vAlignItems}
      />
    );
  };

  if (mode === 'single') {
    // 범위를 벗어난 인덱스는 0~마지막으로 맞춘다(커서가 텍스트 끝/밖에 있어도 안전).
    const idx = Math.max(0, Math.min(activeSlideIndex, slides.length - 1));
    return <div className="lp-single">{renderCard(slides[idx], idx)}</div>;
  }

  if (mode === 'strip') {
    return (
      <div
        className="lp-strip"
        style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, scrollSnapType: 'x proximity' }}
      >
        {slides.map((slide, i) => (
          <div key={i} style={{ flex: '0 0 160px', scrollSnapAlign: 'start' }}>
            {renderCard(slide, i)}
          </div>
        ))}
      </div>
    );
  }

  // mode === 'grid'
  return (
    <div
      className="lp-grid"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}
    >
      {slides.map((slide, i) =>
        onCardClick ? (
          // 클릭하면 그 슬라이드로 점프(전체 보기 닫고 편집). 버튼으로 감싸 접근성 확보.
          <button
            key={i}
            type="button"
            onClick={() => onCardClick(i)}
            title="이 슬라이드 편집하기"
            style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
          >
            {renderCard(slide, i)}
          </button>
        ) : (
          renderCard(slide, i)
        )
      )}
    </div>
  );
}

// 슬라이드 한 장 카드 — 실제 PPT(가로 13.333in ≈ 960px)와 같은 비율로 글씨를 그린다.
// (예전 PreviewModal 안에 있던 것을 그대로 옮김 — 동작 동일.)
// SlideStudio(슬라이드 목록 썸네일·편집 캔버스)에서도 재사용하므로 export 한다.
export function SlidePreview({
  slide,
  index,
  isOverflow,
  themeBg,
  themeFg,
  overlay,
  lyricFontPt,
  fontFamily,
  vAlignItems,
}: {
  slide: Slide;
  index: number;
  isOverflow: boolean;
  themeBg: string;
  themeFg: string;
  overlay?: string;
  // 가사 글씨 크기(pt) — 곡 단위로 통일된 값을 부모가 넘겨준다.
  lyricFontPt: number;
  fontFamily: string;
  vAlignItems: 'flex-start' | 'center' | 'flex-end';
}) {
  // 가사 슬라이드는 곡 단위로 통일된 크기를 그대로 비율 적용.
  const lyricFontSize = slide.kind === 'lyric' ? ptToCqw(lyricFontPt) : undefined;
  // 세로 정렬별 위/아래 여백 — '상단'은 위로, '하단'은 아래로 더 바짝(실제 PPT와 동일 비율).
  const vpad =
    vAlignItems === 'flex-start' ? vAlignVPad('top') : vAlignItems === 'flex-end' ? vAlignVPad('bottom') : vAlignVPad('middle');

  return (
    <figure style={{ margin: 0, position: 'relative' }}>
      {/* 좌상단 번호 뱃지 — overflow면 빨강, 평소엔 회색. */}
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
          border: isOverflow ? '2px solid var(--danger)' : '1px solid var(--rule)',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          fontFamily,
          // 카드 폭을 cqw 단위 기준점으로 삼아 글씨를 실제 슬라이드 비율대로 축소한다.
          containerType: 'inline-size',
          boxShadow: isOverflow ? '0 0 0 3px color-mix(in oklab, var(--danger) 20%, transparent)' : undefined,
        }}
      >
        {overlay && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: overlay }} />}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: vAlignItems,
            justifyContent: 'center',
            // 가로는 항상 3.75cqw(PPT 0.5in), 세로는 정렬에 따라 가장자리로 더 붙임(vAlignVPad).
            padding: `${vpad.top} 3.75cqw ${vpad.bottom}`,
            textAlign: 'center',
          }}
        >
          {slide.kind === 'title' ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: ptToCqw(60), lineHeight: 1.2 }}>{slide.title}</div>
              {slide.subtitle && (
                <div style={{ marginTop: '0.4em', fontSize: ptToCqw(28), opacity: 0.8 }}>{slide.subtitle}</div>
              )}
            </div>
          ) : slide.kind === 'memo' ? (
            <div style={{ fontStyle: 'italic', fontSize: ptToCqw(36), lineHeight: 1.4 }}>{slide.text}</div>
          ) : (
            <div style={{ fontSize: lyricFontSize, lineHeight: 1.4 }}>
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
