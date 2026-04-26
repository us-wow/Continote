'use client';

// 콘티노트 메인 페이지
// Claude Design 핸드오프 디자인을 Next.js로 이식 (2026-04-26)
//
// 주요 UX 개선:
// 1. 2단 레이아웃 — 좌측 입력+결과 / 우측 편집창 (스크롤 왔다갔다 X)
// 2. 칩 기반 섹션 라벨 — [Verse 1] 같은 텍스트 직접 박지 않음
// 3. 곡 제목 클릭 → 큰 헤더로 편집창 상단에 삽입
// 4. 섹션 카드 클릭 → 칩 + 가사 블록으로 추가 (중복 허용 — 후렴은 여러 번 들어가야 함)

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { pdfToImages, fileToBase64, pdfFirstPageThumb } from '@/lib/pdf';
import { exportToDocx } from '@/lib/docx';
import type { Song, Section, SectionType } from '@/lib/types';
import Mascot from '@/components/Mascot';
import SectionChip from '@/components/SectionChip';

// 편집창 블록 모델
// title:   곡 제목 (큰 헤더)
// section: 섹션 칩 + 편집 가능한 가사 본문
// spacer:  블록 사이 빈 줄 (시각적 호흡)
type Block =
  | { kind: 'title'; text: string }
  | {
      kind: 'section';
      sectionId: string;
      type: SectionType;
      label: string;
      verseNum: number | null;
      body: string;
    }
  | { kind: 'spacer' };

// CSS 커스텀 프로퍼티(--gap)를 React style에 쓰기 위한 헬퍼
// TS가 기본 CSSProperties에 -- 시작 키를 안 받으므로 캐스팅 필요
const cssVar = (name: string, value: string): React.CSSProperties =>
  ({ [name]: value } as React.CSSProperties);

// type별 기본 표시 이름 (한국 찬양팀 관행 기준)
const TYPE_BASE_LABEL: Record<SectionType, string> = {
  verse: 'Verse',
  prechorus: 'Pre-Chorus',
  chorus: '후렴',
  bridge: 'Bridge',
  ending: 'Ending',
};

// 같은 type끼리의 순서를 보고 자동으로 라벨 생성
// - 1개면 그냥 "Verse" / "후렴" / "Bridge"
// - 여러 개면 "Verse 1", "Verse 2" / "후렴 1", "후렴 2" 식으로 번호 부여
// 사용자가 직접 라벨 타이핑할 필요 없음 — type만 선택하면 끝
function deriveLabel(sections: Section[], idx: number): string {
  const sec = sections[idx];
  const sameTypeIndices = sections
    .map((s, i) => (s.type === sec.type ? i : -1))
    .filter((i) => i >= 0);
  const totalSameType = sameTypeIndices.length;
  const positionInSameType = sameTypeIndices.indexOf(idx) + 1;
  const baseName = TYPE_BASE_LABEL[sec.type] || sec.type;
  return totalSameType > 1 ? `${baseName} ${positionInSameType}` : baseName;
}

