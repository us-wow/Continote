'use client';

// 모바일 하단 sticky 실시간 슬라이드 미리보기 독.
//
// 콘티(text)를 입력/편집하는 동안 화면 아래에 16:9 슬라이드 한 장이 실시간으로 떠 있어서,
// 지금 커서가 놓인 슬라이드가 PPT로 어떻게 나올지 바로 확인할 수 있게 한다.
//
// 설계 원칙(다른 에이전트·SSOT와의 약속):
//   - 미리보기 그림은 전부 LivePreview(mode='single') 한 부품으로만 그린다.
//   - 도구바는 "빠른 칩만" — 자주 바꾸는 배경/글씨체만 단축으로 둔다.
//     전체 테마·폰트·커스텀 배경의 진짜 주인(SSOT)은 m-sec-4 PptSection이다.
//   - 최종 PPT 다운로드는 여기 두지 않는다(sec-4에 유지). 여기엔 TXT/복사 단축만.
//   - 전역 CSS를 건드리면 안 되므로(globals.css는 다른 에이전트 담당) 스타일은 전부 인라인.
//   - EditorSection의 textarea autoResize/거터 동기화를 깨지 않으려고
//     이 독은 EditorSection 바깥 형제 요소(fixed 오버레이)로만 존재한다.

import { useLayoutEffect, useRef, useState } from 'react';
import LivePreview from '@/components/LivePreview';
import { buildSlidesFromText } from '@/lib/text-doc';
import type { PptFont, PptTheme, PptVAlign } from '@/lib/pptx';

type PreviewDockProps = {
  text: string;
  // 전체 테마/폰트의 SSOT는 sec-4지만, 독에선 "빠른 칩"으로 자주 쓰는 값만 단축 변경한다.
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  songThemes?: (PptTheme | undefined)[];
  pptVAlign: PptVAlign;
  // 커스텀 배경 — sec-4에서 올린 것을 미리보기에 그대로 반영(독에서 바꾸진 않음).
  customBg: { src: string; kind: 'image' | 'gif' } | null;
  overflowSlideIndices?: number[];
  // 지금 커서가 놓인 슬라이드 인덱스(0-base). 페이지가 caret으로 계산해 넘겨준다.
  activeSlideIndex: number;
  onCopy: () => void;
  onDownloadTxt: () => void;
  // [⤢ 전체] — 전체 미리보기 모달(PreviewModal)을 연다.
  onOpenFull: () => void;
  // 독의 실제 높이(px)를 부모로 보고 — 부모가 m-main 하단 여백을 딱 맞게 줘서 마지막 콘텐츠가 안 가리게.
  // 독이 숨으면(텍스트 없음) 0을 보고.
  onHeightChange?: (height: number) => void;
};

// 배경 빠른 칩 — 자주 쓰는 3종만. 라벨은 짧게(검정/흰색/종이).
const BG_CHIPS: { theme: PptTheme; label: string }[] = [
  { theme: 'black', label: '검정' },
  { theme: 'white', label: '흰색' },
  { theme: 'paper', label: '종이' },
];

// 글씨체 빠른 칩 — 한국 교회에서 가장 많이 쓰는 3종.
const FONT_CHIPS: { font: PptFont; label: string }[] = [
  { font: 'nanum-gothic', label: '나눔고딕' },
  { font: 'nanum-myeongjo', label: '나눔명조' },
  { font: 'noto-serif-kr', label: '본명조' },
];

