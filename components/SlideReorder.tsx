'use client';

// 3번 콘티 편집 보조 — 슬라이드(빈 줄로 나뉜 묶음)를 카드로 보여주고
//   - ↑ / ↓ 로 순서 이동
//   - ✕ 로 하나씩 삭제 (확인창 없이 한 번에 — 사용자 요청)
// 모든 조작은 text를 재구성해 setText로 반영한다.
//
// 왜 setText만 부르면 되나: text가 단일 진실(single source of truth)이라,
// page.tsx의 자동 스냅샷 effect가 {songs, text} 변화를 감지해 undo 스택에 넣는다.
// → 여기서 별도 undo 연동을 안 해도 ✕ 삭제는 되돌리기로 복구된다.

import { useMemo, useState } from 'react';

type SlideReorderProps = {
  text: string;
  setText: (next: string) => void;
};

// 빈 줄(엔터 두 번) 기준으로 슬라이드 블록 분리 — text-doc의 buildSlidesFromText와 동일 규칙.
// 재구성을 위해 각 블록의 "원문 텍스트"를 그대로 보존한다.
function toBlocks(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((b) => b.replace(/^\n+|\n+$/g, '').trimEnd())
    .filter((b) => b.trim().length > 0);
}

// 블록 한 개의 종류·미리보기 — text-doc의 접두사 규칙(# 제목 / > 메모)과 동일하게 해석.
function describe(block: string): { kind: '제목' | '메모' | '가사'; cls: string; preview: string } {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  if (first.startsWith('# ')) return { kind: '제목', cls: 'kind-title', preview: first.slice(2) };
  if (first.startsWith('> '))
    return { kind: '메모', cls: 'kind-memo', preview: lines.map((l) => l.replace(/^>\s?/, '')).join(' ') };
  return { kind: '가사', cls: 'kind-lyric', preview: lines.join(' / ') };
}

export default function SlideReorder({ text, setText }: SlideReorderProps) {
  const [open, setOpen] = useState(false);
  const blocks = useMemo(() => toBlocks(text), [text]);

  // 블록 배열을 다시 text로 합쳐 반영 — 빈 줄 한 칸(\n\n)으로 구분(표준 형태).
  const apply = (next: string[]) => setText(next.join('\n\n'));

  // i번 블록을 위(-1)/아래(+1)로 한 칸 이동.
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    apply(next);
  };

  // i번 블록 삭제 (확인 없이 바로 — undo로 복구 가능).
  const remove = (i: number) => {
    apply(blocks.filter((_, k) => k !== i));
  };

  // 슬라이드가 없으면 아무것도 그리지 않음.
  if (blocks.length === 0) return null;

  return (
    <details
      className="slide-reorder"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="slide-reorder-summary">
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 160ms',
            marginRight: 6,
          }}
        >
          ▾
        </span>
        🔀 슬라이드 순서·삭제 <span className="mono slide-reorder-count">({blocks.length}장)</span>
      </summary>

      <ul className="slide-reorder-list">
        {blocks.map((block, i) => {
          const { kind, cls, preview } = describe(block);
          return (
            <li key={i} className="slide-reorder-item">
              <span className="slide-reorder-num">{i + 1}</span>
              <span className={`slide-reorder-kind ${cls}`}>{kind}</span>
              <span className="slide-reorder-preview">{preview || '(빈 슬라이드)'}</span>
              <span className="slide-reorder-acts">
                <button
                  type="button"
                  className="slide-reorder-btn"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`${i + 1}번 슬라이드 위로`}
                  title="위로"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="slide-reorder-btn"
                  onClick={() => move(i, 1)}
                  disabled={i === blocks.length - 1}
                  aria-label={`${i + 1}번 슬라이드 아래로`}
                  title="아래로"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="slide-reorder-btn slide-reorder-del"
                  onClick={() => remove(i)}
                  aria-label={`${i + 1}번 슬라이드 삭제`}
                  title="이 슬라이드 삭제"
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
