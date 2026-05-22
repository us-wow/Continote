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

      <textarea
        ref={taRef}
        className="ed-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={PLACEHOLDER}
        spellCheck={false}
      />

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
