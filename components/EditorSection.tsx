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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  // 모바일용 — textarea를 컨텐츠 높이만큼 자동 늘림 + 자체 스크롤 끔.
  // 모바일은 페이지 전체 스크롤이 자연스러워 textarea 자체 스크롤 + transform 동기화가 깨진다.
  // 켜면 거터/번호/가사가 모두 페이지 흐름 안에서 같이 움직여 어긋남이 사라진다.
  autoResize?: boolean;
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
  autoResize = false,
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

  // textarea 시각 상수 — CSS의 .ed-textarea 값과 정확히 일치해야 fallback 계산이 어긋나지 않음.
  // 측정 실패 시 폴백으로만 사용. 평시엔 아래 mirror div 측정값을 우선.
  const LINE_HEIGHT = 28;
  const PADDING_TOP = 22;

  // ── 거터 정밀 위치 측정 ────────────────────────────────────────────────
  // 모바일 좁은 폭에서 한국어 한 줄이 wrap되어 2~3줄로 늘어나면 newline 기준 거터 계산이 어긋남.
  // 해결: textarea와 같은 CSS의 invisible "mirror div"에 동일 텍스트를 그대로 렌더하고,
  //       각 paragraph 시작에 invisible <span> 마커를 박아 그 마커의 offsetTop을 측정한다.
  //       이 값을 거터 번호의 top 위치로 사용하면 wrap이 발생해도 항상 가사 첫 줄과 정렬된다.
  const mirrorRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<number, HTMLSpanElement | null>>({});
  const [paragraphTops, setParagraphTops] = useState<Record<number, number>>({});

  const recomputeTops = useCallback(() => {
    const next: Record<number, number> = {};
    for (const p of paragraphInfo) {
      const marker = markerRefs.current[p.slideNum];
      if (marker) next[p.slideNum] = marker.offsetTop;
    }
    setParagraphTops(next);
  }, [paragraphInfo]);

  // text가 바뀐 직후(브라우저 paint 전)에 측정 — 거터 번호가 한 프레임 늦지 않도록.
  useLayoutEffect(() => {
    recomputeTops();
  }, [recomputeTops, text]);

  // 화면 회전·창 크기 변경 시 wrap 폭이 달라지므로 다시 측정.
  useEffect(() => {
    const onResize = () => recomputeTops();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [recomputeTops]);

  // autoResize 모드 — textarea 높이를 컨텐츠에 맞춰 동적으로. 페이지 스크롤로 통일된다.
  // text 변경마다 scrollHeight를 기준으로 height를 재설정. 'auto'로 한 번 줄였다가 재측정하는 게
  // 라인이 줄어들 때도 함께 줄어들게 하는 흔한 트릭.
  useLayoutEffect(() => {
    if (!autoResize) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text, autoResize]);

  // mirror div에 textarea와 "정확히 똑같은 텍스트"를 한 줄씩 그린다.
  // 각 줄 뒤에 항상 '\n'을 붙이고(마지막 줄 제외), paragraph 첫 줄 앞에만 0×0 invisible 마커를 끼운다.
  //
  // ⚠️ 과거 버그(거터 번호 누적 드리프트): 예전엔 paragraph 본문을 join('\n')으로 한 덩어리로 묶고
  //    빈 줄만 따로 '\n'으로 출력했는데, 그러면 paragraph 마지막 줄의 줄바꿈 하나가 빠져
  //    mirror가 textarea보다 paragraph마다 한 줄씩 짧아졌다 → 아래로 갈수록 측정 위치가 위로 밀림.
  //    이제 textarea와 1:1로 줄을 재현해서 어긋남이 생기지 않는다.
  const mirrorNodes = useMemo(() => {
    const nodes: React.ReactNode[] = [];
    const allLines = text.split('\n');
    let slideNum = 0;
    let prevBlank = true; // 직전 줄이 빈 줄이었는지 — false→비어있다가 채워지는 순간이 paragraph 시작
    allLines.forEach((line, idx) => {
      const isBlank = line.trim() === '';
      // 빈 줄 다음(또는 맨 처음)에 오는 첫 글자 줄 = 새 슬라이드 시작 → 그 줄 앞에 마커.
      if (!isBlank && prevBlank) {
        slideNum++;
        const thisNum = slideNum;
        nodes.push(
          <span
            key={`marker-${thisNum}`}
            ref={(el) => {
              markerRefs.current[thisNum] = el;
            }}
            data-slide-num={thisNum}
            style={{
              display: 'inline-block',
              width: 0,
              height: 0,
              verticalAlign: 'top',
            }}
          />
        );
      }
      nodes.push(line);
      // 마지막 줄을 제외하고 모든 줄 뒤에 줄바꿈 — textarea 원본과 글자 단위로 동일하게.
      if (idx < allLines.length - 1) nodes.push('\n');
      prevBlank = isBlank;
    });
    return nodes;
  }, [text]);

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

      <div className={`ed-textarea-wrap ${autoResize ? 'is-auto-resize' : ''}`}>
        {/* 좌측 거터 — paragraph(슬라이드) 시작 위치에 번호 표시. mirror div 측정값을 우선 사용.
            autoResize면 페이지 스크롤로 통일되어 transform 동기화 불필요(오히려 잘못 적용되면 어긋남). */}
        <div className="ed-gutter" aria-hidden="true">
          <div
            className="ed-gutter-inner"
            style={{ transform: autoResize ? 'none' : `translateY(${-scrollTop}px)` }}
          >
            {paragraphInfo.map((p) => {
              const isOverflow = overflowSlideIndices.includes(p.slideNum - 1);
              // 측정값(paragraphTops)이 있으면 그걸, 없으면 newline 기반 폴백.
              const top =
                paragraphTops[p.slideNum] ?? PADDING_TOP + p.startLine * LINE_HEIGHT;
              return (
                <div
                  key={p.slideNum}
                  className={`ed-gutter-num ${isOverflow ? 'is-overflow' : ''}`}
                  style={{ top }}
                  title={isOverflow ? `${p.slideNum}번 슬라이드 4줄 초과` : `${p.slideNum}번 슬라이드`}
                >
                  {p.slideNum}
                </div>
              );
            })}
          </div>
        </div>
        {/* 거터 정밀 측정용 invisible mirror — textarea와 같은 영역에 같은 폰트/패딩으로 렌더.
            paragraph 시작 마커의 offsetTop이 거터 번호 위치로 사용된다. */}
        <div ref={mirrorRef} className="ed-mirror" aria-hidden="true">
          {mirrorNodes}
          {/* 마지막에 공백 한 줄 — wrap 측정이 안 잘리도록 */}
          {'​'}
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
          // autoResize면 자체 스크롤 끄고(페이지로 통일) 사용자 resize도 차단.
          style={autoResize ? { overflow: 'hidden', resize: 'none' } : undefined}
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
