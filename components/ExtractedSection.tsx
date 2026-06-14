'use client';

// 2번 영역 — 추출된 곡
//
// 두 모드로 동작한다 (song.confirmed로 구분):
//   ① 나누기 모드 (confirmed === false)
//      - AI가 분류 없이 뽑아준 가사를 편집창에 보여준다.
//      - 사용자가 빈 줄(엔터 두 번)로 "묶음"을 직접 나눈다 — 음악용어(verse/chorus) 몰라도 됨.
//      - [확정] 누르면 묶음들이 칩이 되고 칩 모드로 전환.
//   ② 칩 모드 (confirmed !== false)
//      - 나뉜 묶음을 칩으로 보여준다. 칩 본문 클릭 → 콘티에 추가(반복 가능).
//      - ✎ 로 한 묶음 가사 수정, 🗑 로 삭제. "다시 나누기"로 ①로 복귀.
//
// 왜 이렇게 바꿨나(사용자 의도): AI 분류는 오류가 잦은데, 한국어 서툰 아이들이
// 잘못 분류된 칩을 지우고·옮기고·고치는 게 너무 힘들다. 그래서 분류 단계를 없애고
// "사람이 엔터로 직접 나누기"로 단순화했다. AI는 가사 OCR + 줄 정리만 한다.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefCheck, Section, Song } from '@/lib/types';
import { sectionToText, docHasSongTitle } from '@/lib/text-doc';
import { submitReferenceLyrics } from '@/lib/reference-lyrics';
import { addToLibraryAsync } from '@/lib/song-library-cloud';
import Mascot from '@/components/Mascot';

type ExtractedSectionProps = {
  songs: Song[];
  text: string; // 현재 콘티 텍스트 — docHasSongTitle 판정용
  extracting: boolean;
  // 곡 단위 조작
  onUpdateSong: (idx: number, next: Song) => void;
  onRemoveSong: (idx: number) => void;
  // 맨 아래 "+ 새 곡 추가" — 빈 곡을 만들고 나누기 모드로 시작.
  onAddEmptySong: () => void;
  // 오타 검토 — 추출 결과를 AI로 한 번 더 검증해서 의심 substring 표시.
  // suspectMap[songIdx][sectionIdx] = ["주꼐", "사 랑하다"] 형태.
  suspectMap: Record<number, Record<number, string[]>>;
  onVerifyLyrics: () => void;
  verifying: boolean;
};

// chip 클릭 시 EditorSection이 받을 커스텀 이벤트 dispatch
function dispatchAppend(chunk: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('conti:append', { detail: { chunk } }));
}

// 빈 줄(엔터 두 번) 기준으로 가사를 묶음으로 쪼갠다 — text-doc의 buildSlidesFromText와 같은 규칙.
function splitIntoBlocks(text: string): string[] {
  return text
    .split(/\n[ \t]*\n+/)
    .map((b) => b.replace(/^\n+|\n+$/g, '').trimEnd())
    .filter((b) => b.trim().length > 0);
}

