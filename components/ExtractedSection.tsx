'use client';

// 2번 영역 — 추출된 곡 (인라인 편집 + 새 섹션 추가)
//
// 핵심 동작 (PRD "고정" 사항 #2 #3):
//   - 곡 제목 클릭 → 인라인 input 편집 (Enter/blur로 저장, ESC로 취소)
//   - 세션 라벨 클릭 → 인라인 input 편집
//   - ✎ 아이콘 클릭 → textarea 편집 모드 (라벨 + 가사 통째 수정)
//   - 칩 본문 클릭 → 콘티에 chunk append (반복 가능 — 후렴 4번이면 4번 클릭)
//   - "+ 새 섹션 추가" → 6종 라벨 메뉴 → 빈 가사 새 카드 즉시 편집 모드
//   - 곡 카드 ✕ → 곡 단위 삭제 (confirm)
//
// AI 정확도 보완용. 사용자가 모든 부분을 직접 수정/추가할 수 있어야 함.

import { useEffect, useRef, useState } from 'react';
import type { Section, SectionType, Song } from '@/lib/types';
import { sectionToText, docHasSongTitle } from '@/lib/text-doc';
import Mascot from '@/components/Mascot';

type ExtractedSectionProps = {
  songs: Song[];
  text: string; // 현재 콘티 텍스트 — docHasSongTitle 판정용
  extracting: boolean;
  // 곡 단위 조작
  onUpdateSong: (idx: number, next: Song) => void;
  onRemoveSong: (idx: number) => void;
  // 맨 아래 "+ 새 곡 추가" — 빈 곡을 만들고 즉시 제목 편집 모드. 사용자가 직접 가사 입력하는 흐름.
  onAddEmptySong: () => void;
};

const SECTION_TYPE_OPTIONS: { type: SectionType; label: string }[] = [
  { type: 'verse', label: 'Verse' },
  { type: 'prechorus', label: 'Pre-Chorus' },
  { type: 'chorus', label: 'Chorus' },
  { type: 'bridge', label: 'Bridge' },
  { type: 'ending', label: 'Ending' },
  { type: 'intro', label: 'Intro' },
];

// chip 클릭 시 EditorSection이 받을 커스텀 이벤트 dispatch
function dispatchAppend(chunk: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('conti:append', { detail: { chunk } }));
}

export default function ExtractedSection({
  songs,
  text,
  extracting,
  onUpdateSong,
  onRemoveSong,
  onAddEmptySong,
}: ExtractedSectionProps) {
  const empty = songs.length === 0;

  return (
    <section className="panel ex-panel" aria-labelledby="extracted-h">
      <div className="section-head">
        <div className="left">
          <span className="step-num-inline">02</span>
          <h2 id="extracted-h">추출된 곡</h2>
        </div>
        <div className="right mono">
          {empty ? '0곡' : `${songs.length}곡 추출됨`}
        </div>
      </div>

      {extracting && empty && <ExtractingState />}
      {!extracting && empty && <EmptyExtracted />}
      {!empty && (
        <div className="ex-list">
          {songs.map((song, i) => (
            <SongCard
              key={i}
              song={song}
              songIdx={i}
              docText={text}
              onUpdate={(next) => onUpdateSong(i, next)}
              onRemove={() => onRemoveSong(i)}
            />
          ))}
        </div>
      )}

      {/* + 새 곡 추가 — 추출 없이 직접 가사 입력하는 진입점. 항상 표시(빈 상태에서도 노출). */}
      {!extracting && (
        <button
          type="button"
          className="btn-add-song"
          onClick={onAddEmptySong}
          aria-label="새 빈 곡 추가"
        >
          + 새 곡 추가
        </button>
      )}
    </section>
  );
}

function ExtractingState() {
  return (
    <div className="ex-extracting">
      <Mascot pose="reading" size={120} />
      <div style={{ textAlign: 'center' }}>
        <div className="ex-extracting-title">가사를 읽고 있어요</div>
        <div className="mono" style={{ fontSize: 12, marginTop: 3, color: 'var(--ink-3)' }}>
          OCR · 가사 정리 · 섹션 라벨링 중…
        </div>
      </div>
      <div className="ex-progress" aria-hidden="true">
        <div className="ex-progress-bar" />
      </div>
    </div>
  );
}

