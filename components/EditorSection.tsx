'use client';

// 3번 영역 — 콘티 편집 (텍스트 단일 string 모델)
//
// 핵심 동작:
//   - 빈 줄(Enter 두 번)이 슬라이드 구분
//   - "# 제목"  → 제목 슬라이드
//   - "> 메모"  → 메모 슬라이드
//   - 백스페이스로 빈 줄 지우면 자동 합쳐짐 (textarea 기본 동작)
//
// 02 추출된 곡에서 섹션 칩을 누르면 `conti:append` 커스텀 이벤트를 받아
// chunk를 본문에 이어 붙인다. 이때 페이지 스크롤이 튀지 않도록
// window.scrollY를 저장 → setText 호출 → requestAnimationFrame x2로 복원한다.
// (PRD "고정" 사항 #6)
//
// 푸터엔 텍스트 1차 출구(TXT / DOCX / 클립보드). PPT는 04 PptSection에 별도.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSlidesFromText } from '@/lib/text-doc';

type EditorSectionProps = {
  text: string;
  // 함수형 업데이트를 지원해야 conti:append가 stale closure 없이 누적 동작.
  // ExtractedSection chip을 여러 번 클릭하면 텍스트가 이어서 들어가야 함.
  setText: (next: string | ((prev: string) => string)) => void;
  onClear: () => void;
  // 다운로드/복사 핸들러 — 실제 구현은 page.tsx 가 보유한 헬퍼(handleSaveTxt 등)를 주입
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadDocx: () => void;
  // 4줄 한도 넘는 슬라이드 인덱스 — footer에 빨간 경고 표시.
  // 해당 슬라이드를 사용자가 줄이면 자동으로 비워져 빨간색 사라짐.
  overflowSlideIndices?: number[];
  // 진행 중인지(저장 등으로 잠시 잠금) — 옵션
  busy?: boolean;
};

const PLACEHOLDER = `여기에 가사를 직접 입력하거나, 왼쪽 곡 카드의 섹션을 눌러주세요.

빈 줄로 슬라이드를 구분합니다.
한 슬라이드 안에서는 줄바꿈만 하면 됩니다.

[# 제목]을 적으면 제목 슬라이드,
[> 메모]를 적으면 메모 슬라이드가 됩니다.`;

