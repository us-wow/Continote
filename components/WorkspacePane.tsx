'use client';

// 워크스페이스 — 데스크탑 콘티 편집을 "좌 에디터 | 우 실시간 슬라이드" 한 화면으로 묶는 부품.
//
// 왜 이 컴포넌트가 따로 있나:
//   - EditorSection(편집)과 LivePreview(미리보기)는 각각 독립 부품이지만,
//     "지금 커서가 있는 슬라이드를 우측에 크게 보여준다"는 연결 로직이 필요하다.
//   - 그 연결(커서 → 슬라이드 번호)과 빠른 도구바(배경/글씨체 칩)를 한 곳에 모아
//     page.tsx가 복잡해지지 않게 한다.
//
// 설계 메모(채팅에서 확정한 규칙):
//   - 도구바 칩은 "빠른 단축"일 뿐. 진짜 설정 출처(SSOT)는 04 PptSection이다.
//     칩을 눌러도 같은 state(setPptTheme/setPptFont)를 바꾸는 것이라 둘이 항상 동기화된다.
//   - PPT 다운로드 버튼은 여기 두지 않는다(04에 있음). 여기엔 TXT/클립보드 출구만.
//   - 화면이 좁으면(<1180px) 우측 미리보기를 에디터 아래로 내려 'strip'(가로 작은 카드)으로 보여준다.

import { useEffect, useMemo, useState } from 'react';
import EditorSection from '@/components/EditorSection';
import LivePreview from '@/components/LivePreview';
import { buildSlidesFromText } from '@/lib/text-doc';
import type { PptFont, PptTheme, PptVAlign } from '@/lib/pptx';

// 커스텀 배경(유료) — page.tsx의 CustomBg와 같은 모양({src, kind}).
// LivePreview에는 src(주소)와 gif 여부로 풀어서 넘긴다.
type CustomBgLike = { src: string; kind: 'image' | 'gif' } | null;

type WorkspacePaneProps = {
  // ── EditorSection으로 그대로 흘려보낼 것들 ──
  text: string;
  setText: (next: string | ((prev: string) => string)) => void;
  onClear: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadDocx: () => void;
  overflowSlideIndices?: number[];

  // ── 미리보기 + 도구바 칩에 필요한 것들 ──
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  songThemes?: (PptTheme | undefined)[];
  pptVAlign: PptVAlign;
  customBg: CustomBgLike;

  // 전체 미리보기 모달 열기 — page.tsx의 setPreviewOpen(true)
  onOpenPreview: () => void;
};

// 도구바 "배경" 빠른 칩 — 검정/흰색/종이 3개만.
// (전체 26테마는 04 PptSection에 있으므로 여기선 가장 자주 쓰는 3개만 단축으로 제공)
const BG_CHIPS: { value: PptTheme; label: string }[] = [
  { value: 'black', label: '검정' },
  { value: 'white', label: '흰색' },
  { value: 'paper', label: '종이' },
];

// 도구바 "글씨체" 빠른 칩 — 나눔고딕/나눔명조/본명조 3개만.
const FONT_CHIPS: { value: PptFont; label: string }[] = [
  { value: 'nanum-gothic', label: '나눔고딕' },
  { value: 'nanum-myeongjo', label: '나눔명조' },
  { value: 'noto-serif-kr', label: '본명조' },
];