export default function Home() {
  // ----- 상태 -----
  const [files, setFiles] = useState<File[]>([]);
  // 파일 인덱스 → 썸네일 data URL 매핑 (이미지: blob URL, PDF: 첫 페이지 PNG)
  const [thumbs, setThumbs] = useState<string[]>([]);
  // songs: 확정된 곡들(클릭 가능한 카드로 표시되는 상태)
  const [songs, setSongs] = useState<Song[]>([]);
  // 검토 단계 제거됨 (사용자 요청: "확인 버튼 없이 바로 카드로")
  // 추출 결과는 songs에 즉시 추가되고, 카드 단위로 클릭 추가 + ✎로 수정 가능

  // 확정된 카드의 인라인 수정 — 카드 하나씩 가볍게 고치는 용도
  // editingCardKey: "songIdx-secIdx" 형식. cardDraft에 임시 변경사항 보관 (저장 누르면 적용)
  const [editingCardKey, setEditingCardKey] = useState<string | null>(null);
  const [cardDraft, setCardDraft] = useState<Section | null>(null);
  // 곡 제목 인라인 수정용
  const [editingTitleIdx, setEditingTitleIdx] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [doc, setDoc] = useState<Block[]>([]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  // 정확도 우선 모드는 서버 분석 프롬프트를 더 보수적으로 쓰게 하므로, 업로드/붙여넣기 요청에 함께 전달한다.
  const [accuracyMode, setAccuracyMode] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 이전에 만들어진 이미지 blob URL들 — files 변경 시 정리해서 메모리 누수 방지
  const blobUrlsRef = useRef<string[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // ----- 파일 처리 -----
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (picked.length) setFiles((prev) => [...prev, ...picked].slice(0, 12));
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length) setFiles((prev) => [...prev, ...dropped].slice(0, 12));
  };

  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // ----- API 호출 (Gemini 분석) -----
  const handleExtract = async () => {
    // 직접 가사 붙여넣기 모드: 텍스트만 보냄
    if (pasteMode && pasted.trim()) {
      setExtracting(true);
      setLoadingMsg('가사를 분석 중');
      try {
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 같은 UI 토글이 텍스트 분석과 이미지 분석 모두에 동일하게 적용되어야 한다.
          body: JSON.stringify({ text: pasted.trim(), accuracyMode }),
        });
        // 서버가 JSON이 아닌 응답(HTML 에러 페이지 등) 반환하면 res.json()이 throw —
        // try/catch로 감싸 의미있는 에러 메시지로 변환
        let data: any;
        try {
          data = await res.json();
        } catch {
          throw new Error(`서버 응답이 JSON이 아님 (status ${res.status})`);
        }
        if (!res.ok) throw new Error(data.error || '분석 실패');
        if (!data.songs?.length) {
          showToast('가사를 찾을 수 없어요');
        } else {
          setSongs((prev) => [...prev, ...data.songs]);
          setPasted('');
          showToast(`${data.songs.length}곡 추출됨`);
        }
      } catch (err: any) {
        showToast(`오류: ${err.message}`);
      } finally {
        setExtracting(false);
      }
      return;
    }

    if (files.length === 0) {
      showToast('악보 파일을 올려주세요');
      return;
    }

    setExtracting(true);
    setLoadingMsg('파일을 준비 중');

    try {
      // PDF는 PDF.js로 페이지별 PNG 변환, 이미지는 base64로 직접 변환
      const images: { data: string; mimeType: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type === 'application/pdf') {
          setLoadingMsg(`PDF 변환 중 (${i + 1}/${files.length})`);
          const pages = await pdfToImages(f);
          for (const p of pages) images.push({ data: p.data, mimeType: p.mimeType });
        } else if (f.type.startsWith('image/')) {
          const img = await fileToBase64(f);
          images.push(img);
        } else {
          showToast(`지원 안 함: ${f.name}`);
        }
      }
      if (images.length === 0) {
        showToast('분석할 이미지가 없어요');
        return;
      }
      setLoadingMsg(`AI가 가사 추출 중 (${images.length}장)`);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 이미지 분석도 사용자가 고른 정확도 모드를 서버에서 판단할 수 있게 함께 보낸다.
        body: JSON.stringify({ images, accuracyMode }),
      });
      // res.json() 실패 시 의미있는 에러로 변환
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`서버 응답이 JSON이 아님 (status ${res.status})`);
      }
      if (!res.ok) throw new Error(data.error || '분석 실패');
      if (!data.songs?.length) {
        showToast('가사를 찾을 수 없어요');
      } else {
        setSongs((prev) => [...prev, ...data.songs]);
        showToast(`${data.songs.length}곡 추출됨`);
      }
    } catch (err: any) {
      showToast(`오류: ${err.message}`);
    } finally {
      setExtracting(false);
    }
  };

  // ----- 편집창 블록 조작 -----

  // 곡별 섹션 ID — 어느 곡의 몇 번째 섹션인지 추적용
  const sectionId = (songIdx: number, secIdx: number) => `${songIdx}-${secIdx}`;

  // 곡 제목 클릭 → title 블록 추가 (이미 있으면 중복 방지)
  // 사용자 요청: 위에 끼어들지 말고 섹션처럼 맨 아래에 추가
  // (여러 곡 섞어 콘티 만들 때 자연스러움 — 제목→섹션 순서로 흐름 유지)
  const insertTitle = (song: Song) => {
    if (doc.some((b) => b.kind === 'title' && b.text === song.title)) {
      showToast('이미 추가된 제목');
      return;
    }
    setDoc((d) => {
      if (d.length === 0) return [{ kind: 'title', text: song.title }];
      const next: Block[] = [];
      // 마지막 블록이 spacer가 아니면 빈 줄 한 칸 띄우고 추가
      if (d[d.length - 1].kind !== 'spacer') {
        next.push({ kind: 'spacer' });
      }
      next.push({ kind: 'title', text: song.title });
      return [...d, ...next];
    });
  };

  // 섹션 카드 클릭 → 칩 + 본문 블록 추가
  // 후렴은 여러 번 들어가야 하므로 중복 허용 (몇 번 추가됐는지 카운터만 표시)
  const insertSection = (section: Section, songIdx: number, secIdx: number) => {
    setDoc((d) => {
      const next: Block[] = [];
      // 마지막 블록이 spacer가 아니면 빈 줄 한 칸 띄우기
      if (d.length > 0 && d[d.length - 1].kind !== 'spacer') {
        next.push({ kind: 'spacer' });
      }
      next.push({
        kind: 'section',
        sectionId: sectionId(songIdx, secIdx),
        type: section.type,
        label: section.label,
        verseNum: section.verseNum,
        body: section.text,
      });
      return [...d, ...next];
    });
  };

  // 블록 인라인 수정 (contentEditable blur 시 호출)
  const updateBlock = (idx: number, next: Block) => {
    setDoc((d) => d.map((b, i) => (i === idx ? next : b)));
  };

  // 블록 제거 — 인접 spacer 자동 정리
  const removeBlock = (idx: number) => {
    setDoc((d) => {
      const out = d.filter((_, i) => i !== idx);
      // 양 끝의 spacer, 연속된 spacer 제거 (시각적으로 깔끔하게)
      return out.filter(
        (b, i) =>
          !(
            b.kind === 'spacer' &&
            (i === 0 || i === out.length - 1 || out[i - 1]?.kind === 'spacer')
          )
      );
    });
  };

  // ----- 직렬화 (TXT/DOCX/복사용) -----
  // 사용자 요청: "verse 처럼 분류는 콘티 편집 부분에 안들어갔으면" → 라벨 출력에서 제거
  // title:   ━━━ 제목 ━━━ (DOCX에서 가운데 정렬 헤딩으로 변환됨, TXT에서도 시각적 구분)
  // section: 가사 본문만 (라벨 없음)
  // spacer:  빈 줄
  const serializeDoc = useMemo(() => {
    return doc
      .map((b) => {
        if (b.kind === 'title') return `━━━ ${b.text} ━━━\n`;
        if (b.kind === 'section') return b.body;
        return ''; // spacer
      })
      .join('\n');
  }, [doc]);

  // 파일명에 들어갈 오늘 날짜 (콘티_20260426.txt 같은 식)
  const dateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  const handleCopy = async () => {
    if (!serializeDoc.trim()) {
      showToast('비어있어요');
      return;
    }
    await navigator.clipboard.writeText(serializeDoc.trim());
    showToast('복사됨');
  };

  const handleSaveTxt = () => {
    if (!serializeDoc.trim()) {
      showToast('비어있어요');
      return;
    }
    const blob = new Blob([serializeDoc.trim()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `콘티_${dateStr()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('.txt 저장됨');
  };

  const handleSaveDocx = async () => {
    if (!serializeDoc.trim()) {
      showToast('비어있어요');
      return;
    }
    try {
      await exportToDocx(serializeDoc.trim(), `콘티_${dateStr()}.docx`);
      showToast('.docx 저장됨');
    } catch (err: any) {
      showToast('저장 실패: ' + err.message);
    }
  };

  const onClear = () => {
    if (confirm('편집창을 모두 비울까요?')) setDoc([]);
  };

  // 편집창에 블록 추가될 때마다 자동으로 맨 아래로 스크롤
  // 사용자 요청: "추가하면 바로바로 맨 아래부분으로 가게"
  useEffect(() => {
    if (editorBodyRef.current) {
      editorBodyRef.current.scrollTo({
        top: editorBodyRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [doc.length]);

  // 파일 추가/제거 시 실제 썸네일 생성
  // 이미지는 즉시(blob URL), PDF는 PDF.js로 첫 페이지 렌더링(비동기)
  // 메모리 누수 방지: 새 URL 만든 뒤 이전 URL들을 revoke하는 순서로 처리
  useEffect(() => {
    let cancelled = false;
    const newBlobUrls: string[] = [];

    Promise.all(
      files.map(async (f) => {
        if (f.type.startsWith('image/')) {
          const url = URL.createObjectURL(f);
          newBlobUrls.push(url);
          return url;
        }
        if (f.type === 'application/pdf') {
          try {
            return await pdfFirstPageThumb(f);
          } catch {
            return '';
          }
        }
        return '';
      })
    ).then((results) => {
      if (cancelled) {
        // unmount되거나 files가 또 바뀐 경우 — 방금 만든 URL은 쓸모없음 → 즉시 정리
        newBlobUrls.forEach(URL.revokeObjectURL);
        return;
      }
      // 이전 렌더의 URL은 더 이상 안 쓰이므로 정리
      blobUrlsRef.current.forEach(URL.revokeObjectURL);
      blobUrlsRef.current = newBlobUrls;
      setThumbs(results);
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  // 컴포넌트 unmount 시 남은 blob URL + toast 타이머 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      blobUrlsRef.current.forEach(URL.revokeObjectURL);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ⌘+Enter / Ctrl+Enter 단축키로 추출
  // ref 패턴으로 stale closure 회피 — handleExtract가 항상 최신 state(files, pasted 등)를 봄
  // 이전 코드는 deps 배열 없어서 매 렌더마다 리스너 재등록 + 첫 마운트 때의 함수만 캡처해서 버그
  const handleExtractRef = useRef(handleExtract);
  useEffect(() => {
    handleExtractRef.current = handleExtract;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleExtractRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- 카드 인라인 수정 헬퍼 -----
  // 카드 한 개씩만 편집 모드 진입. draft에 변경사항 보관 후 저장 시 songs에 반영
  const startCardEdit = (songIdx: number, secIdx: number, sec: Section) => {
    setEditingCardKey(`${songIdx}-${secIdx}`);
    setCardDraft({ ...sec });
  };

  const saveCardEdit = () => {
    if (!editingCardKey || !cardDraft) return;
    const [songIdxStr, secIdxStr] = editingCardKey.split('-');
    const songIdx = Number(songIdxStr);
    const secIdx = Number(secIdxStr);
    setSongs((prev) =>
      prev.map((s, i) =>
        i !== songIdx
          ? s
          : {
              ...s,
              sections: s.sections.map((sec, si) => (si === secIdx ? cardDraft : sec)),
            }
      )
    );
    setEditingCardKey(null);
    setCardDraft(null);
    showToast('수정됨');
  };

  const cancelCardEdit = () => {
    setEditingCardKey(null);
    setCardDraft(null);
  };

  const deleteConfirmedSection = (songIdx: number, secIdx: number) => {
    if (!confirm('이 섹션을 삭제할까요?')) return;
    setSongs((prev) =>
      prev.map((s, i) =>
        i !== songIdx ? s : { ...s, sections: s.sections.filter((_, si) => si !== secIdx) }
      )
    );
    setEditingCardKey(null);
    setCardDraft(null);
    showToast('섹션 삭제됨');
  };

  // 곡 제목 인라인 수정
  const startTitleEdit = (songIdx: number, current: string) => {
    setEditingTitleIdx(songIdx);
    setTitleDraft(current);
  };

  const saveTitleEdit = () => {
    if (editingTitleIdx === null) return;
    const newTitle = titleDraft.trim();
    if (!newTitle) {
      showToast('제목은 비울 수 없어요');
      return;
    }
    setSongs((prev) =>
      prev.map((s, i) => (i === editingTitleIdx ? { ...s, title: newTitle } : s))
    );
    setEditingTitleIdx(null);
    setTitleDraft('');
    showToast('제목 수정됨');
  };

  const cancelTitleEdit = () => {
    setEditingTitleIdx(null);
    setTitleDraft('');
  };

  // 빈 섹션 새로 추가 후 즉시 편집 모드 진입
  const addNewSectionToSong = (songIdx: number) => {
    const newSec: Section = { type: 'verse', label: '', verseNum: null, text: '' };
    const newSecIdx = songs[songIdx]?.sections.length ?? 0;
    setSongs((prev) =>
      prev.map((s, i) =>
        i !== songIdx ? s : { ...s, sections: [...s.sections, newSec] }
      )
    );
    // 추가하자마자 편집 모드로 — 가사를 바로 입력할 수 있게
    startCardEdit(songIdx, newSecIdx, newSec);
  };

  // 결과 패널 UI 헬퍼
  const isTitleInDoc = (title: string) =>
    doc.some((b) => b.kind === 'title' && b.text === title);
  const sectionInsertCount = (id: string) =>
    doc.filter((b) => b.kind === 'section' && b.sectionId === id).length;

  const isEmpty = doc.length === 0;
  const blockCount = doc.filter((b) => b.kind === 'section').length;
  const hasResult = songs.length > 0;

  // ============== 렌더 ==============
  return (
    <div className="app">
      {/* ----- 상단 바 ----- */}
      <header
        style={{
          borderBottom: '1px solid var(--rule)',
          padding: '18px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: 'color-mix(in oklab, var(--paper) 70%, white)',
        }}
      >
        {/* 헤더 — 텍스트 로고만. 미니 마스코트는 다른 곳에 더 큰 사이즈로 등장하므로 중복 제거 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: '-0.012em',
              color: 'var(--ink)',
            }}
          >
            콘티노트
          </span>
        </div>
        <nav className="topbar-meta" style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span className="caption" style={{ color: 'var(--ink-2)' }}>
            찬양팀·예배 사역자를 위한 AI 콘티 메이커
          </span>
        </nav>
      </header>

      {/* ----- 히어로 ----- */}
      <section
        style={{
          padding: '56px 32px 36px',
          maxWidth: 1240,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        {/* 히어로 헤드라인 — 한글 강제 이탤릭 어색해서 굵기+색으로만 강조 */}
        <h1 className="h-display" style={{ margin: 0, maxWidth: 920 }}>
          악보를 콘티 가사로,
          <br />
          <span
            style={{
              color: 'var(--accent-ink)',
              fontWeight: 700,
            }}
          >
            클릭 한 번에.
          </span>
        </h1>
        <p
          style={{
            marginTop: 18,
            maxWidth: 620,
            fontSize: 16.5,
            lineHeight: 1.65,
            color: 'var(--ink-2)',
          }}
        >
          JPG·PDF 악보를 올리면 가사만 깔끔하게 추출해드립니다. 결과에서 곡 제목과 섹션을 클릭해 콘티를 조립하세요.
        </p>
        {/* 히어로 마스코트 — done 포즈로 차별화 (헤더에 미니 idle, 에디터 빈 상태에 큰 idle 있음) */}
        <div className="mascot-float hero-mascot">
          <Mascot pose="done" size={120} />
        </div>
      </section>

      {/* ----- 메인: 2단 레이아웃 ----- */}
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '0 32px 56px' }}>
        <div
          className="two-col"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 0.85fr) minmax(0, 1.15fr)',
            gap: 40,
            alignItems: 'start',
          }}
        >
          {/* === 좌측: 업로드 + 추출 결과 === */}
          <div className="stack" style={cssVar('--gap', '32px')}>
            {/* --- 1. 업로드 영역 --- */}
            <div className="stack" style={cssVar('--gap', '20px')}>
              <div>
                <div className="label" style={{ marginBottom: 12 }}>
                  1. 악보 업로드
                </div>
                {/* 키보드 접근성을 위해 클릭 가능한 div 대신 button을 사용한다.
                    Enter/Space로 파일 선택을 열 수 있고 기존 drag/drop 이벤트도 그대로 받는다. */}
                <button
                  type="button"
                  className="dropzone"
                  data-active={dragging || files.length > 0}
                  aria-label="악보 파일 업로드. 클릭하거나 끌어다 놓으세요"
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  style={{
                    width: '100%',
                    display: 'block',
                    padding: '32px 24px 28px',
                    textAlign: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={onPick}
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      fontFamily: 'var(--serif)',
                      fontSize: 19,
                      lineHeight: 1.35,
                      color: 'var(--ink)',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    악보를 여기로 끌어다 놓으세요
                  </div>
                  <div className="caption" style={{ marginTop: 6 }}>
                    또는{' '}
                    <span style={{ color: 'var(--ink)', borderBottom: '1px solid var(--ink)' }}>
                      파일 선택
                    </span>
                    <span style={{ margin: '0 8px', color: 'var(--ink-3)' }}>·</span>
                    JPG · PNG · PDF
                  </div>
                </button>

                {/* 정확도 모드는 1차 행동인 업로드를 가리지 않도록 드롭존 아래 고급 옵션으로 둔다.
                    기존 토글 패턴을 재사용해 붙여넣기 토글과 조작감을 맞춘다. */}
                <button
                  type="button"
                  role="switch"
                  className="toggle"
                  data-on={accuracyMode}
                  aria-checked={accuracyMode}
                  onClick={() => setAccuracyMode((v) => !v)}
                  style={{ marginTop: 10 }}
                >
                  <span className="track" />
                  <span>정확도 우선</span>
                  <span style={{ color: 'var(--ink-3)' }}>(느려짐)</span>
                </button>

                {files.length > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      display: 'grid',
                      // auto-fit으로 컨테이너 폭에 따라 카드 개수 자동 조정. 좁아지면 한 줄에 적게, 넓어지면 많이 배치한다.
                      gridTemplateColumns: 'repeat(auto-fit, minmax(72px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {files.map((f, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <div className="thumb">
                          {thumbs[i] && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbs[i]}
                              alt=""
                              style={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                              }}
                            />
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          title="제거"
                          style={{
                            position: 'absolute',
                            top: -6,
                            right: -6,
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            border: '1px solid var(--rule)',
                            background: 'var(--paper)',
                            color: 'var(--ink-2)',
                            cursor: 'pointer',
                            fontSize: 11,
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                        <div
                          className="mono"
                          style={{
                            marginTop: 6,
                            color: 'var(--ink-2)',
                            textAlign: 'left',
                            fontSize: 10.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {f.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 직접 가사 붙여넣기 토글 */}
              <div>
                <div
                  className="toggle"
                  data-on={pasteMode}
                  onClick={() => setPasteMode(!pasteMode)}
                >
                  <span className="track" />
                  <span>직접 가사 붙여넣기</span>
                </div>
                {pasteMode && (
                  <textarea
                    value={pasted}
                    onChange={(e) => setPasted(e.target.value)}
                    placeholder="여기에 가사를 붙여넣어 주세요"
                    rows={6}
                    style={{ marginTop: 10 }}
                  />
                )}
              </div>

              {/* 메인 추출 버튼 */}
              <button
                className="btn-primary"
                onClick={handleExtract}
                disabled={extracting || (files.length === 0 && !pasted.trim())}
                title="가사 추출하기 (⌘+Enter)"
              >
                {extracting ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    <span>{loadingMsg || '가사 추출 중'}</span>
                    <span style={{ display: 'inline-flex', gap: 4 }}>
                      <span className="ink-dot" style={{ background: '#fff' }} />
                      <span className="ink-dot" style={{ background: '#fff' }} />
                      <span className="ink-dot" style={{ background: '#fff' }} />
                    </span>
                  </span>
                ) : hasResult ? (
                  '다시 추출하기'
                ) : (
                  '가사 추출하기'
                )}
              </button>
            </div>

            <hr className="divider" />

            {/* --- 2. 추출된 곡 결과 --- */}
            {/* 우선순위: 로딩 중 > 빈 상태 > 카드 (검토 단계 제거됨) */}
            {extracting && songs.length === 0 ? (
              // 로딩 상태 — listening 마스코트
              <div
                style={{
                  border: '1px dashed var(--rule)',
                  borderRadius: 3,
                  padding: '44px 24px',
                  textAlign: 'center',
                  background: 'color-mix(in oklab, var(--paper) 80%, white)',
                }}
              >
                <div
                  className="mascot-float"
                  style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}
                >
                  <Mascot pose="listening" size={140} />
                </div>
                <div className="h-song" style={{ fontSize: 22, marginBottom: 8 }}>
                  가사를 옮겨 적는 중
                </div>
                <div className="caption">
                  <span
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      verticalAlign: 'middle',
                      marginRight: 8,
                    }}
                  >
                    <span className="ink-dot" />
                    <span className="ink-dot" />
                    <span className="ink-dot" />
                  </span>
                  잠시만요
                </div>
              </div>
            ) : songs.length === 0 ? (
              // 빈 상태 — reading 마스코트
              <div
                style={{
                  border: '1px dashed var(--rule)',
                  borderRadius: 3,
                  padding: '44px 24px',
                  textAlign: 'center',
                  background: 'color-mix(in oklab, var(--paper) 80%, white)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: 16,
                    opacity: 0.85,
                  }}
                >
                  <Mascot pose="reading" size={130} />
                </div>
                <div className="caption" style={{ maxWidth: 320, margin: '0 auto' }}>
                  왼쪽에 악보를 올리고{' '}
                  <span style={{ color: 'var(--ink)' }}>가사 추출하기</span>를 누르면 여기에
                  결과가 나타납니다.
                </div>
              </div>
            ) : (
              // 결과 있음 — 곡 + 섹션 카드 리스트
              <div className="stack" style={cssVar('--gap', '20px')}>
                <div className="label">2. 추출된 곡</div>

                {songs.map((song, songIdx) => (
                  <div key={songIdx} className="stack" style={cssVar('--gap', '14px')}>
                    {/* 곡 제목 카드 — 편집 모드면 input, 아니면 클릭 삽입 + ✎ 수정 버튼 */}
                    {editingTitleIdx === songIdx ? (
                      // ===== 제목 편집 모드 =====
                      <div
                        style={{
                          border: '1px solid var(--accent)',
                          borderLeft: '2px solid var(--accent)',
                          padding: '16px 20px',
                          background: '#fff',
                          borderRadius: 2,
                        }}
                      >
                        <div className="label" style={{ marginBottom: 8 }}>
                          곡 제목 수정
                        </div>
                        <input
                          type="text"
                          value={titleDraft}
                          onChange={(e) => setTitleDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveTitleEdit();
                            if (e.key === 'Escape') cancelTitleEdit();
                          }}
                          autoFocus
                          style={{
                            fontSize: 20,
                            fontWeight: 600,
                            fontFamily: 'var(--serif)',
                            padding: '10px 14px',
                          }}
                        />
                        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                          <button
                            className="btn-primary"
                            onClick={saveTitleEdit}
                            style={{ padding: '8px 16px', fontSize: 14 }}
                          >
                            저장
                          </button>
                          <button className="btn-ghost" onClick={cancelTitleEdit}>
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      // ===== 제목 표시(기본) — 클릭으로 콘티에 삽입 + ✎ 수정 버튼 =====
                      // 외부 div는 relative로 ✎ 버튼을 absolute 배치
                      // 클릭 영역(div role=button)이 카드 본체, 우상단 ✎는 별도 button
                      <div style={{ position: 'relative' }}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => insertTitle(song)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              insertTitle(song);
                            }
                          }}
                          style={{
                            textAlign: 'left',
                            border: '1px solid var(--rule)',
                            borderLeft: '2px solid var(--ink)',
                            background: isTitleInDoc(song.title)
                              ? 'color-mix(in oklab, var(--paper) 90%, var(--ink) 4%)'
                              : 'color-mix(in oklab, var(--paper) 65%, white)',
                            // 우측에 ✎ 버튼 들어갈 자리 확보 (paddingRight 늘림)
                            padding: '16px 56px 16px 20px',
                            cursor: 'pointer',
                            borderRadius: 2,
                            color: 'var(--ink)',
                            transition: 'transform .18s, border-color .18s, box-shadow .2s',
                            opacity: isTitleInDoc(song.title) ? 0.7 : 1,
                            outline: 'none',
                          }}
                          title={isTitleInDoc(song.title) ? '이미 추가됨' : '클릭해서 제목 삽입'}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                            }}
                          >
                            <div>
                              <h2
                                style={{
                                  margin: '0 0 4px',
                                  fontSize: 22,
                                  fontWeight: 600,
                                  fontFamily: 'var(--serif)',
                                  letterSpacing: '-0.012em',
                                  lineHeight: 1.3,
                                  color: 'var(--ink)',
                                }}
                              >
                                {song.title || 'Untitled'}
                              </h2>
                              <div className="mono" style={{ color: 'var(--ink-3)' }}>
                                {song.sections.length}개 섹션
                              </div>
                            </div>
                            <span
                              className="mono"
                              style={{
                                fontSize: 11,
                                color: isTitleInDoc(song.title)
                                  ? 'var(--ink-3)'
                                  : 'var(--accent-ink)',
                                border:
                                  '1px solid ' +
                                  (isTitleInDoc(song.title) ? 'var(--rule)' : 'var(--accent)'),
                                padding: '4px 10px',
                                borderRadius: 99,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {isTitleInDoc(song.title) ? '✓ 추가됨' : '+ 제목 삽입'}
                            </span>
                          </div>
                        </div>
                        {/* ✎ 수정 아이콘 — 우상단 absolute. stopPropagation 불필요 (별도 div 밖) */}
                        <button
                          onClick={() => startTitleEdit(songIdx, song.title)}
                          title="제목 수정"
                          style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: 'var(--paper)',
                            border: '1px solid var(--rule)',
                            color: 'var(--ink-2)',
                            cursor: 'pointer',
                            fontSize: 13,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✎
                        </button>
                      </div>
                    )}

                    {/* 섹션 카드들 — 편집 모드면 인라인 에디터, 아니면 클릭 삽입 + ✎ 수정 */}
                    <div className="stack" style={cssVar('--gap', '10px')}>
                      {song.sections.map((sec, secIdx) => {
                        const id = sectionId(songIdx, secIdx);
                        const cardKey = `${songIdx}-${secIdx}`;
                        const insertedCount = sectionInsertCount(id);
                        const previewLines = sec.text.split('\n').filter((l) => l.trim());
                        const isEditing = editingCardKey === cardKey;

                        if (isEditing && cardDraft) {
                          // ===== 섹션 편집 모드 =====
                          return (
                            <div
                              key={secIdx}
                              style={{
                                border: '1px solid var(--accent)',
                                borderLeft: '2px solid var(--accent)',
                                background: '#fff',
                                borderRadius: 2,
                                padding: '14px 16px',
                              }}
                            >
                              {/* 인라인 편집은 라벨 입력 없이 type 드롭다운만 */}
                              {/* type 변경 시 라벨도 비워서 칩이 자동으로 type 기본 이름 표시하게 */}
                              <header
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                  marginBottom: 10,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <select
                                  value={cardDraft.type}
                                  onChange={(e) =>
                                    setCardDraft({
                                      ...cardDraft,
                                      type: e.target.value as SectionType,
                                      // type 바뀌면 라벨 비워서 새 type 기본 이름이 칩에 표시되게
                                      label: '',
                                    })
                                  }
                                  style={{
                                    fontSize: 12,
                                    padding: '4px 8px',
                                    border: '1px solid var(--rule)',
                                    borderRadius: 99,
                                    background: '#fff',
                                    cursor: 'pointer',
                                    fontFamily: 'var(--sans)',
                                    fontWeight: 600,
                                    color: 'var(--ink)',
                                  }}
                                >
                                  <option value="verse">Verse</option>
                                  <option value="prechorus">Pre-Chorus</option>
                                  <option value="chorus">Chorus / 후렴</option>
                                  <option value="bridge">Bridge</option>
                                  <option value="ending">Ending / 엔딩</option>
                                </select>
                              </header>
                              <textarea
                                value={cardDraft.text}
                                onChange={(e) =>
                                  setCardDraft({ ...cardDraft, text: e.target.value })
                                }
                                rows={Math.max(3, cardDraft.text.split('\n').length)}
                                style={{
                                  fontSize: 15,
                                  lineHeight: 1.7,
                                  padding: '10px 12px',
                                  resize: 'vertical',
                                }}
                              />
                              <div
                                style={{
                                  marginTop: 10,
                                  display: 'flex',
                                  gap: 8,
                                  alignItems: 'center',
                                }}
                              >
                                <button
                                  className="btn-primary"
                                  onClick={saveCardEdit}
                                  style={{ padding: '8px 16px', fontSize: 14 }}
                                >
                                  저장
                                </button>
                                <button className="btn-ghost" onClick={cancelCardEdit}>
                                  취소
                                </button>
                                <button
                                  onClick={() => deleteConfirmedSection(songIdx, secIdx)}
                                  style={{
                                    marginLeft: 'auto',
                                    fontSize: 12,
                                    color: 'var(--ink-3)',
                                    padding: '6px 10px',
                                    border: '1px solid var(--rule)',
                                    borderRadius: 2,
                                    background: 'none',
                                    cursor: 'pointer',
                                  }}
                                  title="이 섹션 삭제"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          );
                        }

                        // ===== 섹션 표시 모드(기본) =====
                        return (
                          <div key={secIdx} style={{ position: 'relative' }}>
                            <article
                              className="section-card"
                              onClick={() => insertSection(sec, songIdx, secIdx)}
                              style={{ paddingRight: 50 }}
                            >
                              <header
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  marginBottom: 8,
                                }}
                              >
                                {/* 라벨은 type + 같은 type 순서로 자동 도출 (사용자가 직접 타이핑 X)
                                    1개면 "Verse" / "후렴" / "Bridge", 여러 개면 "Verse 1", "Verse 2" */}
                                <SectionChip
                                  type={sec.type}
                                  label={deriveLabel(song.sections, secIdx)}
                                />
                                <span
                                  className="mono"
                                  style={{ color: 'var(--ink-3)', fontSize: 11 }}
                                >
                                  {previewLines.length}줄
                                </span>
                                <span
                                  className="mono"
                                  style={{
                                    marginLeft: 'auto',
                                    fontSize: 11,
                                    color:
                                      insertedCount > 0
                                        ? 'var(--ink-3)'
                                        : 'var(--accent-ink)',
                                  }}
                                >
                                  {insertedCount > 0
                                    ? `✓ ${insertedCount}회 추가됨`
                                    : '+ 콘티에 추가'}
                                </span>
                              </header>
                              <div
                                className="lyric"
                                style={{ fontSize: 14.5, lineHeight: 1.7 }}
                              >
                                {previewLines.map((l, j) => (
                                  <div key={j}>{l}</div>
                                ))}
                              </div>
                            </article>
                            {/* ✎ 수정 아이콘 — absolute (article 밖 wrapper 안) */}
                            <button
                              onClick={() => startCardEdit(songIdx, secIdx, sec)}
                              title="섹션 수정"
                              style={{
                                position: 'absolute',
                                top: 12,
                                right: 12,
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: 'var(--paper)',
                                border: '1px solid var(--rule)',
                                color: 'var(--ink-2)',
                                cursor: 'pointer',
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              ✎
                            </button>
                          </div>
                        );
                      })}

                      {/* + 섹션 추가 버튼 — 새 빈 섹션 생성 후 즉시 편집 모드 진입 */}
                      <button
                        className="btn-ghost"
                        onClick={() => addNewSectionToSong(songIdx)}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        + 섹션 추가
                      </button>
                    </div>
                  </div>
                ))}

                <div className="caption" style={{ color: 'var(--ink-3)' }}>
                  💡 카드를 누르면 우측 콘티에 추가, ✎로 카드 수정, "+ 섹션 추가"로 새 섹션 만들기.
                </div>
              </div>
            )}
          </div>

          {/* === 우측: 편집창 (sticky — 좌측 스크롤해도 화면 고정) === */}
          <aside
            className="editor-pane"
            style={{
              border: '1px solid var(--rule)',
              background: 'color-mix(in oklab, var(--paper) 80%, white)',
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <header
              style={{
                padding: '16px 22px',
                borderBottom: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div className="label" style={{ marginBottom: 2 }}>
                  3. 콘티 편집
                </div>
                <div className="caption">
                  {isEmpty
                    ? '왼쪽에서 곡 제목·섹션을 눌러 콘티를 만드세요'
                    : `${blockCount}개 섹션`}
                </div>
              </div>
              {!isEmpty && (
                <button className="btn-ghost" onClick={onClear}>
                  전체 비우기
                </button>
              )}
            </header>

            {/* editor-body — 내용이 길어지면 여기서만 내부 스크롤 (aside 자체는 잘리지 않음)
                ref로 자동 스크롤(맨 아래로) 제어 */}
            <div
              ref={editorBodyRef}
              className="editor-body"
              style={{
                padding: '28px 32px',
                background: '#fff',
                position: 'relative',
              }}
            >
              {isEmpty ? (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                  <div
                    className="mascot-float"
                    style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}
                  >
                    <Mascot pose="idle" size={140} />
                  </div>
                  <div className="h-song" style={{ fontSize: 22, margin: 0 }}>
                    빈 콘티에서 시작
                  </div>
                  <div className="caption" style={{ maxWidth: 320, margin: '12px auto 0' }}>
                    왼쪽 결과에서 <span style={{ color: 'var(--ink)' }}>곡 제목</span>이나{' '}
                    <span style={{ color: 'var(--ink)' }}>섹션 카드</span>를 눌러보세요.
                    순서대로 빈 줄을 두고 이어집니다.
                  </div>
                  {/* 붙여넣기 모드 발견율을 높이기 위해 시작 경로를 둘 다 명시한다. */}
                  <div className="caption" style={{ maxWidth: 360, margin: '10px auto 0' }}>
                    1) 악보 파일 업로드 — JPG·PDF 올리기
                    <br />
                    2) 직접 가사 붙여넣기 — 토글 켜고 텍스트 입력
                  </div>
                </div>
              ) : (
                <div>
                  {doc.map((b, i) => (
                    <EditorBlockView
                      key={i}
                      block={b}
                      onUpdate={(next) => updateBlock(i, next)}
                      onRemove={() => removeBlock(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 다운로드/복사 버튼 — 편집창 하단 footer */}
            <footer
              style={{
                padding: '16px 22px',
                borderTop: '1px solid var(--rule)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div className="caption" style={{ color: 'var(--ink-3)' }}>
                {!isEmpty ? '준비 완료' : '비어있음'}
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <button className="btn-text" disabled={isEmpty} onClick={handleSaveTxt}>
                  TXT 다운로드
                </button>
                <button className="btn-text" disabled={isEmpty} onClick={handleSaveDocx}>
                  DOCX 다운로드
                </button>
                <button className="btn-text" disabled={isEmpty} onClick={handleCopy}>
                  클립보드 복사
                </button>
              </div>
            </footer>
          </aside>
        </div>
      </main>

      {/* ----- 푸터 ----- */}
      <footer
        style={{
          borderTop: '1px solid var(--rule)',
          padding: '26px 32px 40px',
          background: 'color-mix(in oklab, var(--paper) 50%, white)',
        }}
      >
        <div
          style={{
            maxWidth: 1320,
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* 푸터 — 미니 마스코트 제거, 텍스트만 (시각적 군더더기 줄이기) */}
          <span className="caption">콘티노트 · CCM 찬양팀을 위한 도구</span>
          <span className="mono" style={{ color: 'var(--ink-3)' }}>
            made with care · seoul
          </span>
        </div>
      </footer>

      {/* 토스트 알림 */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}


// ============== 편집창 안의 블록 렌더링 ==============
// title / section / spacer 세 종류를 분기 처리
// section 본문은 contentEditable로 인라인 수정 가능
//
// contentEditable + React 주의:
// React가 children prop으로 텍스트를 박으면, 부모 재렌더 시 사용자 편집 내용을
// 덮어쓸 수 있음(자식 비제어 + React 재렌더 충돌). ref + useEffect로 외부 값이
// 실제로 다를 때만 DOM에 반영하는 패턴 사용 → 편집 중 포커스/입력 보존.
function EditorBlockView({
  block,
  onUpdate,
  onRemove,
}: {
  block: Block;
  onUpdate: (next: Block) => void;
  onRemove: () => void;
}) {
  // 모든 contentEditable 영역은 비제어 — 외부 prop이 진짜 다를 때만 동기화
  const editableRef = useRef<HTMLElement | null>(null);

  // block 텍스트가 외부에서 바뀐 경우(블록 추가, 다른 곳 편집)에만 DOM 갱신
  // 사용자가 그냥 타이핑 중일 땐 DOM = state라서 if 조건이 false → 건들지 않음
  useEffect(() => {
    if (block.kind !== 'section' && block.kind !== 'title') return;
    const el = editableRef.current;
    if (!el) return;
    const expected = block.kind === 'title' ? block.text : block.body;
    if (el.innerText !== expected) {
      el.innerText = expected;
    }
  }, [block]);

  if (block.kind === 'spacer') {
    return <div style={{ height: 14 }} />;
  }

  if (block.kind === 'title') {
    return (
      <div style={{ position: 'relative', marginBottom: 18 }}>
        <div className="label" style={{ marginBottom: 6 }}>
          곡 제목
        </div>
        <h1
          ref={editableRef as React.RefObject<HTMLHeadingElement>}
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) =>
            onUpdate({ ...block, text: e.currentTarget.innerText || '' })
          }
          className="h-song"
          style={{
            margin: 0,
            fontSize: 38,
            outline: 'none',
            borderBottom: '1px solid var(--rule)',
            paddingBottom: 8,
          }}
        />
        <button
          onClick={onRemove}
          title="제거"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: 'none',
            border: 'none',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 4,
          }}
        >
          제거
        </button>
      </div>
    );
  }

  // section 블록 — 사용자 요청대로 칩(Verse 1 같은 분류) 제거
  // 가사 본문만 표시하되, hover 시 우측 위에 "제거" 버튼이 나타남
  // 섹션 구분은 spacer(빈 줄)로 자연스럽게
  return (
    <div
      style={{ position: 'relative', marginBottom: 14 }}
      className="editor-section-block"
    >
      <button
        onClick={onRemove}
        title="섹션 제거"
        className="editor-section-remove"
        style={{
          position: 'absolute',
          top: -2,
          right: 0,
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          color: 'var(--ink-3)',
          cursor: 'pointer',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 99,
          opacity: 0,
          transition: 'opacity .15s ease',
        }}
      >
        제거
      </button>
      {/* 비제어 contentEditable — block 변경 시에만 useEffect로 DOM 갱신
          (children으로 박으면 사용자 편집 중 React 재렌더가 덮어씀) */}
      <div
        ref={editableRef as React.RefObject<HTMLDivElement>}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onUpdate({ ...block, body: e.currentTarget.innerText })}
        className="lyric"
        style={{
          outline: 'none',
          padding: '4px 0 8px',
          whiteSpace: 'pre-wrap',
          fontSize: 17.5,
          lineHeight: 1.85,
        }}
      />
    </div>
  );
}
