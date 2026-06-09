'use client';

// 모바일 Step 3 전용 — 추출된 곡을 읽기 전용으로 보여주고 칩만 누르게 하는 컴포넌트.
//
// 왜 ExtractedSection을 안 쓰는가:
//   ExtractedSection은 제목 인라인 편집, 새 섹션 추가, 곡 삭제, ✎ 편집 모드 등
//   "수정" 기능이 다 들어있어 모바일 Step 3 화면에서 너무 무겁고 헷갈린다.
//   사용자 요구사항: "수정은 Step 2로 돌아가서 한다 / Step 3에선 chip만 누르면 된다".
//
// 동작:
//   - 곡 헤더 ▾ 클릭으로 펼침/접힘 토글 (각 곡 독립적)
//   - chip 클릭 → window의 'conti:append' 이벤트 발사 → EditorSection이 받아서 콘티에 누적
//   - 화면 상단 sticky 고정 — 사용자가 콘티 편집창 스크롤해도 곡 목록이 따라옴

import { useState } from 'react';
import type { Song } from '@/lib/types';
import { docHasSongTitle, sectionToText } from '@/lib/text-doc';

type MobileSongPickerProps = {
  songs: Song[];
  // 현재 콘티 텍스트 — 곡 제목이 이미 들어있는지 판정해서 첫 chip 클릭에만 "# 제목" 헤딩을 넣어준다.
  contiText: string;
};

export default function MobileSongPicker({ songs, contiText }: MobileSongPickerProps) {
  // 초기엔 첫 곡만 펼쳐서 화면이 너무 길어지지 않게 한다.
  // Set<number>로 관리 — 사용자가 자유롭게 여러 곡 펼쳐도 됨(accordion 강제 X).
  const [openSet, setOpenSet] = useState<Set<number>>(() => new Set(songs.length > 0 ? [0] : []));

  const toggleOpen = (idx: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleChipClick = (song: Song, sectionIdx: number) => {
    // 콘티에 같은 곡 제목이 이미 있으면 헤딩 중복 방지. 첫 chip 클릭에만 "# 제목"이 들어간다.
    const includeTitle = !docHasSongTitle(contiText, song.title);
    const section = song.sections[sectionIdx];
    if (!section) return;
    const chunk = sectionToText(song, section, includeTitle);
    window.dispatchEvent(new CustomEvent('conti:append', { detail: { chunk } }));
  };

  if (songs.length === 0) return null;

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'var(--paper, #faf5ec)',
        borderBottom: '1px solid var(--rule)',
        marginBottom: 10,
        // sticky 영역이 화면을 다 가려서 콘티 편집창이 안 보이는 일이 없도록 최대 높이 제한 + 스크롤.
        maxHeight: '45vh',
        overflowY: 'auto',
        paddingBottom: 4,
      }}
    >
      <div
        style={{
          padding: '6px 10px',
          fontSize: 11.5,
          color: 'var(--ink-3)',
          letterSpacing: 0.2,
        }}
      >
        칩을 누르면 아래 콘티에 가사가 추가돼요 · 수정은 Step 2에서
      </div>

      {songs.map((song, songIdx) => {
        const isOpen = openSet.has(songIdx);
        return (
          <div
            key={songIdx}
            style={{
              borderTop: '1px solid var(--rule)',
              background: 'var(--surface, #fff)',
            }}
          >
            {/* 곡 헤더 — 클릭으로 펼침/접힘 토글 */}
            <button
              type="button"
              onClick={() => toggleOpen(songIdx)}
              aria-expanded={isOpen}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--ink)',
                fontSize: 14,
                fontWeight: 500,
                textAlign: 'left',
              }}
            >
              {/* 화살표가 작아서 안 눌릴까 봐 사용자가 헤매지 않게 크게 키운 SVG 셰브론.
                  열림/닫힘은 transform: rotate로 표시 — 화살표 크기는 일정하게 유지. */}
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  color: 'var(--ink-2)',
                  transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 120ms ease',
                  flexShrink: 0,
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
              <span style={{ flex: 1 }}>{song.title || 'Untitled'}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>
                {song.sections.length}개 묶음
              </span>
            </button>

            {/* 섹션 chip 목록 — 펼침일 때만 렌더.
                라벨만 있으면 사용자가 어떤 가사인지 모르고 누르기 어려우므로 첫 줄 미리보기도 같이 표시.
                좁은 화면에서 가독성 위해 가로 나열(wrap) 대신 세로 리스트로 한 줄에 하나씩 배치. */}
            {isOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '0 10px 10px',
                }}
              >
                {song.sections.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '2px 0' }}>
                    묶음이 없어요. Step 2에서 추가하세요.
                  </div>
                )}
                {song.sections.map((sec, secIdx) => {
                  // 첫 줄 미리보기 — 공백만 있는 줄은 건너뛰고 실제 글자가 있는 첫 줄을 표시.
                  const firstLine =
                    (sec.text || '')
                      .split('\n')
                      .map((l) => l.trim())
                      .find(Boolean) || '(비어있음)';
                  return (
                    <button
                      key={secIdx}
                      type="button"
                      onClick={() => handleChipClick(song, secIdx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--rule)',
                        background: 'var(--paper-2, #f4ecdd)',
                        color: 'var(--ink-2)',
                        cursor: 'pointer',
                        fontSize: 13,
                        textAlign: 'left',
                        // 화면을 넘는 긴 가사는 ellipsis로 잘라서 한 줄로 유지.
                        width: '100%',
                      }}
                      aria-label={`${secIdx + 1}번 묶음을 콘티에 추가: ${firstLine}`}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--ink)',
                          minWidth: 22,
                          flexShrink: 0,
                          fontSize: 12.5,
                          textAlign: 'center',
                        }}
                      >
                        {secIdx + 1}
                      </span>
                      <span
                        style={{
                          color: 'var(--ink-3)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                          minWidth: 0,
                        }}
                      >
                        {firstLine}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
