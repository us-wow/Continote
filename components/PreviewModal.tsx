'use client';

// PPT 전체 미리보기 모달 — 04 PPT 만들기의 "전체 미리보기" 버튼이 트리거.
// 슬라이드 배열을 그리드로 보여줘 사용자가 다운로드 전에 한눈에 검토할 수 있다.
//
// 실제 PPT 다운로드는 page.tsx 의 handleSavePptx 가 pptxgenjs 로 처리하고,
// 이 모달은 시각 검토 전용이라 종이 위에 인쇄된 듯한 단순 카드만 보여준다.

import { useEffect } from 'react';
import { buildSlidesFromText, type Slide } from '@/lib/text-doc';
import { PPT_FONT_LABELS, PPT_THEME_LABELS, validateSlide, type PptFont, type PptTheme, type PptVAlign } from '@/lib/pptx';

type PreviewModalProps = {
  open: boolean;
  onClose: () => void;
  text: string;
  pptTheme: PptTheme;
  pptFont: PptFont;
  // 세로 정렬 — 실제 PPT 출력과 동일하게 미리보기 카드 안 텍스트 위치를 위/가운데/아래로 맞춘다.
  pptVAlign: PptVAlign;
  // 4줄 한도를 넘는 슬라이드 인덱스 — 빨간 테두리 + "4줄 초과" 배지로 강조.
  // 사용자가 해당 슬라이드를 줄이면 부모가 새 indices를 넘기면서 빨간색 자동 풀림.
  overflowSlideIndices?: number[];
  // 내 교회 PPT(custom 테마) 이미지 — custom 테마일 때 카드 배경으로 사용.
  customBgUrl?: string | null;
  // 커스텀 배경이 GIF(움직임)면 흰 글자·오버레이 없음 (실제 출력과 동일 규칙)
  customBgIsGif?: boolean;
};

const THEME_BG: Record<PptTheme, string> = {
  // custom(내 교회 PPT)은 사용자가 올린 이미지로 런타임에 결정 — 여기 값은 이미지 없을 때 폴백.
  custom: '#FFFFFF',
  black: '#000000',
  white: '#FFFFFF',
  paper: '#FAF5EC',
  // 움직이는 홀리 7종 — GIF + 로드 전 폴백색(배경의 주조색). 미리보기 카드도 움직인다.
  light: "url('/pptx-bg-light.gif') center/cover, #04060D",
  dawn: "url('/pptx-bg-dawn.gif') center/cover, #1F0F20",
  serene: "url('/pptx-bg-serene.gif') center/cover, #0A142B",
  green: "url('/pptx-bg-green.gif') center/cover, #0A1F14",
  gold: "url('/pptx-bg-gold.gif') center/cover, #241804",
  pink: "url('/pptx-bg-pink.gif') center/cover, #260D1B",
  violet: "url('/pptx-bg-violet.gif') center/cover, #150E2E",
  wave: "url('/pptx-bg-wave.gif') center/cover, #060D1C",
  mist: "url('/pptx-bg-mist.gif') center/cover, #141B28",
  candle: "url('/pptx-bg-candle.gif') center/cover, #170E06",
  grace: "url('/pptx-bg-grace.gif') center/cover, #0E0A1E",
  aurora: "url('/pptx-bg-aurora.gif') center/cover, #050A18",
  crosslight: "url('/pptx-bg-crosslight.gif') center/cover, #0C0908",
  meadow: "url('/pptx-bg-meadow.jpg') center/cover, #B8D27A",
  cross: "url('/pptx-bg-cross.jpg') center/cover, #1a140e",
  bible: "url('/pptx-bg-bible.jpg') center/cover, #c19b6e",
  sunrise: "url('/pptx-bg-sunrise.jpg') center/cover, #E8C8A0",
  milkyway: "url('/pptx-bg-milkyway.jpg') center/cover, #060A14",
  godrays: "url('/pptx-bg-godrays.jpg') center/cover, #2A2418",
  wheat: "url('/pptx-bg-wheat.jpg') center/cover, #C89A50",
  sea: "url('/pptx-bg-sea.jpg') center/cover, #A8C4D8",
  flowers: "url('/pptx-bg-flowers.jpg') center/cover, #B89060",
};
const THEME_FG: Record<PptTheme, string> = {
  custom: '#1F1B16',
  black: '#FFFFFF',
  white: '#1F1B16',
  paper: '#1F1B16',
  // 움직이는 홀리 13종은 전부 어두운 배경 → 흰 글자 (lib/pptx.ts와 동일).
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
  cross: '#F4E8D2',
  bible: '#1F1B16',
  sunrise: '#1F1B16',
  milkyway: '#FFFFFF',
  godrays: '#1F1B16',
  wheat: '#1F1B16',
  sea: '#1F1B16',
  flowers: '#1F1B16',
};
// 실사 이미지 테마는 흰 반투명 오버레이 위에 검정 글자 (lib/pptx.ts 와 동일 규칙)
const THEME_OVERLAY: Partial<Record<PptTheme, string>> = {
  meadow: 'rgba(255,255,255,0.65)',
  cross: 'rgba(0,0,0,0.40)',
  bible: 'rgba(255,255,255,0.55)',
  sunrise: 'rgba(255,255,255,0.65)',
  godrays: 'rgba(255,255,255,0.65)',
  wheat: 'rgba(255,255,255,0.65)',
  sea: 'rgba(255,255,255,0.65)',
  flowers: 'rgba(255,255,255,0.65)',
  // 내 교회 PPT — 실제 출력(lib/pptx.ts overlay:true, 흰 65%)과 동일 톤
  custom: 'rgba(255,255,255,0.65)',
};

