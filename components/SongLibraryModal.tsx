'use client';

// 곡 라이브러리 모달
// - 한 번 추출한 곡들을 모아놓고, 검색/제목수정/삭제/추가할 수 있는 팝업창.
// - 원래 app/page.tsx 안에 정의돼 있던 컴포넌트를 별도 파일로 분리한 것.
//   (데스크탑 page.tsx와 모바일 app/m/page.tsx 양쪽에서 공용으로 쓰기 위함)

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { type LibrarySong } from '@/lib/song-library';
import {
  listLibraryAsync,
  removeFromLibraryAsync,
  updateLibrarySongTitleAsync,
} from '@/lib/song-library-cloud';

// CSS 커스텀 프로퍼티(--gap 같은 변수)를 React style 객체에 넣기 위한 헬퍼.
// TS 기본 CSSProperties 타입은 '--' 로 시작하는 키를 막아서 캐스팅으로 우회한다.
const cssVar = (name: string, value: string): React.CSSProperties =>
  ({ [name]: value } as React.CSSProperties);

export default function SongLibraryModal({
  isCloudUser,
  onClose,
  onAdd,
}: {
  isCloudUser: boolean;
  onClose: () => void;
  onAdd: (song: LibrarySong) => void;
}) {
  const [query, setQuery] = useState('');
  const [allLibrary, setAllLibrary] = useState<LibrarySong[]>([]);
  const [loading, setLoading] = useState(true);
  // 제목 인라인 수정
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const cancelEditRef = useRef(false); // Escape 취소 시 onBlur 저장을 건너뛰는 플래그

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listLibraryAsync();
      setAllLibrary(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 검색은 fetch 없이 client-side 필터링 — 입력할 때마다 즉시 반영.
  const library = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q) return allLibrary;
    return allLibrary.filter((s) => {
      if (s.title.toLowerCase().replace(/\s+/g, '').includes(q)) return true;
      if (
        s.sections.some((sec) =>
          sec.text.toLowerCase().replace(/\s+/g, '').includes(q)
        )
      )
        return true;
      return false;
    });
  }, [query, allLibrary]);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatLibrarySavedAt = (ms: number) =>
    new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));

  const handleRemove = async (id: string) => {
    await removeFromLibraryAsync(id);
    await refresh();
  };

  // 제목 저장 — id 기준 클라우드 업데이트 후 목록 새로고침.
  const saveTitle = async (id: string) => {
    const t = titleDraft.trim();
    setEditingId(null);
    if (!t) return;
    await updateLibrarySongTitleAsync(id, t);
    await refresh();
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="곡 라이브러리"
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
          maxWidth: 620,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 4,
          padding: '32px 28px 24px',
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

        <h2 className="h-song" style={{ margin: '0 0 6px', fontSize: 22 }}>
          곡 라이브러리
        </h2>
        <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 12 }}>
          한 번 추출한 곡은 자동으로 모여요. 제목과 가사 내용으로 검색할 수 있어요.
        </p>

        {/* 저장 위치 안내 — 로그인 여부에 따라 클라우드/로컬 표시. */}
        <div
          className="caption"
          style={{
            color: 'var(--ink-3)',
            marginBottom: 14,
            padding: '8px 10px',
            background: 'color-mix(in oklab, var(--paper) 70%, white)',
            border: '1px solid var(--rule)',
            borderRadius: 2,
          }}
        >
          {isCloudUser ? (
            <>
              <strong style={{ color: 'var(--accent-ink)' }}>☁ 클라우드 저장 중</strong> — 다른 기기에서도 같은 계정으로 로그인하면 이 곡들을 그대로 쓸 수 있어요.
            </>
          ) : (
            <>
              <strong>🔒 로그인해야 저장돼요</strong> — 지금은 저장 안 됨(새로고침하면 초기화). 로그인하면 클라우드에 저장돼 다른 기기에서도 보여요.
            </>
          )}
        </div>

        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="곡 제목 또는 가사 검색"
          autoFocus
          style={{ fontSize: 14, marginBottom: 18 }}
        />

        {loading ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            불러오는 중…
          </div>
        ) : library.length === 0 ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            아직 라이브러리에 곡이 없어요. 가사 추출하면 자동으로 모입니다.
          </div>
        ) : (
          <div className="stack" style={cssVar('--gap', '10px')}>
            {library.map((song) => (
              <div
                key={song.id}
                style={{
                  border: '1px solid var(--rule)',
                  borderLeft: '2px solid var(--accent)',
                  padding: '14px 14px 12px',
                  borderRadius: 2,
                  background: 'color-mix(in oklab, var(--paper) 65%, white)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {editingId === song.id ? (
                      <input
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          else if (e.key === 'Escape') {
                            cancelEditRef.current = true;
                            e.currentTarget.blur();
                          }
                        }}
                        onBlur={() => {
                          if (cancelEditRef.current) {
                            cancelEditRef.current = false;
                            setEditingId(null);
                            return;
                          }
                          void saveTitle(song.id);
                        }}
                        autoFocus
                        style={{
                          fontFamily: 'var(--serif)',
                          fontWeight: 600,
                          fontSize: 18,
                          color: 'var(--ink)',
                          width: '100%',
                          padding: '2px 6px',
                          border: '1px solid var(--accent)',
                          borderRadius: 4,
                          background: 'var(--surface, #fff)',
                          boxSizing: 'border-box',
                        }}
                      />
                    ) : (
                      <div
                        onClick={() => {
                          setTitleDraft(song.title || '');
                          setEditingId(song.id);
                        }}
                        role="button"
                        tabIndex={0}
                        title="제목 클릭해서 수정"
                        style={{
                          fontFamily: 'var(--serif)',
                          fontWeight: 600,
                          fontSize: 18,
                          color: 'var(--ink)',
                          lineHeight: 1.35,
                          overflowWrap: 'anywhere',
                          cursor: 'pointer',
                        }}
                      >
                        {song.title || 'Untitled'}
                        <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--ink-3)' }}>✎</span>
                      </div>
                    )}
                    <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                      묶음 {song.sections.length}개 · {formatLibrarySavedAt(song.savedAt)}
                    </div>
                  </div>
                  <button
                    className="btn-text"
                    onClick={() => onAdd(song)}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    + 추가
                  </button>
                  <button
                    onClick={() => handleRemove(song.id)}
                    aria-label="라이브러리에서 삭제"
                    title="라이브러리에서 삭제"
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: '50%',
                      border: '1px solid var(--rule)',
                      background: 'var(--paper)',
                      color: 'var(--ink-3)',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