function EmptyExtracted() {
  return (
    <div className="ex-empty">
      <Mascot pose="idle" size={108} />
      <div className="ex-empty-text">
        왼쪽에 악보를 올리고 <strong>가사 추출하기</strong>를 누르면
        <br />여기에 곡 카드가 나타납니다.
      </div>
    </div>
  );
}

function SongCard({
  song,
  songIdx,
  docText,
  onUpdate,
  onRemove,
}: {
  song: Song;
  songIdx: number;
  docText: string;
  onUpdate: (next: Song) => void;
  onRemove: () => void;
}) {
  // 카드 접기/펼치기 — 기본 펼침
  const [open, setOpen] = useState(true);
  // 제목 인라인 편집
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(song.title);
  // "+ 새 섹션 추가" 메뉴 표시 여부
  const [showAddMenu, setShowAddMenu] = useState(false);

  // 외부 song.title이 바뀌면 draft도 동기화
  useEffect(() => {
    setTitleDraft(song.title);
  }, [song.title]);

  // 새 섹션 카드 ID 추적 — 추가 직후 자동으로 편집 모드 진입시키려고
  const [newSectionIdx, setNewSectionIdx] = useState<number | null>(null);

  const updateSection = (secIdx: number, patch: Partial<Section>) => {
    onUpdate({
      ...song,
      sections: song.sections.map((s, i) => (i === secIdx ? { ...s, ...patch } : s)),
    });
  };
  const deleteSection = (secIdx: number) => {
    if (!confirm('이 섹션을 삭제할까요?')) return;
    onUpdate({
      ...song,
      sections: song.sections.filter((_, i) => i !== secIdx),
    });
  };
  const addSection = (type: SectionType) => {
    const meta = SECTION_TYPE_OPTIONS.find((t) => t.type === type) || SECTION_TYPE_OPTIONS[0];
    const newSection: Section = {
      type,
      label: meta.label,
      verseNum: null,
      text: '',
    };
    onUpdate({ ...song, sections: [...song.sections, newSection] });
    setNewSectionIdx(song.sections.length); // 추가된 카드 인덱스 → 자동 편집 모드
    setShowAddMenu(false);
  };

  const saveTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== song.title) onUpdate({ ...song, title: t });
    setEditingTitle(false);
  };

  const handleDelete = () => {
    if (!confirm(`"${song.title}" 곡을 라이브러리에서 제거할까요?`)) return;
    onRemove();
  };

  return (
    <article className="song-card">
      <header className="song-card-head">
        <button
          type="button"
          className="song-toggle"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`${song.title} 펼치기`}
        >
          <span
            style={{
              display: 'inline-block',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 160ms',
            }}
          >
            ▾
          </span>
        </button>
        <div className="song-card-title-wrap">
          {editingTitle ? (
            <input
              className="song-card-title-input"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(song.title);
                  setEditingTitle(false);
                }
              }}
              autoFocus
            />
          ) : (
            <h3
              className="h-song song-card-title"
              onClick={() => setEditingTitle(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setEditingTitle(true);
                }
              }}
              title="제목 클릭해서 수정"
            >
              {song.title || 'Untitled'}
            </h3>
          )}
          <div className="song-card-meta mono">{song.sections.length}개 섹션</div>
        </div>
        <button
          type="button"
          className="btn btn-icon btn-sm song-title-edit"
          onClick={() => setEditingTitle(!editingTitle)}
          aria-label="제목 편집"
          title={editingTitle ? '저장' : '제목 편집'}
        >
          {editingTitle ? '✓' : '✎'}
        </button>
        <button
          type="button"
          className="btn btn-icon btn-sm song-remove"
          onClick={handleDelete}
          aria-label={`${song.title} 곡 제거`}
          title="곡 제거"
        >
          ✕
        </button>
      </header>

      {open && (
        <>
          <div className="song-sections">
            {song.sections.map((sec, secIdx) => (
              <SectionChipCard
                key={secIdx}
                section={sec}
                forceEdit={newSectionIdx === secIdx}
                onAdd={() => {
                  const includeTitle = !docHasSongTitle(docText, song.title);
                  dispatchAppend(sectionToText(song, sec, includeTitle));
                }}
                onUpdate={(patch) => {
                  updateSection(secIdx, patch);
                  if (newSectionIdx === secIdx) setNewSectionIdx(null);
                }}
                onDelete={() => deleteSection(secIdx)}
                onCancelNew={() => setNewSectionIdx(null)}
              />
            ))}
          </div>

          {/* + 새 섹션 추가 — AI가 놓친 섹션을 사용자가 직접 추가 */}
          <div className="song-add-section">
            {showAddMenu ? (
              <div className="sec-add-menu">
                <div className="sec-add-menu-head label">새 섹션 종류 선택</div>
                <div className="sec-add-menu-grid">
                  {SECTION_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.type}
                      type="button"
                      className={`sec-add-opt sec-${t.type}`}
                      onClick={() => addSection(t.type)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="sec-add-cancel"
                  onClick={() => setShowAddMenu(false)}
                >
                  취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn-add-section"
                onClick={() => setShowAddMenu(true)}
              >
                + 새 섹션 추가
              </button>
            )}
          </div>
        </>
      )}
    </article>
  );
}