export default function ExtractedSection({
  songs,
  text,
  extracting,
  onUpdateSong,
  onRemoveSong,
  onAddEmptySong,
  suspectMap,
  onVerifyLyrics,
  verifying,
}: ExtractedSectionProps) {
  const empty = songs.length === 0;
  const totalSuspects = Object.values(suspectMap).reduce(
    (sum, secMap) =>
      sum + Object.values(secMap).reduce((s2, arr) => s2 + arr.length, 0),
    0
  );

  return (
    <section className="panel ex-panel" aria-labelledby="extracted-h">
      <div className="section-head">
        <div className="left">
          <span className="step-num-inline">02</span>
          <h2 id="extracted-h">가사 편집</h2>
        </div>
        <div className="right mono">
          {empty ? '0곡' : `${songs.length}곡 추출됨`}
        </div>
      </div>

      {/* 오타 검토 버튼 — 곡이 있을 때만 노출. 옵트인 (자동 X). */}
      {!empty && (
        <div className="ex-verify-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onVerifyLyrics}
            disabled={verifying}
            title="악보와 비교해 오타가 있을 만한 곳을 표시해요 (PPT엔 영향 없음)"
          >
            🔍 {verifying ? '검토 중…' : '전체 오타 검토'}
          </button>
          {totalSuspects > 0 && (
            <span className="ex-verify-result">
              빨간 점이 있는 묶음에 {totalSuspects}건 의심
            </span>
          )}
        </div>
      )}

      {extracting && empty && <ExtractingState />}
      {!extracting && empty && <EmptyExtracted />}
      {!empty && (
        <div className="ex-list">
          {songs.map((song, i) => (
            <SongCard
              key={i}
              song={song}
              docText={text}
              onUpdate={(next) => onUpdateSong(i, next)}
              onRemove={() => onRemoveSong(i)}
              sectionSuspects={suspectMap[i] || {}}
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
          가사 정리 중…
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
        {/* 데스크톱·모바일 모두 업로드가 "위"에 있다 — 옛 좌우 레이아웃 시절 "왼쪽에"가 남아있던 것 수정 */}
        위에서 악보를 올리고 <strong>가사 추출하기</strong>를 누르면
        <br />여기에 곡 카드가 나타납니다.
      </div>
    </div>
  );
}

function SongCard({
  song,
  docText,
  onUpdate,
  onRemove,
  sectionSuspects,
}: {
  song: Song;
  docText: string;
  onUpdate: (next: Song) => void;
  onRemove: () => void;
  // 이 곡의 묶음별 의심 substring 목록 — 빨간 점 + 편집 모드 빨간 밑줄 트리거.
  sectionSuspects: Record<number, string[]>;
}) {
  // 카드 접기/펼치기 — 기본 펼침
  const [open, setOpen] = useState(true);
  // 제목 인라인 편집
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(song.title);

  // 외부 song.title이 바뀌면 draft도 동기화
  useEffect(() => {
    setTitleDraft(song.title);
  }, [song.title]);

  // confirmed === false 면 나누기 모드. (undefined/true는 칩 모드 — 라이브러리/저장본 호환)
  const splitMode = song.confirmed === false;

  const updateSection = (secIdx: number, patch: Partial<Section>) => {
    onUpdate({
      ...song,
      sections: song.sections.map((s, i) => (i === secIdx ? { ...s, ...patch } : s)),
    });
  };
  const deleteSection = (secIdx: number) => {
    if (!confirm('이 묶음을 삭제할까요?')) return;
    onUpdate({
      ...song,
      sections: song.sections.filter((_, i) => i !== secIdx),
    });
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

  // 나누기 모드 편집창의 초기 텍스트 — 현재 묶음들을 빈 줄로 이어붙인 것.
  const splitInitialText = song.sections
    .map((s) => s.text)
    .filter((t) => t && t.trim())
    .join('\n\n');

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
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            style={{
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 160ms',
            }}
          >
            <path
              d="M3 5 L7 9 L11 5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
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
          <div className="song-card-meta mono">
            {splitMode ? '나누는 중' : `${song.sections.length}개 묶음`}
          </div>
        </div>
        {/* 제목 옆 ✎ 버튼은 제거 — 제목 글자를 바로 클릭하면 수정돼서 중복이었음 (사용자 피드백) */}
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

      {/* 곡 라이브러리 자동 재사용 — 지난번 다듬은 확정본으로 대체됐음을 알림 */}
      {open && song.reused && (
        <div className="refcheck refcheck-ok">
          📚 곡 라이브러리에서 가져왔어요 — 지난번에 다듬은 그대로예요.
          {song.freshSections && song.freshSections.length > 0 && (
            <button
              type="button"
              className="btn btn-text btn-sm"
              style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px' }}
              onClick={() =>
                onUpdate({
                  ...song,
                  sections: song.freshSections!,
                  confirmed: false, // 새 추출본은 다시 나누기 모드부터
                  reused: false,
                  freshSections: undefined,
                })
              }
            >
              새 추출본 쓰기
            </button>
          )}
        </div>
      )}

      {/* 가사 대조 검토 — 같은 제목의 확정본이 있으면 일치율 + 교정 제안 표시 */}
      {open && song.refCheck && <RefCheckNote check={song.refCheck} />}

      {open &&
        (splitMode ? (
          <SplitMode
            key={splitInitialText}
            initialText={splitInitialText}
            onConfirm={(sections) => {
              const next = { ...song, sections, confirmed: true };
              onUpdate(next);
              // 확정한 가사를 대조용으로 쌓는다 — fire-and-forget (로그인 시에만 저장됨)
              void submitReferenceLyrics(next);
              // 곡 라이브러리도 다듬은 버전으로 갱신 — 다음에 같은 곡을 올리면
              // 이 확정본이 자동 재사용된다 (날것 AI 추출본 대신).
              void addToLibraryAsync([next]);
            }}
          />
        ) : (
          <>
            <div className="song-sections">
              {song.sections.length === 0 ? (
                <div className="sec-line sec-line-empty" style={{ padding: '6px 2px' }}>
                  아직 묶음이 없어요. 아래 “다시 나누기”로 가사를 나눠보세요.
                </div>
              ) : (
                song.sections.map((sec, secIdx) => (
                  <SectionChipCard
                    key={secIdx}
                    index={secIdx + 1}
                    section={sec}
                    suspects={sectionSuspects[secIdx] || []}
                    onAdd={() => {
                      const includeTitle = !docHasSongTitle(docText, song.title);
                      dispatchAppend(sectionToText(song, sec, includeTitle));
                    }}
                    onUpdate={(patch) => updateSection(secIdx, patch)}
                    onDelete={() => deleteSection(secIdx)}
                  />
                ))
              )}
            </div>

            {/* 다시 나누기 — 묶음을 추가/수정/재분할하고 싶을 때 나누기 모드로 복귀 */}
            <button
              type="button"
              className="btn-resplit"
              onClick={() => onUpdate({ ...song, confirmed: false })}
            >
              ✂ 다시 나누기
            </button>
          </>
        ))}
    </article>
  );
}

// 가사 대조 검토 배너 — "이전에 확정한 같은 제목 가사"와 얼마나 일치하는지 + 교정 제안.
// 추출 직후(나누기 모드)에 보여서, 사용자가 편집창에서 바로 고칠 수 있게 한다.
function RefCheckNote({ check }: { check: RefCheck }) {
  // 거의 완전 일치 → 한 줄 안심 메시지만
  if (check.diffs.length === 0 && check.matchPct >= 95) {
    return (
      <div className="refcheck refcheck-ok">
        ✓ 이전에 확정한 같은 제목의 가사와 일치해요 ({check.matchPct}%)
      </div>
    );
  }
  return (
    <div className="refcheck refcheck-warn">
      <div className="refcheck-head">
        이전에 확정한 같은 제목의 가사와 <b>{check.matchPct}% 일치</b>해요.
        {check.diffs.length > 0 && <> 이 줄들을 확인해 보세요:</>}
      </div>
      {check.diffs.map((d, i) => (
        <div key={i} className="refcheck-diff">
          <span className="refcheck-mine">{d.mine}</span>
          <span className="refcheck-arrow" aria-hidden="true">→</span>
          <span className="refcheck-sugg">{d.suggestion}</span>
        </div>
      ))}
    </div>
  );
}

// 나누기 모드 — 가사를 편집창에 보여주고 빈 줄로 묶음을 직접 나눈다.
function SplitMode({
  initialText,
  onConfirm,
}: {
  initialText: string;
  onConfirm: (sections: Section[]) => void;
}) {
  const [draft, setDraft] = useState(initialText);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // textarea 높이 자동 — 가사 양에 맞춰 늘어나게.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.max(160, ta.scrollHeight) + 'px';
  }, [draft]);

  // 미리보기용 — 빈 줄로 나뉜 묶음 개수/내용.
  const blocks = splitIntoBlocks(draft);

  const handleConfirm = () => {
    // 각 묶음을 중립 Section으로 (type/label은 화면에 안 쓰는 기본값).
    const sections: Section[] = blocks.map((text) => ({
      type: 'verse',
      label: '',
      verseNum: null,
      text,
    }));
    onConfirm(sections);
  };

  return (
    <div className="song-split">
      <div className="song-split-hint">
        <b>빈 줄</b>로 나눠요 — 빈 줄 위가 한 묶음(=칩 하나)이 됩니다.
      </div>
      <textarea
        ref={taRef}
        className="song-split-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        placeholder={
          '가사를 붙여넣고, 나눌 곳에서 엔터를 두 번 치세요.\n\n예)\n주 사랑이 내려와\n내 맘에 가득해\n\n할렐루야 주를 찬양해\n온 맘 다해 노래해'
        }
      />
      {/* 라이브 미리보기 — 빈 줄로 나뉜 묶음이 실시간으로 똭똭 갈라져 보인다.
          key={i}라 묶음 개수가 늘 때 새로 생긴 카드만 등장 애니메이션이 돌아 "똭" 느낌이 난다. */}
      <div className="song-split-preview">
        <div className="song-split-preview-head label">
          이렇게 나뉘어요 · <b>{blocks.length}개 묶음</b>
        </div>
        {blocks.length === 0 ? (
          <div className="song-split-empty">가사를 입력하면 여기에 묶음이 나타나요</div>
        ) : (
          <div className="song-split-blocks">
            {blocks.map((b, i) => (
              <div className="song-split-block" key={i}>
                <span className="sec-num">{i + 1}</span>
                <div className="song-split-block-lines">
                  {b.split('\n').map((l, j) => (
                    <div key={j} className="song-split-block-line">
                      {l.trim() || ' '}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="song-split-foot">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleConfirm}
          disabled={blocks.length === 0}
          style={{ width: '100%' }}
        >
          ✓ 이대로 나누기 확정 ({blocks.length}묶음)
        </button>
        {/* 대조 검토 데이터 사용 고지 — 확정 가사가 어디에 쓰이는지 투명하게 */}
        <div className="refcheck-notice">
          확정한 가사는 같은 곡을 올린 분들의 오탈자 검토(가사 대조)에만 쓰여요.
        </div>
      </div>
    </div>
  );
}

function SectionChipCard({
  index,
  section,
  suspects,
  onAdd,
  onUpdate,
  onDelete,
}: {
  // 칩 순서 번호 (1부터). 음악용어 대신 번호 + 가사 미리보기로 식별한다.
  index: number;
  section: Section;
  // 이 묶음의 오타 의심 substring 목록 (검토 안 했으면 빈 배열).
  suspects: string[];
  onAdd: () => void;
  onUpdate: (patch: Partial<Section>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [linesText, setLinesText] = useState(section.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  // 콘티에 추가됐다는 피드백 — 탭할 때마다 "✓ N번 추가"를 잠깐 띄운다(몇 번 넣었는지 보이게).
  const [addedCount, setAddedCount] = useState(0);
  const flashTimerRef = useRef<number | null>(null);
  const handleAdd = () => {
    onAdd();
    setAddedCount((c) => c + 1);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setAddedCount(0), 1600) as unknown as number;
  };

  // section 외부 변경 시 draft 동기화
  useEffect(() => {
    setLinesText(section.text);
  }, [section.text]);

  // textarea autosize — 가사 줄 수에 따라 높이 자동.
  // mirror div도 같은 높이로 맞춰 빨간 밑줄이 글자 위에 정확히 그어지게.
  useEffect(() => {
    if (editing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      const h = Math.max(80, ta.scrollHeight);
      ta.style.height = h + 'px';
      if (mirrorRef.current) {
        mirrorRef.current.style.height = h + 'px';
      }
    }
  }, [editing, linesText]);

  // 현재 본문에 실제 남아있는 의심 substring만 필터링 — 사용자가 수정하면 자동으로 빠짐.
  const activeSuspects = suspects.filter((s) => linesText.includes(s));
  // 편집 모드 mirror 오버레이용 HTML — 의심 substring을 <mark>로 감싸 빨간 밑줄.
  const overlayHtml = useMemo(() => {
    if (activeSuspects.length === 0) return '';
    const escape = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const sorted = [...activeSuspects].sort((a, b) => b.length - a.length);
    const escapedRe = sorted
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const re = new RegExp(escapedRe, 'g');
    return escape(linesText).replace(re, (m) => `<mark class="sec-suspect">${escape(m)}</mark>`);
  }, [linesText, activeSuspects]);

  const save = () => {
    onUpdate({ text: linesText });
    setEditing(false);
  };
  const cancel = () => {
    setLinesText(section.text);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="sec-chip sec-chip-editing"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sec-chip-head sec-chip-head-editing">
          <span className="sec-edit-title">묶음 {index} 수정</span>
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
              title="이 묶음 삭제"
              aria-label="삭제"
            >
              🗑
            </button>
          </div>
        </div>
        <div className="sec-edit-textarea-wrap">
          {overlayHtml && (
            <div
              ref={mirrorRef}
              className="sec-edit-mirror"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: overlayHtml + '\n' }}
            />
          )}
          <textarea
            ref={textareaRef}
            className="sec-edit-textarea"
            value={linesText}
            onChange={(e) => setLinesText(e.target.value)}
            placeholder="가사 한 줄에 하나씩…"
            spellCheck={false}
            autoFocus
          />
        </div>
        <div className="sec-edit-hint mono">
          한 줄에 한 가사
          {activeSuspects.length > 0 && (
            <span className="sec-edit-hint-suspect">
              {' · '}빨간 밑줄 = 오타 의심 (무시해도 괜찮아요)
            </span>
          )}
        </div>
      </div>
    );
  }

  // 평소 (편집 안 함) — 칩 본문 클릭 → 콘티에 추가 / ✎ 클릭 → 편집 모드
  const preview = section.text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2);

  // 평소 미리보기 줄에도 의심 substring 빨간 밑줄 표시.
  const renderPreviewLine = (line: string) => {
    if (activeSuspects.length === 0) return line;
    const sorted = [...activeSuspects].sort((a, b) => b.length - a.length);
    const escapedRe = sorted
      .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const re = new RegExp(escapedRe, 'g');
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    let key = 0;
    while ((match = re.exec(line)) !== null) {
      if (match.index > lastIdx) {
        parts.push(line.slice(lastIdx, match.index));
      }
      parts.push(
        <mark key={key++} className="sec-suspect">
          {match[0]}
        </mark>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < line.length) parts.push(line.slice(lastIdx));
    return parts.length > 0 ? parts : line;
  };

  return (
    <button
      type="button"
      className="sec-chip"
      onClick={handleAdd}
      aria-label={`${index}번 묶음 콘티에 추가`}
      style={{ position: 'relative' }}
    >
      {/* 추가 피드백 — 탭 직후 잠깐. 몇 번 넣었는지(N번) 표시. */}
      {addedCount > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', top: 6, right: 6, zIndex: 3,
            background: 'var(--accent, #0f766e)', color: '#fff',
            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}
        >
          ✓ {addedCount}번 추가
        </span>
      )}
      <div className="sec-chip-head">
        <span className="sec-num">{index}</span>
        {/* 오타 의심 빨간 점 */}
        {activeSuspects.length > 0 && (
          <span className="sec-suspect-dot" aria-label={`오타 의심 ${activeSuspects.length}건`} title={`오타 의심 ${activeSuspects.length}건`} />
        )}
        <span className="sec-head-right">
          <span
            className="sec-edit-btn"
            role="button"
            tabIndex={0}
            aria-label={`${index}번 묶음 가사 편집`}
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
              {renderPreviewLine(l)}
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