export default function PreviewDock({
  text,
  pptTheme,
  setPptTheme,
  pptFont,
  setPptFont,
  songThemes,
  pptVAlign,
  customBg,
  overflowSlideIndices = [],
  activeSlideIndex,
  onCopy,
  onDownloadTxt,
  onOpenFull,
  onHeightChange,
}: PreviewDockProps) {
  // 접기/펼치기 — 키보드가 올라오거나 공간이 부족할 때 페이저+1줄만 남기고 접는다.
  const [collapsed, setCollapsed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 슬라이드 총개수 — 페이저(◀ n/N ▶) 표시·범위 계산용.
  // text가 비면 0이고, 이때는 독 자체를 숨긴다(아래 가드).
  const slideCount = buildSlidesFromText(text).length;
  const hidden = !text.trim() || slideCount === 0;

  // 독의 실제 높이를 매 렌더 측정해 부모로 보고 → 부모가 m-main 하단 여백을 정확히 맞춘다.
  // (접기/펼치기·내용 변화로 높이가 바뀌면 자동 반영. 숨은 상태면 0.)
  // 훅은 early-return보다 위에 있어야 하므로 hidden 분기를 effect 안에서 처리한다.
  useLayoutEffect(() => {
    onHeightChange?.(hidden ? 0 : rootRef.current?.offsetHeight ?? 0);
  });

  // text가 비어 있으면(슬라이드 0개) 독을 통째로 숨긴다 — 빈 화면을 가리지 않게.
  if (hidden) return null;

  // 표시용 현재 인덱스 — activeSlideIndex가 범위를 벗어나도 1~N 안으로 잡아준다.
  const safeIndex = Math.max(0, Math.min(activeSlideIndex, slideCount - 1));

  return (
    <div
      ref={rootRef}
      // fixed bottom — 페이지 스크롤과 무관하게 화면 하단에 항상 떠 있음.
      // EditorSection 바깥 형제라 textarea 거터/autoResize에 영향 없음.
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: 'var(--surface, #fff)',
        borderTop: '1px solid var(--rule)',
        boxShadow: '0 -6px 20px rgba(0,0,0,0.10)',
        // 아이폰 홈바 안전영역만큼 아래 여백 확보.
        padding: '8px 10px calc(8px + env(safe-area-inset-bottom))',
        // 데스크탑 폭에선 가운데 정렬(모바일 전용이지만 넓은 화면 대비).
        maxWidth: 720,
        margin: '0 auto',
      }}
      role="region"
      aria-label="실시간 슬라이드 미리보기"
    >
      {/* ===== 상단 줄: 페이저 + 접기/펼치기 ===== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: collapsed ? 0 : 8,
        }}
      >
        {/* 페이저 — ◀ n/N ▶. 어느 슬라이드를 보는지 알려준다(읽기 전용 표시). */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}
          aria-label={`슬라이드 ${safeIndex + 1} / ${slideCount}`}
        >
          <span aria-hidden="true">◀</span>
          <span className="mono" style={{ fontWeight: 700 }}>
            {safeIndex + 1} / {slideCount}
          </span>
          <span aria-hidden="true">▶</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* [⤢ 전체] — 전체 미리보기 모달 열기 */}
          <button
            type="button"
            onClick={onOpenFull}
            aria-label="전체 미리보기 열기"
            style={dockBtnStyle}
          >
            ⤢ 전체
          </button>
          {/* 접기/펼치기 토글 — 키보드/공간 방해 시 페이저+1줄로 줄인다 */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? '미리보기 펼치기' : '미리보기 접기'}
            aria-expanded={!collapsed}
            style={dockBtnStyle}
          >
            {collapsed ? '▲ 펼치기' : '▼ 접기'}
          </button>
        </div>
      </div>

      {/* ===== 펼친 상태에서만: 16:9 미리보기 + 미니 도구바 ===== */}
      {!collapsed && (
        <>
          {/* 16:9 슬라이드 한 장 — LivePreview single 모드. 커서가 놓인 슬라이드를 따라간다.
              큰 폰/가로 화면에서 카드가 화면을 다 먹지 않게 높이를 캡(목표 높이로 폭을 역산). */}
          <div style={{ marginBottom: 8, width: 'min(100%, calc(30vh * 16 / 9))', marginLeft: 'auto', marginRight: 'auto' }}>
            <LivePreview
              text={text}
              pptTheme={pptTheme}
              songThemes={songThemes}
              pptFont={pptFont}
              pptVAlign={pptVAlign}
              overflowSlideIndices={overflowSlideIndices}
              customBgUrl={customBg?.src ?? null}
              customBgIsGif={customBg?.kind === 'gif'}
              mode="single"
              activeSlideIndex={safeIndex}
            />
          </div>

          {/* ===== 미니 도구바 — 빠른 칩만 ===== */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {/* 배경 칩 — 누르면 setPptTheme 단축(전체 테마의 SSOT는 sec-4) */}
            <span style={chipGroupLabel}>배경</span>
            {BG_CHIPS.map((c) => (
              <button
                key={c.theme}
                type="button"
                onClick={() => setPptTheme(c.theme)}
                aria-pressed={pptTheme === c.theme}
                style={chipStyle(pptTheme === c.theme)}
              >
                {c.label}
              </button>
            ))}

            <span style={{ width: 1, height: 18, background: 'var(--rule)', margin: '0 2px' }} aria-hidden="true" />

            {/* 글씨체 칩 — 누르면 setPptFont 단축 */}
            <span style={chipGroupLabel}>글씨체</span>
            {FONT_CHIPS.map((c) => (
              <button
                key={c.font}
                type="button"
                onClick={() => setPptFont(c.font)}
                aria-pressed={pptFont === c.font}
                style={chipStyle(pptFont === c.font)}
              >
                {c.label}
              </button>
            ))}

            {/* 오른쪽 끝으로 밀어내는 스페이서 */}
            <span style={{ flex: 1 }} aria-hidden="true" />

            {/* TXT 다운로드 / 클립보드 복사 — 페이지의 기존 핸들러 재사용 */}
            <button type="button" onClick={onDownloadTxt} aria-label="TXT 다운로드" style={dockBtnStyle}>
              TXT⬇
            </button>
            <button type="button" onClick={onCopy} aria-label="클립보드 복사" style={dockBtnStyle}>
              📋
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ───────── 인라인 스타일 헬퍼 (전역 CSS 안 건드림) ─────────

// 도구바 버튼 공통 스타일
const dockBtnStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid var(--rule)',
  background: 'var(--surface, #fff)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontSize: 13,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
};

// 칩 묶음 라벨(배경/글씨체)
const chipGroupLabel: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--ink-3)',
  whiteSpace: 'nowrap',
};

// 빠른 칩 — 선택 상태면 강조(테두리/배경 진하게).
function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 9px',
    borderRadius: 999,
    border: active ? '1.5px solid var(--accent, #1f1b16)' : '1px solid var(--rule)',
    background: active ? 'var(--accent, #1f1b16)' : 'var(--surface, #fff)',
    color: active ? '#fff' : 'var(--ink-2)',
    cursor: 'pointer',
    fontSize: 12,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
    fontWeight: active ? 700 : 400,
  };
}