function SectionChipCard({
  section,
  forceEdit,
  onAdd,
  onUpdate,
  onDelete,
  onCancelNew,
}: {
  section: Section;
  // 새로 추가된 카드면 자동으로 편집 모드 진입
  forceEdit: boolean;
  onAdd: () => void;
  onUpdate: (patch: Partial<Section>) => void;
  onDelete: () => void;
  onCancelNew: () => void;
}) {
  const [editing, setEditing] = useState(forceEdit);
  const [label, setLabel] = useState(section.label);
  const [linesText, setLinesText] = useState(section.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // section 외부 변경 시 draft 동기화
  useEffect(() => {
    setLabel(section.label);
    setLinesText(section.text);
  }, [section.label, section.text]);

  // forceEdit가 true가 되면 즉시 편집 모드
  useEffect(() => {
    if (forceEdit) setEditing(true);
  }, [forceEdit]);

  // textarea autosize — 가사 줄 수에 따라 높이 자동
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = Math.max(80, ta.scrollHeight) + 'px';
    }
  }, [editing, linesText]);

  const save = () => {
    onUpdate({
      label: label.trim() || section.label,
      text: linesText,
    });
    setEditing(false);
  };
  const cancel = () => {
    setLabel(section.label);
    setLinesText(section.text);
    setEditing(false);
    if (forceEdit) onCancelNew();
  };

  if (editing) {
    return (
      <div
        className={`sec-chip sec-chip-editing sec-${section.type}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sec-chip-head sec-chip-head-editing">
          <input
            className="sec-label-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="섹션 이름"
          />
          <div className="sec-edit-actions">
            <button
              type="button"
              className="sec-act sec-act-save"
              onClick={save}
              title="저장"
              aria-label="저장"
            >
              ✓
            </button>
            <button
              type="button"
              className="sec-act"
              onClick={cancel}
              title="취소"
              aria-label="취소"
            >
              ✕
            </button>
            <button
              type="button"
              className="sec-act sec-act-danger"
              onClick={onDelete}
              title="이 섹션 삭제"
              aria-label="삭제"
            >
              🗑
            </button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          className="sec-edit-textarea"
          value={linesText}
          onChange={(e) => setLinesText(e.target.value)}
          placeholder="가사 한 줄에 하나씩…"
          spellCheck={false}
          autoFocus
        />
        <div className="sec-edit-hint mono">한 줄에 한 가사 · 빈 줄 그대로 둠</div>
      </div>
    );
  }

  // 평소 (편집 안 함) — 칩 본문 클릭 → 콘티에 추가 / ✎ 클릭 → 편집 모드
  const preview = section.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);

  return (
    <button
      type="button"
      className={`sec-chip sec-${section.type}`}
      onClick={onAdd}
      aria-label={`${section.label} 콘티에 추가`}
    >
      <div className="sec-chip-head">
        <span className="sec-label">{section.label || section.type}</span>
        <span className="sec-head-right">
          <span
            className="sec-edit-btn"
            role="button"
            tabIndex={0}
            aria-label={`${section.label} 가사 편집`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                setEditing(true);
              }
            }}
            title="가사 편집"
          >
            ✎
          </span>
          <span className="sec-add-icon">+</span>
        </span>
      </div>
      <div className="sec-preview">
        {preview.length === 0 ? (
          <div className="sec-line sec-line-empty">(가사 없음)</div>
        ) : (
          preview.map((l, j) => (
            <div key={j} className="sec-line">
              {l}
            </div>
          ))
        )}
        {section.text.split('\n').filter((l) => l.trim()).length > 2 && (
          <div className="sec-more mono">
            + {section.text.split('\n').filter((l) => l.trim()).length - 2}줄
          </div>
        )}
      </div>
    </button>
  );
}