export default function EditorSection({
  text,
  setText,
  onClear,
  onCopy,
  onDownloadTxt,
  onDownloadDocx,
  overflowSlideIndices = [],
  busy = false,
}: EditorSectionProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 02 → 03 chunk append 이벤트 수신.
  // page.tsx에서 dispatchEvent(new CustomEvent('conti:append', { detail: { chunk } })) 호출.
  // 함수형 setText로 stale closure 회피 — chip을 여러 번 누르면 누적되어야 함.
  useEffect(() => {
    const onAppend = (e: Event) => {
      const ce = e as CustomEvent<{ chunk: string }>;
      const chunk = ce.detail?.chunk;
      if (!chunk) return;

      const savedScrollY = window.scrollY;
      const ta = taRef.current;

      // 함수형 업데이트 — prev가 항상 최신 text. 빈 줄로 paragraph 분리하며 이어붙임.
      setText((prev) =>
        prev && prev.trim() ? prev.replace(/\n+$/, '') + '\n\n' + chunk : chunk
      );

      // 페이지 스크롤 튀지 않게 두 프레임에 걸쳐 복원.
      requestAnimationFrame(() => {
        window.scrollTo({ top: savedScrollY });
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedScrollY });
          if (ta) ta.scrollTop = ta.scrollHeight;
        });
      });
    };
    window.addEventListener('conti:append', onAppend as EventListener);
    return () => window.removeEventListener('conti:append', onAppend as EventListener);
  }, [setText]);

  // Tab 키를 textarea에 그대로 넣기 (들여쓰기 2칸) — 기본 동작은 포커스 이동
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const next = text.slice(0, start) + '  ' + text.slice(end);
      setText(next);
      setTimeout(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      }, 0);
    }
  };

  // 슬라이드 카운트 — 푸터 좌측에 표시
  const slideCount = useMemo(() => buildSlidesFromText(text).length, [text]);
  const isEmpty = !text || !text.trim();

  // textarea 좌측 gutter에 표시할 슬라이드 번호 정보 계산.
  // text를 줄 단위로 훑으며 빈 줄을 paragraph 경계로 보고, 각 paragraph(=슬라이드)의
  // 첫 줄 line index(0-based)와 슬라이드 번호(1-based)를 기록한다.
  // overflowSlideIndices(0-based)와 매칭해 4줄 초과 paragraph는 gutter에서 빨강으로 표시.
  const paragraphInfo = useMemo(() => {
    const result: { slideNum: number; startLine: number }[] = [];
    let slideNum = 0;
    let inParagraph = false;
    let paraStart = 0;
    let hasContent = false;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (line.trim() === '') {
        // 빈 줄 — 진행 중이던 paragraph가 있다면 종료
        if (inParagraph && hasContent) {
          slideNum++;
          result.push({ slideNum, startLine: paraStart });
        }
        inParagraph = false;
        hasContent = false;
      } else {
        if (!inParagraph) {
          paraStart = i;
          inParagraph = true;
        }
        hasContent = true;
      }
    });
    // 텍스트 마지막에 빈 줄이 없을 경우의 마지막 paragraph
    if (inParagraph && hasContent) {
      slideNum++;
      result.push({ slideNum, startLine: paraStart });
    }
    return result;
  }, [text]);

  // textarea 스크롤과 gutter를 동기화 — 사용자가 스크롤 내릴 때 번호도 같이 따라감.
  const [scrollTop, setScrollTop] = useState(0);
  const onScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  // textarea 시각 상수 — CSS의 .ed-textarea 값과 정확히 일치해야 gutter 번호가 어긋나지 않음.
  // 한국어 줄 wrap이 일어나는 경우 newline 기반 계산이라 살짝 어긋날 수 있으나,
  // 사용자가 "11번 슬라이드"를 대략 찾을 수 있는 정도면 충분.
  const LINE_HEIGHT = 28;
  const PADDING_TOP = 22;

  return (
    <aside className="panel ed-panel" aria-labelledby="editor-h">
      <header className="ed-head">
        <div className="ed-head-left">
          <span className="step-num-inline">03</span>
          <h2 id="editor-h" className="ed-head-title">콘티 편집</h2>
        </div>
        <div className="ed-head-actions">
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onClear}
            disabled={isEmpty || busy}
            title="콘티 전체 비우기"
          >
            전체 비우기
          </button>
        </div>
      </header>

      <div className="ed-textarea-wrap">
        {/* 좌측 거터 — 각 paragraph(슬라이드) 시작 위치에 번호 절대 배치. 스크롤은 transform으로 따라감. */}
        <div className="ed-gutter" aria-hidden="true">
          <div
            className="ed-gutter-inner"
            style={{ transform: `translateY(${-scrollTop}px)` }}
          >
            {paragraphInfo.map((p) => {
              const isOverflow = overflowSlideIndices.includes(p.slideNum - 1);
              return (
                <div
                  key={p.slideNum}
                  className={`ed-gutter-num ${isOverflow ? 'is-overflow' : ''}`}
                  style={{ top: PADDING_TOP + p.startLine * LINE_HEIGHT }}
                  title={isOverflow ? `${p.slideNum}번 슬라이드 4줄 초과` : `${p.slideNum}번 슬라이드`}
                >
                  {p.slideNum}
                </div>
              );
            })}
          </div>
        </div>
        <textarea
          ref={taRef}
          className="ed-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={onScroll}
          placeholder={PLACEHOLDER}
          spellCheck={false}
        />
      </div>

      <footer className="ed-foot">
        <div className="ed-foot-meta mono">
          {isEmpty ? '비어있음' : `${slideCount}장 슬라이드`}
          {overflowSlideIndices.length > 0 && (
            <span className="ed-foot-warn">
              ⚠ {overflowSlideIndices.map((i) => i + 1).join(', ')}번 4줄 초과
            </span>
          )}
        </div>
        <div className="ed-foot-actions">
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onCopy}
            disabled={isEmpty || busy}
            title="콘티 전체 텍스트 복사"
          >
            📋 클립보드
          </button>
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onDownloadTxt}
            disabled={isEmpty || busy}
            title="텍스트 파일로 저장"
          >
            📄 TXT
          </button>
          <button
            type="button"
            className="btn btn-text btn-sm"
            onClick={onDownloadDocx}
            disabled={isEmpty || busy}
            title="Word 문서로 저장"
          >
            📝 DOCX
          </button>
        </div>
      </footer>
    </aside>
  );
}