// 미리보기 글씨체를 실제 PPT 출력 폰트와 일치시킨다.
// 이전에는 4개 폰트 옵션을 단 2개 웹폰트(Noto Serif KR / Pretendard)로 뭉뚱그려 표시했는데,
// 그러면 사용자가 "나눔명조"를 골라도 미리보기에선 다른 폰트가 보였다.
// 각 옵션을 같은 이름의 웹폰트로 매핑하고, fallback도 같은 계열로 둔다.
// (앞단에서 layout.tsx가 해당 웹폰트들을 로드해야 시각적으로 일치)
const FONT_FAMILY_PREVIEW: Record<PptFont, string> = {
  'nanum-gothic': "'Nanum Gothic', 'Noto Sans KR', 'Pretendard Variable', sans-serif",
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
  pptVAlign,
  overflowSlideIndices = [],
  customBgUrl = null,
  customBgIsGif = false,
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
  const isCustomGif = pptTheme === 'custom' && customBgIsGif;
  // 커스텀 GIF는 어두운 배경 가정 → 오버레이 없이 흰 글자 (lib/pptx.ts와 동일 규칙)
  const overlay = isCustomGif ? undefined : THEME_OVERLAY[pptTheme];
  const themeFg = isCustomGif ? '#FFFFFF' : THEME_FG[pptTheme];
  // custom 테마면 사용자가 올린 이미지를 카드 배경으로 (실제 PPT 출력과 동일한 그림)
  const themeBg =
    pptTheme === 'custom' && customBgUrl
      ? `url('${customBgUrl}') center/cover, ${isCustomGif ? '#000000' : '#FFFFFF'}`
      : THEME_BG[pptTheme];
  // 세로 정렬값(top/middle/bottom)을 flexbox의 alignItems로 변환.
  // 카드 안 텍스트 박스는 flex(row)라 cross축(세로)을 alignItems가 제어한다 → top=위, bottom=아래.
  const vAlignItems =
    pptVAlign === 'top' ? 'flex-start' : pptVAlign === 'bottom' ? 'flex-end' : 'center';

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
                themeBg={themeBg}
                themeFg={themeFg}
                overlay={overlay}
                fontFamily={FONT_FAMILY_PREVIEW[pptFont]}
                vAlignItems={vAlignItems}
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
  vAlignItems,
}: {
  slide: Slide;
  index: number;
  isOverflow: boolean;
  themeBg: string;
  themeFg: string;
  overlay?: string;
  fontFamily: string;
  vAlignItems: 'flex-start' | 'center' | 'flex-end';
}) {
  // 실제 슬라이드(가로 13.333in ≈ 960px)와 같은 비율로 카드에 글씨를 그린다.
  // pt → cqw(카드 폭의 %) 환산. 카드가 커지든 작아지든 실제 PPT와 같은 글자/줄 배치가 유지된다.
  // 0.95는 폰트 미세 차이로 글자 한두 개가 줄을 이탈하지 않게 살짝 작게 잡는 안전 여유.
  const ptToCqw = (pt: number) => `${((pt / 960) * 95).toFixed(2)}cqw`;
  // 가사 슬라이드는 줄 수·줄 길이에 맞춰 자동 계산된 크기(lib/pptx.ts와 동일)를 그대로 비율 적용.
  const lyricFontSize =
    slide.kind === 'lyric' ? ptToCqw(validateSlide(slide).fontSize) : undefined;

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
          // 카드 폭을 cqw 단위 기준점으로 삼아 글씨를 실제 슬라이드 비율대로 축소한다.
          containerType: 'inline-size',
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
            // 세로 정렬 — 사용자가 고른 상단/가운데/하단을 그대로 반영 (실제 PPT valign과 일치).
            alignItems: vAlignItems,
            justifyContent: 'center',
            // 가로 여백을 카드 폭 비례(cqw)로 줘서, 실제 슬라이드의 텍스트 박스(전체 폭의 92.5%)와
            // 같은 비율을 유지한다 → 실제 PPT에서 한 줄에 들어가는 가사는 미리보기에서도 한 줄.
            padding: '12px 3.75cqw',
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
