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
import {
  exportToPptx,
  validateSlide,
  PPT_FONT_LABELS,
  type PptFont,
  type PptSlide,
} from '@/lib/pptx';
import type { Song, Section, SectionType } from '@/lib/types';
import Mascot from '@/components/Mascot';
import SectionChip from '@/components/SectionChip';

// 편집창 블록 모델
// title:      곡 제목 (큰 헤더)
// section:    섹션 칩 + 편집 가능한 가사 본문
// spacer:     블록 사이 빈 줄 (시각적 호흡)
// slidebreak: PPT 슬라이드 분리자. 한 콘티 안에서 슬라이드 단위를 사용자가 자유롭게 자른다.
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
  | { kind: 'spacer' }
  | { kind: 'slidebreak' };

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
  // PPT 제작 폰트 선택 — lib/pptx.ts의 지원 폰트 타입과 동기화한다.
  // 기본 폰트는 '본명조 Pro' — 한국 CCM PPT에서 가장 모던하고 자연스럽게 어울림.
  const [pptFont, setPptFont] = useState<PptFont>('noto-serif-kr');
  // 도움말 모달 — 헤더의 [사용법] 버튼으로 토글
  const [showHelp, setShowHelp] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          // 정확도 모드에서는 고해상도 렌더링이 OCR 판독 품질에 직접 영향을 준다.
          // 기본 모드는 lib/pdf.ts의 동적 scale 분기를 유지해 속도와 품질 균형을 맡긴다.
          const pages = await pdfToImages(f, accuracyMode ? 2 : undefined);
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

  // 곡 단위 삭제 — songs에서 해당 곡 제거 + 콘티 편집창에서도 해당 곡 관련 블록 정리.
  // sectionId가 "songIdx-secIdx" 인덱스 기반이므로, 삭제 후 남은 곡들의 sectionId도 reindex 한다.
  const removeSong = (targetIdx: number) => {
    const target = songs[targetIdx];
    if (!target) return;
    const ok = window.confirm(
      `"${target.title || 'Untitled'}" 곡을 삭제할까요?\n이미 콘티에 추가한 같은 곡 블록도 함께 사라집니다.`
    );
    if (!ok) return;

    // 1) 콘티 편집창(doc) 정리: 같은 곡 제목 블록과 sectionId가 targetIdx로 시작하는 섹션 제거,
    //    남은 곡 블록 중 songIdx가 targetIdx보다 큰 건 인덱스 한 칸 당김.
    setDoc((d) => {
      const filtered = d.filter((b) => {
        if (b.kind === 'title' && b.text === target.title) return false;
        if (b.kind === 'section') {
          const songIdxStr = b.sectionId.split('-')[0];
          if (Number(songIdxStr) === targetIdx) return false;
        }
        return true;
      });
      const reindexed = filtered.map((b) => {
        if (b.kind !== 'section') return b;
        const [songIdxStr, secIdxStr] = b.sectionId.split('-');
        const songIdx = Number(songIdxStr);
        if (songIdx > targetIdx) {
          return { ...b, sectionId: `${songIdx - 1}-${secIdxStr}` };
        }
        return b;
      });
      // 양 끝/연속 spacer 정리 (removeBlock과 동일 패턴)
      return reindexed.filter(
        (b, i, arr) =>
          !(
            b.kind === 'spacer' &&
            (i === 0 || i === arr.length - 1 || arr[i - 1]?.kind === 'spacer')
          )
      );
    });

    // 2) songs에서 제거
    setSongs((prev) => prev.filter((_, i) => i !== targetIdx));
  };

  // 추출된 곡 카드 안에서 섹션 순서 위/아래로 한 칸 이동.
  // 같은 곡(songIdx) 안에서만 swap. deriveLabel은 자동 갱신되므로 라벨은 자연스럽게 따라온다.
  const moveSectionInSong = (
    songIdx: number,
    secIdx: number,
    dir: 'up' | 'down'
  ) => {
    setSongs((prev) =>
      prev.map((s, i) => {
        if (i !== songIdx) return s;
        const newIdx = dir === 'up' ? secIdx - 1 : secIdx + 1;
        if (newIdx < 0 || newIdx >= s.sections.length) return s;
        const sections = [...s.sections];
        [sections[newIdx], sections[secIdx]] = [sections[secIdx], sections[newIdx]];
        return { ...s, sections };
      })
    );
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

  // spacer는 시각적 여백을 담당하므로 위치를 유지하고, 실제 콘텐츠인 title/section만 교환한다.
  // 이렇게 해야 이동 후에도 블록 사이 빈 줄 흐름이 자연스럽게 유지된다.
  const moveBlockUp = (idx: number) => {
    setDoc((d) => {
      if (d[idx]?.kind === 'spacer') return d;
      const targetIdx = (() => {
        for (let i = idx - 1; i >= 0; i--) {
          if (d[i].kind !== 'spacer') return i;
        }
        return -1;
      })();
      if (targetIdx === -1) return d;
      const next = [...d];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  // spacer는 그대로 두고 콘텐츠만 아래쪽의 다음 title/section과 바꿔 시각적 간격을 보존한다.
  // 마지막 콘텐츠 뒤에는 교환 대상이 없으므로 원본 배열을 그대로 반환한다.
  const moveBlockDown = (idx: number) => {
    setDoc((d) => {
      if (d[idx]?.kind === 'spacer') return d;
      const targetIdx = (() => {
        for (let i = idx + 1; i < d.length; i++) {
          if (d[i].kind !== 'spacer') return i;
        }
        return -1;
      })();
      if (targetIdx === -1) return d;
      const next = [...d];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      return next;
    });
  };

  const findPrevContentIdx = useCallback((idx: number) => {
    for (let i = idx - 1; i >= 0; i--) {
      if (doc[i].kind !== 'spacer') return i;
    }
    return -1;
  }, [doc]);

  const findNextContentIdx = useCallback((idx: number) => {
    for (let i = idx + 1; i < doc.length; i++) {
      if (doc[i].kind !== 'spacer') return i;
    }
    return -1;
  }, [doc]);

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
        // spacer/slidebreak는 텍스트 변환에서는 빈 줄로 처리한다.
        return '';
      })
      .join('\n');
  }, [doc]);

  // 콘티 끝에 슬라이드 구분자 추가. 사용자가 ↑↓로 위치 조정 가능.
  // PPT 변환 시 이 마커를 기준으로 슬라이드가 나뉜다.
  const addSlidebreak = () => {
    setDoc((d) => [...d, { kind: 'slidebreak' }]);
    showToast('슬라이드 구분 추가됨');
  };


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

  // 콘티 편집창의 doc 블록 → PPT 슬라이드 배열로 변환.
  // 슬라이드 분리 규칙(자연스러운 순서):
  //   1) title 블록을 만나면 그 자체로 한 슬라이드 (보통 콘티 맨 앞에 들어가서 표지 역할)
  //   2) section 안 빈 줄(Enter 두 번)을 만나면 거기서 자름
  //   3) section 경계마다 자름 (verse 다음에 chorus면 자동으로 다른 슬라이드)
  //   4) [+ 슬라이드 구분] 블록(slidebreak)도 자름
  // spacer 블록은 PPT에서 제외.
  const docToSlides = (): PptSlide[] => {
    const slides: PptSlide[] = [];
    let buf: string[] = [];
    const flush = () => {
      if (buf.length > 0) {
        slides.push({ lines: buf });
        buf = [];
      }
    };
    for (const b of doc) {
      if (b.kind === 'title') {
        // 직전 슬라이드 닫고 제목을 한 줄짜리 슬라이드로 푸시.
        flush();
        const t = b.text.trim();
        if (t) slides.push({ lines: [t] });
      } else if (b.kind === 'section') {
        // 새 section 시작 시 직전 슬라이드 닫음 → section 경계 = 자동 슬라이드 분리.
        flush();
        for (const line of b.body.split('\n')) {
          const trimmed = line.trim();
          // 빈 줄은 사용자의 명시적 슬라이드 구분 신호로 처리한다.
          if (trimmed) buf.push(trimmed);
          else flush();
        }
      } else if (b.kind === 'slidebreak') {
        flush();
      }
      // spacer는 무시
    }
    flush();
    return slides;
  };

  // PPT 다운로드 — lib/pptx.ts 검증을 통과한 섹션 슬라이드만 내보낸다.
  const handleSavePptx = async () => {
    const slides = docToSlides();
    if (slides.length === 0) {
      showToast('PPT로 만들 섹션이 없어요');
      return;
    }
    // 5줄 이상 슬라이드는 자동 축소보다 분리 편집이 예배 콘티 가독성을 지키므로 차단한다.
    const overflow = slides.findIndex((s) => {
      const v = validateSlide(s);
      return !v.ok;
    });
    if (overflow !== -1) {
      showToast(`${overflow + 1}번 슬라이드를 분리해주세요 (4줄 한도)`);
      return;
    }
    try {
      const fname = `contionote-${Date.now()}.pptx`;
      await exportToPptx(slides, pptFont, fname);
      showToast('PPT 다운로드 시작');
    } catch (err: any) {
      showToast(`PPT 생성 실패: ${err.message}`);
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
  // 이미지는 base64 data URL(FileReader)로, PDF는 PDF.js로 첫 페이지 렌더링.
  // blob URL을 쓰지 않는 이유: Strict Mode dev에서 effect가 두 번 실행될 때 revoke 타이밍이 꼬여
  // 깨진 이미지(broken icon)가 보이는 케이스가 있었음. data URL은 revoke 필요 없어 안전.
  useEffect(() => {
    let cancelled = false;

    const fileToDataUrl = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      });

    Promise.all(
      files.map(async (f) => {
        if (f.type.startsWith('image/')) {
          try {
            return await fileToDataUrl(f);
          } catch {
            return '';
          }
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
      if (cancelled) return;
      setThumbs(results);
    });
    return () => {
      cancelled = true;
    };
  }, [files]);

  // 컴포넌트 unmount 시 toast 타이머 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span
            className="caption topbar-meta"
            style={{ color: 'var(--ink-2)' }}
          >
            찬양팀·예배 사역자를 위한 AI 콘티 메이커
          </span>
          {/* 사용법 버튼 — 모바일·데스크톱 모두 노출 (topbar-meta는 모바일에서 숨김 처리) */}
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="사용법 보기"
            className="btn-ghost"
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            사용법
          </button>
        </div>
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
            // 한국어 단어 단위 줄바꿈 — '콘티'처럼 두 글자 단어가 줄 끝에서 잘리지 않게 한다.
            wordBreak: 'keep-all',
          }}
        >
          JPG·PDF 악보를 올리면 가사만 깔끔하게 추출해드립니다.
          <br />
          결과에서 곡 제목과 섹션을 클릭해 콘티를 조립하세요.
        </p>
        {/* 히어로 마스코트 — done 포즈로 차별화 (헤더에 미니 idle, 에디터 빈 상태에 큰 idle 있음) */}
        <div className="mascot-float hero-mascot">
          <Mascot pose="done" size={120} />
        </div>
      </section>

      {/* ----- 메인: 2단 레이아웃 ----- */}
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: '0 32px 56px' }}>
        {/* grid-template-areas로 데스크톱·모바일 순서를 분리:
            데스크톱: 좌측에 1·2·4가 위→아래, 우측에 3 (sticky)
            모바일: 1 → 2 → 3 → 4 자연스러운 흐름 (CSS는 globals.css에서 처리) */}
        <div
          className="two-col"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(360px, 0.85fr) minmax(0, 1.15fr)',
            gridTemplateAreas: `
              "left right"
              "ppt right"
            `,
            gap: 40,
            alignItems: 'start',
          }}
        >
          {/* === 좌측: 업로드 + 추출 결과 (grid-area: left) === */}
          <div className="stack" style={{ ...cssVar('--gap', '32px'), gridArea: 'left' }}>
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
                  // padding: 0은 button 기본 패딩 제거 → 아래 '직접 가사 붙여넣기' div 토글과 X 시작점을 맞춘다.
                  style={{ marginTop: 10, padding: 0 }}
                >
                  <span className="track" />
                  {/* "정확도 우선"과 "(느려짐)"을 wrapper span 하나로 감싸서
                      .toggle의 gap:10px이 둘 사이에 끼어들지 않게 한다. 보조 텍스트는 6px만 띄움. */}
                  <span>
                    정확도 우선
                    <span style={{ marginLeft: 6, color: 'var(--ink-3)' }}>(느려짐)</span>
                  </span>
                </button>

                {files.length > 0 && (
                  <div
                    style={{
                      marginTop: 14,
                      display: 'grid',
                      // auto-fill + 최대 110px로 셀 크기 제한.
                      // auto-fit + 1fr이었을 때 파일 1개면 컨테이너 전체로 늘어나 썸네일이 화면을 다 차지하는 문제 발생.
                      gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 110px))',
                      gap: 12,
                      justifyContent: 'start',
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
                            // 우측에 ✕(곡 삭제) + ✎(제목 수정) 두 버튼 자리 확보
                            padding: '16px 96px 16px 20px',
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
                        {/* 우상단 도구바: ✕(곡 삭제) + ✎(제목 수정).
                            클릭 영역(div role=button) 바깥이라 stopPropagation 불필요. */}
                        <button
                          onClick={() => removeSong(songIdx)}
                          aria-label="곡 삭제"
                          title="곡 삭제 (콘티 블록도 함께)"
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 50,
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'var(--paper)',
                            border: '1px solid var(--rule)',
                            color: 'var(--ink-3)',
                            cursor: 'pointer',
                            fontSize: 14,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✕
                        </button>
                        <button
                          onClick={() => startTitleEdit(songIdx, song.title)}
                          aria-label="제목 수정"
                          title="제목 수정"
                          style={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            width: 36,
                            height: 36,
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
                        // 섹션 카드는 클릭 시 콘티에 추가되므로, 위/아래 이동·수정 버튼은
                        // e.stopPropagation으로 카드 클릭과 분리한다.
                        const canSecUp = secIdx > 0;
                        const canSecDown = secIdx < song.sections.length - 1;
                        return (
                          <div key={secIdx} style={{ position: 'relative' }}>
                            <article
                              className="section-card"
                              onClick={() => insertSection(sec, songIdx, secIdx)}
                              style={{ paddingRight: 128 }}
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
                            {/* 우측 상단 도구바 — [↑][↓][✎] 가로 배치.
                                article 밖 wrapper 안에 절대 배치해 카드 클릭과 분리. */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canSecUp) moveSectionInSong(songIdx, secIdx, 'up');
                              }}
                              disabled={!canSecUp}
                              aria-label="위로 이동"
                              title="위로 이동"
                              style={{
                                position: 'absolute',
                                top: 10,
                                right: 92,
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: 'var(--paper)',
                                border: '1px solid var(--rule)',
                                color: 'var(--ink-2)',
                                cursor: canSecUp ? 'pointer' : 'not-allowed',
                                opacity: canSecUp ? 1 : 0.3,
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              ↑
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (canSecDown) moveSectionInSong(songIdx, secIdx, 'down');
                              }}
                              disabled={!canSecDown}
                              aria-label="아래로 이동"
                              title="아래로 이동"
                              style={{
                                position: 'absolute',
                                top: 10,
                                right: 52,
                                width: 32,
                                height: 32,
                                borderRadius: '50%',
                                background: 'var(--paper)',
                                border: '1px solid var(--rule)',
                                color: 'var(--ink-2)',
                                cursor: canSecDown ? 'pointer' : 'not-allowed',
                                opacity: canSecDown ? 1 : 0.3,
                                fontSize: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              ↓
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startCardEdit(songIdx, secIdx, sec);
                              }}
                              aria-label="섹션 수정"
                              title="섹션 수정"
                              style={{
                                position: 'absolute',
                                top: 10,
                                right: 12,
                                width: 32,
                                height: 32,
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

          <div className="stack" style={{ ...cssVar('--gap', '32px'), gridArea: 'right' }}>
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
                  {/* 사용자 안내: contentEditable 안에서 Enter 두 번이면 빈 줄 → PPT에서 슬라이드 분리 */}
                  <div
                    className="caption"
                    style={{ color: 'var(--ink-3)', marginTop: 4, fontSize: 12 }}
                  >
                    가사 안에서 <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Enter</span>로 빈 줄을 두면 PPT 슬라이드가 거기서 나뉩니다.
                  </div>
                </div>
                {!isEmpty && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* 슬라이드 구분 추가 — 콘티 끝에 점선 분리자가 들어가고, ↑↓로 위치 조정 가능 */}
                    <button
                      className="btn-ghost"
                      onClick={addSlidebreak}
                      title="여기 위치에 슬라이드 분리자 추가 (PPT에서 페이지 구분)"
                    >
                      + 슬라이드 구분
                    </button>
                    <button className="btn-ghost" onClick={onClear}>
                      전체 비우기
                    </button>
                  </div>
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
                        onMoveUp={() => moveBlockUp(i)}
                        onMoveDown={() => moveBlockDown(i)}
                        canMoveUp={findPrevContentIdx(i) !== -1}
                        canMoveDown={findNextContentIdx(i) !== -1}
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

          {/* === 4. PPT 제작 (grid-area: ppt) ===
              데스크톱: 좌측 컬럼 하단 영역에 자리.
              모바일: 1·2·3 다음 마지막 순서로 자연스럽게 흐름. */}
          <div
            className="stack"
            style={{ ...cssVar('--gap', '16px'), gridArea: 'ppt' }}
          >
            <div className="label">4. PPT 제작</div>

            {/* 사용자 가이드 — 슬라이드당 가사 양 권장 + 분리 방법. */}
            <div className="caption" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
              한 슬라이드는 <span style={{ color: 'var(--ink)', fontWeight: 600 }}>2~3줄</span>일 때 가장 깔끔하게 만들어집니다 (최대 4줄).
              <br />
              콘티 편집에서 가사 안 <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>Enter</span>로 빈 줄을 두면 거기서 슬라이드가 나뉘어요.
            </div>

            {/* 폰트 선택 + 다운로드 버튼 한 줄 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={pptFont}
                onChange={(e) => setPptFont(e.target.value as PptFont)}
                aria-label="PPT 폰트 선택"
                style={{
                  padding: '10px 14px',
                  border: '1px solid var(--rule)',
                  borderRadius: 2,
                  background: 'var(--paper)',
                  color: 'var(--ink)',
                  fontFamily: 'var(--sans)',
                  fontSize: 14,
                }}
              >
                {(Object.keys(PPT_FONT_LABELS) as PptFont[]).map((f) => (
                  <option key={f} value={f}>
                    {PPT_FONT_LABELS[f]}
                  </option>
                ))}
              </select>
              <button className="btn-text" onClick={handleSavePptx} disabled={isEmpty}>
                PPT 다운로드 (.pptx)
              </button>
            </div>

            {/* 슬라이드 미리보기 — 각 섹션 블록 = 한 슬라이드.
                한도 초과 시 빨강 표시. */}
            {!isEmpty && (
              <div className="stack" style={cssVar('--gap', '8px')}>
                {docToSlides().map((slide, i) => {
                  const v = validateSlide(slide);
                  const isOverflow = !v.ok;
                  const slideMeta = 'fontSize' in v
                    ? `${v.lineCount}줄 · ${v.fontSize}pt`
                    : v.reason === 'too-many-lines'
                      ? `${v.lineCount}줄 · 한도 초과 (분리 필요)`
                      : `한 줄이 너무 깁니다 (줄당 최대 ${v.maxCharsPerLine}자)`;
                  return (
                    <div
                      key={i}
                      style={{
                        border:
                          '1px solid ' + (isOverflow ? 'var(--accent)' : 'var(--rule)'),
                        borderLeft:
                          '2px solid ' + (isOverflow ? 'var(--accent)' : 'var(--ink)'),
                        padding: '12px 14px',
                        borderRadius: 2,
                        background: 'color-mix(in oklab, var(--paper) 70%, white)',
                      }}
                    >
                      <div
                        className="mono"
                        style={{
                          marginBottom: 6,
                          color: isOverflow ? 'var(--accent-ink)' : 'var(--ink-3)',
                        }}
                      >
                        슬라이드 {i + 1} · {slideMeta}
                      </div>
                      <div
                        className="lyric"
                        style={{
                          fontSize: 13.5,
                          lineHeight: 1.5,
                          color: isOverflow ? 'var(--accent-ink)' : 'var(--ink-2)',
                        }}
                      >
                        {slide.lines.length === 0 ? (
                          <span style={{ color: 'var(--ink-3)' }}>(빈 슬라이드)</span>
                        ) : (
                          slide.lines.map((l, j) => <div key={j}>{l}</div>)
                        )}
                      </div>
                      {isOverflow && (
                        <div
                          className="caption"
                          style={{ marginTop: 6, color: 'var(--accent-ink)' }}
                        >
                          한 슬라이드 최대 4줄 · 줄당 최대 17~32자(줄수에 따라). 콘티
                          편집에서 분리해주세요.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isEmpty && (
              <div className="caption" style={{ color: 'var(--ink-3)' }}>
                콘티 편집에 섹션을 추가하면 여기에 슬라이드 미리보기가 나타납니다.
              </div>
            )}
          </div>
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

      {/* 도움말 모달 — 헤더 [사용법] 버튼으로 열림. ESC/배경 클릭/✕로 닫힘. */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// ============== 도움말 모달 ==============
// USAGE.md의 핵심 내용을 React 컴포넌트로 직접 작성. 외부 마크다운 파서 의존성 없이 정적 가이드.
function HelpModal({ onClose }: { onClose: () => void }) {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="콘티노트 사용법"
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
          maxWidth: 680,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          borderRadius: 4,
          padding: '32px 32px 24px',
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

        <h2 className="h-song" style={{ margin: '0 0 6px', fontSize: 26 }}>
          콘티노트 사용법
        </h2>
        <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 24 }}>
          찬양팀·예배 사역자를 위한 AI 콘티 메이커
        </p>

        <Section title="빠른 시작 (5단계)">
          <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>악보 업로드 (JPG/PNG/PDF, 최대 12개)</li>
            <li><b>가사 추출하기</b> 클릭</li>
            <li>좌측 결과에서 곡 제목 + 섹션 카드 클릭 → 우측 콘티에 추가</li>
            <li>가사 안에서 <b>Enter 두 번</b>(빈 줄)으로 슬라이드 분리</li>
            <li><b>PPT 다운로드 (.pptx)</b></li>
          </ol>
        </Section>

        <Section title="슬라이드 분리 4가지 방법">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>Enter 두 번</b>(가장 직관적) — 가사 안에서 빈 줄 만들면 거기서 분리. 백스페이스로 빈 줄 지우면 즉시 합쳐짐.
            </li>
            <li><b>섹션 경계</b> — Verse 다음에 후렴이면 자동 분리</li>
            <li><b>+ 슬라이드 구분</b> 버튼 — 콘티 헤더에서 명시적 분리자 추가</li>
            <li><b>합치기</b> — Enter 한 번(줄바꿈)만 하면 같은 슬라이드 안 여러 줄</li>
          </ul>
        </Section>

        <Section title="글자수 / 사이즈 한도 (자동 적용)">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-2)' }}>줄 수</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-2)' }}>폰트 사이즈</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-2)' }}>줄당 글자(띄어쓰기 포함)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: '6px 4px' }}>1줄</td><td style={{ padding: '6px 4px' }}>64pt</td><td style={{ padding: '6px 4px' }}>17자</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>2줄</td><td style={{ padding: '6px 4px' }}>54pt</td><td style={{ padding: '6px 4px' }}>21자</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>3줄</td><td style={{ padding: '6px 4px' }}>44pt</td><td style={{ padding: '6px 4px' }}>26자</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>4줄</td><td style={{ padding: '6px 4px' }}>36pt</td><td style={{ padding: '6px 4px' }}>32자</td></tr>
              <tr><td style={{ padding: '6px 4px', color: 'var(--accent-ink)' }}>5줄+</td><td colSpan={2} style={{ padding: '6px 4px', color: 'var(--accent-ink)' }}>분리 필요 (빨강 알림)</td></tr>
            </tbody>
          </table>
          <p className="caption" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
            한도 통과 후에도 미세하게 박스 넘으면 PowerPoint가 자동으로 살짝 축소해서 한 줄에 맞춥니다.
          </p>
        </Section>

        <Section title="자주 묻는 질문">
          <FAQ q="정확도 우선과 기본 모드 차이?" a="정확도 ON은 PDF를 고화질(scale 2)로 변환하고 AI가 더 신중히 동작. 흐릿한 PDF에서 효과적이고 시간은 살짝 더 걸립니다." />
          <FAQ q="가사가 빠지거나 잘못 추출됐어요." a="정확도 우선 토글 켜고 다시 추출. 그래도 안 되면 ✎ 버튼으로 직접 수정." />
          <FAQ q="곡 카드의 ✕로 곡을 지우면 콘티에도 영향?" a="네, 그 곡과 연결된 콘티 블록도 함께 삭제됩니다. confirm으로 미리 확인합니다." />
          <FAQ q="PPT 폰트가 다른 걸로 보여요." a="시스템에 그 폰트가 설치돼 있어야 정확히 표시됩니다. 본명조 Pro(Noto Serif KR)가 호환성이 가장 좋아 추천." />
        </Section>

        <Section title="다른 다운로드 형식">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li><b>TXT</b> — 콘티 텍스트만 (제목은 ━━━ 강조)</li>
            <li><b>DOCX</b> — 워드 문서 (제목 가운데 헤딩)</li>
            <li><b>클립보드 복사</b> — 콘티 전체 텍스트</li>
          </ul>
        </Section>

        <p className="caption" style={{ color: 'var(--ink-3)', textAlign: 'center', marginTop: 24 }}>
          전체 가이드는 GitHub의 USAGE.md에서 볼 수 있어요.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h3
        className="label"
        style={{ marginBottom: 10, fontSize: 13, color: 'var(--ink)' }}
      >
        {title}
      </h3>
      <div style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Q. {q}</div>
      <div style={{ color: 'var(--ink-2)' }}>{a}</div>
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
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  block: Block;
  onUpdate: (next: Block) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  // 모든 contentEditable 영역은 비제어 — 외부 prop이 진짜 다를 때만 동기화
  const editableRef = useRef<HTMLElement | null>(null);
  const [isSectionHovered, setIsSectionHovered] = useState(false);

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

  if (block.kind === 'slidebreak') {
    // 슬라이드 구분자 — PPT에서 여기를 기준으로 페이지가 나뉜다.
    // 시각적으로 점선 + 가운데 라벨 + 우측 [↑][↓][✕] 도구바.
    return (
      <div
        style={{
          position: 'relative',
          margin: '12px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingRight: 96,
        }}
      >
        <div style={{ flex: 1, height: 1, borderTop: '1px dashed var(--accent)' }} />
        <div
          className="mono"
          style={{
            color: 'var(--accent-ink)',
            whiteSpace: 'nowrap',
            fontSize: 10.5,
            letterSpacing: '0.18em',
          }}
        >
          ─ 슬라이드 구분 ─
        </div>
        <div style={{ flex: 1, height: 1, borderTop: '1px dashed var(--accent)' }} />
        <button
          onClick={() => canMoveUp && onMoveUp()}
          disabled={!canMoveUp}
          aria-label="위로 이동"
          title="위로 이동"
          style={{
            position: 'absolute',
            top: '50%',
            right: 68,
            transform: 'translateY(-50%)',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-2)',
            cursor: canMoveUp ? 'pointer' : 'not-allowed',
            opacity: canMoveUp ? 1 : 0.3,
            fontSize: 11,
          }}
        >
          ↑
        </button>
        <button
          onClick={() => canMoveDown && onMoveDown()}
          disabled={!canMoveDown}
          aria-label="아래로 이동"
          title="아래로 이동"
          style={{
            position: 'absolute',
            top: '50%',
            right: 38,
            transform: 'translateY(-50%)',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-2)',
            cursor: canMoveDown ? 'pointer' : 'not-allowed',
            opacity: canMoveDown ? 1 : 0.3,
            fontSize: 11,
          }}
        >
          ↓
        </button>
        <button
          onClick={onRemove}
          aria-label="구분 제거"
          title="구분 제거"
          style={{
            position: 'absolute',
            top: '50%',
            right: 8,
            transform: 'translateY(-50%)',
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--paper)',
            border: '1px solid var(--rule)',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    );
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
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="위로 이동"
          title="위로 이동"
          style={{
            position: 'absolute',
            top: 0,
            right: 58,
            background: 'none',
            border: '1px solid var(--rule)',
            color: 'var(--ink-3)',
            cursor: canMoveUp ? 'pointer' : 'not-allowed',
            fontSize: 12,
            padding: '2px 7px',
            borderRadius: 99,
            opacity: canMoveUp ? 1 : 0.3,
          }}
        >
          ↑
        </button>
        <button
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="아래로 이동"
          title="아래로 이동"
          style={{
            position: 'absolute',
            top: 0,
            right: 30,
            background: 'none',
            border: '1px solid var(--rule)',
            color: 'var(--ink-3)',
            cursor: canMoveDown ? 'pointer' : 'not-allowed',
            fontSize: 12,
            padding: '2px 7px',
            borderRadius: 99,
            opacity: canMoveDown ? 1 : 0.3,
          }}
        >
          ↓
        </button>
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
  // globals.css를 건드리지 않기 위해 이동 버튼 hover 노출은 로컬 state로 처리한다.
  // 제거 버튼의 기존 hover UX와 맞추면서 이번 변경 범위를 page.tsx 안에 제한한다.
  return (
    <div
      style={{ position: 'relative', marginBottom: 14 }}
      className="editor-section-block"
      onMouseEnter={() => setIsSectionHovered(true)}
      onMouseLeave={() => setIsSectionHovered(false)}
    >
      <button
        onClick={onMoveUp}
        disabled={!canMoveUp}
        aria-label="위로 이동"
        title="위로 이동"
        className="editor-section-move"
        style={{
          position: 'absolute',
          top: -2,
          right: 88,
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          color: 'var(--ink-3)',
          cursor: canMoveUp ? 'pointer' : 'not-allowed',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 99,
          opacity: isSectionHovered ? (canMoveUp ? 1 : 0.3) : 0,
          transition: 'opacity .15s ease',
        }}
      >
        ↑
      </button>
      <button
        onClick={onMoveDown}
        disabled={!canMoveDown}
        aria-label="아래로 이동"
        title="아래로 이동"
        className="editor-section-move"
        style={{
          position: 'absolute',
          top: -2,
          right: 54,
          background: 'var(--paper)',
          border: '1px solid var(--rule)',
          color: 'var(--ink-3)',
          cursor: canMoveDown ? 'pointer' : 'not-allowed',
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 99,
          opacity: isSectionHovered ? (canMoveDown ? 1 : 0.3) : 0,
          transition: 'opacity .15s ease',
        }}
      >
        ↓
      </button>
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
        // onInput으로 실시간 반영 — Enter로 만든 빈 줄을 백스페이스로 지우자마자
        // PPT 미리보기가 즉시 합쳐지도록(역방향 호환). useEffect의 동기화 로직이
        // innerText === expected 비교로 무한 루프를 막아준다.
        onInput={(e) => onUpdate({ ...block, body: (e.currentTarget as HTMLDivElement).innerText })}
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