export default function WorkspacePane({
  text,
  setText,
  onClear,
  onCopy,
  onDownloadTxt,
  onDownloadDocx,
  overflowSlideIndices = [],
  pptTheme,
  setPptTheme,
  pptFont,
  setPptFont,
  songThemes,
  pptVAlign,
  customBg,
  onOpenPreview,
}: WorkspacePaneProps) {
  // 지금 커서가 있는(=우측에 크게 보여줄) 슬라이드 번호. 0-base.
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

  // 화면이 좁은지(<1180px) 여부. true면 우측 미리보기를 에디터 아래 strip으로 내린다.
  // 왜 state로 두나: 창 크기를 바꾸면 즉시 레이아웃이 바뀌어야 하므로 matchMedia 변화를 듣는다.
  const [isNarrow, setIsNarrow] = useState<boolean>(false);

  useEffect(() => {
    // SSR에는 window가 없으니 effect(브라우저에서만 실행) 안에서 matchMedia를 만든다.
    const mq = window.matchMedia('(max-width: 1180px)');
    const apply = () => setIsNarrow(mq.matches);
    apply(); // 처음 마운트 때 현재 폭 반영
    mq.addEventListener('change', apply); // 창 크기 바뀔 때마다 다시 반영
    return () => mq.removeEventListener('change', apply);
  }, []);

  // 전체 슬라이드 수 N — 페이저의 "n / N"에서 N. 미리보기와 같은 규칙으로 센다.
  const totalSlides = useMemo(() => buildSlidesFromText(text).length, [text]);

  // EditorSection이 현재 값 기준으로 환산해 넘긴 슬라이드 인덱스를 그대로 반영.
  const handleCaretChange = (slideIndex: number) => {
    setActiveSlideIndex(slideIndex);
  };

  // 활성 인덱스가 슬라이드 수보다 커지지 않게 안전하게 가둔다(글자를 지워 슬라이드가 줄어든 경우 등).
  const safeIndex = totalSlides > 0 ? Math.min(activeSlideIndex, totalSlides - 1) : 0;

  // 페이저 ◀ ▶ — 한 칸 앞뒤로. 0~(N-1) 범위를 벗어나지 않게 가둔다.
  const goPrev = () => setActiveSlideIndex((i) => Math.max(0, Math.min(i, totalSlides - 1) - 1));
  const goNext = () =>
    setActiveSlideIndex((i) => Math.min(totalSlides - 1, Math.min(i, totalSlides - 1) + 1));

  // LivePreview에 넘길 커스텀 배경 값 — {src, kind}를 src/gif여부로 풀어서.
  const customBgUrl = customBg?.src ?? null;
  const customBgIsGif = customBg?.kind === 'gif';

  return (
    <section className="ws-pane" aria-label="콘티 편집 작업 공간">
      {/* ── 상단 도구바: 배경 칩 + 글씨체 칩 + (우측) TXT/클립보드 ── */}
      <div className="ws-toolbar">
        <div className="ws-toolbar-chips">
          {/* 배경 빠른 칩 — 현재 pptTheme과 같으면 강조(is-active) */}
          <span className="ws-chip-label">배경</span>
          {BG_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`ws-chip ${pptTheme === chip.value ? 'is-active' : ''}`}
              onClick={() => setPptTheme(chip.value)}
              title={`배경: ${chip.label}`}
            >
              {chip.label}
            </button>
          ))}

          {/* 칩 묶음 사이 구분선 */}
          <span className="ws-toolbar-sep" aria-hidden="true" />

          {/* 글씨체 빠른 칩 — 현재 pptFont와 같으면 강조 */}
          <span className="ws-chip-label">글씨체</span>
          {FONT_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`ws-chip ${pptFont === chip.value ? 'is-active' : ''}`}
              onClick={() => setPptFont(chip.value)}
              title={`글씨체: ${chip.label}`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* 우측 텍스트 출구 — 기존 핸들러 그대로(handleSaveTxt / handleCopy) */}
        <div className="ws-toolbar-actions">
          <button type="button" className="btn btn-text btn-sm" onClick={onDownloadTxt} title="텍스트 파일로 저장">
            📄 TXT
          </button>
          <button type="button" className="btn btn-text btn-sm" onClick={onCopy} title="콘티 전체 텍스트 복사">
            📋
          </button>
        </div>
      </div>

      {/* ── 본문: 좌(에디터) | 우(미리보기). 좁으면 ws-body가 세로로 쌓이고 우측이 사라진다. ── */}
      <div className={`ws-body ${isNarrow ? 'is-narrow' : ''}`}>
        {/* 좌측 — 편집기. onCaretChange로 커서 위치를 받아 활성 슬라이드를 동기화. */}
        <div className="ws-editor">
          <EditorSection
            text={text}
            setText={setText}
            onClear={onClear}
            onCopy={onCopy}
            onDownloadTxt={onDownloadTxt}
            onDownloadDocx={onDownloadDocx}
            overflowSlideIndices={overflowSlideIndices}
            onCaretChange={handleCaretChange}
          />
        </div>

        {/* 우측 — 넓은 화면일 때만: 커서 슬라이드 1장 크게 + 페이저 + 전체 미리보기 버튼 */}
        {!isNarrow && (
          <div className="ws-preview">
            <LivePreview
              text={text}
              pptTheme={pptTheme}
              songThemes={songThemes}
              pptFont={pptFont}
              pptVAlign={pptVAlign}
              overflowSlideIndices={overflowSlideIndices}
              customBgUrl={customBgUrl}
              customBgIsGif={customBgIsGif}
              mode="single"
              activeSlideIndex={safeIndex}
            />

            {/* 페이저 — ◀ n/N ▶. 슬라이드가 있을 때만 보여준다. */}
            {totalSlides > 0 && (
              <div className="ws-pager">
                <button
                  type="button"
                  className="ws-pager-btn"
                  onClick={goPrev}
                  disabled={safeIndex <= 0}
                  aria-label="이전 슬라이드"
                >
                  ◀
                </button>
                <span className="ws-pager-count mono">
                  {safeIndex + 1} / {totalSlides}
                </span>
                <button
                  type="button"
                  className="ws-pager-btn"
                  onClick={goNext}
                  disabled={safeIndex >= totalSlides - 1}
                  aria-label="다음 슬라이드"
                >
                  ▶
                </button>
              </div>
            )}

            <button type="button" className="btn btn-text btn-sm ws-preview-all" onClick={onOpenPreview}>
              👁 전체 미리보기
            </button>
          </div>
        )}
      </div>

      {/* ── 좁은 화면 강하: 에디터 아래에 strip(가로 작은 카드들) ── */}
      {isNarrow && (
        <div className="ws-strip">
          <LivePreview
            text={text}
            pptTheme={pptTheme}
            songThemes={songThemes}
            pptFont={pptFont}
            pptVAlign={pptVAlign}
            overflowSlideIndices={overflowSlideIndices}
            customBgUrl={customBgUrl}
            customBgIsGif={customBgIsGif}
            mode="strip"
          />
          <button type="button" className="btn btn-text btn-sm ws-preview-all" onClick={onOpenPreview}>
            👁 전체 미리보기
          </button>
        </div>
      )}
    </section>
  );
}
