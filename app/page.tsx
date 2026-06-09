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
// dnd-kit은 Phase 3에서 인라인 2번 영역 dnd가 사라지면서 더 이상 page.tsx에서 안 쓰임.
// Phase 4에서 ExtractedSection 안 섹션 정렬이 필요해지면 거기서 직접 import 한다.
import { pdfToImages, fileToBase64, pdfFirstPageThumb } from '@/lib/pdf';
import { exportToDocx } from '@/lib/docx';
import { encodeStateToHash, decodeHashToState } from '@/lib/url-sync';
import { recordCorrection, buildCorrectionHint } from '@/lib/ocr-learning';
import {
  formatSavedAt,
  type SavedSet,
} from '@/lib/conti-storage';
import {
  listSetsAsync,
  saveSetAsync,
  removeSetAsync,
  migrateLocalToCloud,
} from '@/lib/conti-cloud';
import { type ChurchTemplate } from '@/lib/template-storage';
import {
  listTemplatesAsync,
  saveTemplateAsync,
  removeTemplateAsync,
  migrateTemplatesToCloud,
} from '@/lib/template-cloud';
import { type LibrarySong } from '@/lib/song-library';
import {
  listLibraryAsync,
  addToLibraryAsync,
  removeFromLibraryAsync,
  migrateSongLibraryToCloud,
} from '@/lib/song-library-cloud';
import {
  exportToPptx,
  validateSlide,
  PPT_FONT_LABELS,
  PPT_THEME_LABELS,
  type PptFont,
  type PptCopyrightInfo,
  type PptSlide,
  type PptTheme,
  type PptVAlign,
} from '@/lib/pptx';
import { buildPlainSlidesTxt, buildOpenSongXml, downloadText } from '@/lib/export-formats';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Song, Section, SectionType } from '@/lib/types';
import Mascot from '@/components/Mascot';
// SectionChip은 Phase 3에서 ExtractedSection 컴포넌트 내부로 이관됨 — page.tsx에선 import 안 함.
import Header, { type DesignTheme } from '@/components/Header';
import UploadSection from '@/components/UploadSection';
import ExtractedSection from '@/components/ExtractedSection';
import EditorSection from '@/components/EditorSection';
import PptSection from '@/components/PptSection';
import PreviewModal from '@/components/PreviewModal';
import {
  buildSlidesFromText,
  songToText,
  sectionToText,
  appendText,
  docHasSongTitle,
  memoToText,
} from '@/lib/text-doc';

// 편집창 블록 모델
// title:      곡 제목 (큰 헤더)
// section:    섹션 칩 + 편집 가능한 가사 본문
// spacer:     블록 사이 빈 줄 (시각적 호흡)
// slidebreak: PPT 슬라이드 분리자. 한 콘티 안에서 슬라이드 단위를 사용자가 자유롭게 자른다.
// memo:       광고·기도제목·축도자 같은 자유 텍스트 슬라이드
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
  | { kind: 'slidebreak' }
  | { kind: 'memo'; body: string };

// CSS 커스텀 프로퍼티(--gap)를 React style에 쓰기 위한 헬퍼
// TS가 기본 CSSProperties에 -- 시작 키를 안 받으므로 캐스팅 필요
const cssVar = (name: string, value: string): React.CSSProperties =>
  ({ [name]: value } as React.CSSProperties);

// PPT 미리보기 배경 — lib/pptx.ts의 실제 테마 키와 맞춘다.
// meadow/cross/bible은 public/에 다운로드된 무료 저작권 이미지(Unsplash) 사용.
const themeBackground = (theme: PptTheme): string => {
  switch (theme) {
    case 'black':    return '#000000';
    case 'white':    return '#FFFFFF';
    case 'paper':    return '#FAF5EC';
    case 'meadow':   return "url('/pptx-bg-meadow.jpg') center/cover";
    case 'cross':    return "url('/pptx-bg-cross.jpg') center/cover";
    case 'bible':    return "url('/pptx-bg-bible.jpg') center/cover";
  }
};

const themeText = (theme: PptTheme): string =>
  theme === 'black' ? '#FFFFFF' : '#1F1B16';

// type별 기본 표시 이름 (한국 찬양팀 관행 기준)
const TYPE_BASE_LABEL: Record<SectionType, string> = {
  verse: 'Verse',
  prechorus: 'Pre-Chorus',
  chorus: '후렴',
  bridge: 'Bridge',
  ending: 'Ending',
  intro: 'Intro',
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
  // Phase 3: 콘티는 단일 string으로. 빈 줄=슬라이드 분리, # 제목, > 메모 접두사.
  const [text, setText] = useState<string>('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progressStep, setProgressStep] = useState<0 | 1 | 2 | 3>(0);
  const [toast, setToast] = useState('');
  const [dragging, setDragging] = useState(false);
  // 정확도 우선 모드는 서버 분석 프롬프트를 더 보수적으로 쓰게 하므로, 업로드/붙여넣기 요청에 함께 전달한다.
  const [accuracyMode, setAccuracyMode] = useState(false);
  // PPT 제작 폰트 선택 — lib/pptx.ts의 지원 폰트 타입과 동기화한다.
  // 기본 폰트는 '본명조 Pro' — 한국 CCM PPT에서 가장 모던하고 자연스럽게 어울림.
  const [pptFont, setPptFont] = useState<PptFont>('noto-serif-kr');
  // PPT 배경 테마 — 어두운 예배실 기본은 검정.
  const [pptTheme, setPptTheme] = useState<PptTheme>('black');
  // PPT 세로 정렬 — 기본은 가운데(기존 동작). 상단/하단 선택 시 미리보기·PPT 동시 적용.
  const [pptVAlign, setPptVAlign] = useState<PptVAlign>('middle');
  // 한국 교회 PPT 관행상 저작권 슬라이드는 기본으로 포함한다.
  const [ccliNumber, setCcliNumber] = useState('');
  const [licenseLabel, setLicenseLabel] = useState('');
  // 사용자 요청: 기본은 OFF. 필요한 사람만 토글로 켬.
  const [includeCopyright, setIncludeCopyright] = useState(false);
  // 외부 도구 export(Plain Slides / OpenSong)는 일반 사용자에겐 과해서 숨겨둠.
  // ProPresenter / EasyWorship / OpenLP 사용자가 필요할 때만 펼침.
  const [showExternalExports, setShowExternalExports] = useState(false);
  // 도움말 모달 — 헤더의 [사용법] 버튼으로 토글
  const [showHelp, setShowHelp] = useState(false);
  // 헤더 메뉴 드롭다운 (콘티 모음/곡 라이브러리/템플릿) — 토스 UI 스타일
  const [showMenu, setShowMenu] = useState(false);
  // 콘티 세트 저장/불러오기 모달
  const [showSets, setShowSets] = useState(false);
  // 교회 템플릿 저장/적용 모달
  const [showTemplates, setShowTemplates] = useState(false);
  // 곡 라이브러리 모달 — 추출된 곡을 자동 누적해 재사용한다.
  const [showLibrary, setShowLibrary] = useState(false);
  // Supabase 로그인 상태 — null이면 비로그인. supabase 미설정 환경에서도 null 유지.
  const [authUser, setAuthUser] = useState<User | null>(null);
  // 로그인/로그아웃 진행 중 표시 — 버튼 중복 클릭 방지.
  const [authBusy, setAuthBusy] = useState(false);
  // 디자인 시스템 — wanted(기본) ↔ paper. localStorage에 저장해 새로고침해도 유지.
  // 사용자 요청(2026-05-16): Wanted를 메인으로, 종이톤을 옵션으로.
  const [designTheme, setDesignTheme] = useState<DesignTheme>('wanted');
  // 04 PPT 만들기의 "전체 미리보기" 모달 상태
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorBodyRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // undo/redo 스냅샷도 text 모델로 — Block[] → string 한 줄짜리 변경
  const undoStackRef = useRef<{ songs: Song[]; text: string }[]>([]);
  const redoStackRef = useRef<{ songs: Song[]; text: string }[]>([]);
  const lastSnapshotRef = useRef<string>('');
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMemoFocusRef = useRef(false);
  // 추출 시점의 원본 이미지(base64) 보관 — 오타 검토 시 verify-lyrics에 다시 보내야 함.
  // 사용자가 파일을 다시 업로드하지 않게 메모리에 캐싱.
  const extractedImagesRef = useRef<{ data: string; mimeType: string }[]>([]);

  // 오타 검토 결과 — { songIdx: { sectionIdx: ["주꼐", "사 랑하다", ...] } }
  // localStorage에 추출된 곡 제목 시그니처 기반으로 저장.
  const [suspectMap, setSuspectMap] = useState<
    Record<number, Record<number, string[]>>
  >({});
  const [verifying, setVerifying] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // ----- Supabase 로그인 상태 구독 -----
  // 마운트 시 현재 세션 1회 조회 + auth state 변경(SIGNED_IN/OUT/TOKEN_REFRESHED) 구독.
  // supabase 미설정 환경(env 비어있음)에서는 클라이언트가 null이라 그냥 비로그인 상태로 동작.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthUser(data.user ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthUser(session?.user ?? null);
      // SIGNED_IN 이벤트 + localStorage에 데이터가 있으면 세 종류 모두 클라우드로 자동 업로드.
      // 클라우드가 비어있을 때만 옮겨 덮어쓰기 방지(로직은 각 cloud 모듈 안).
      // Promise.all로 동시 처리해 첫 로그인 후 즉시 화면이 클라우드 데이터로 갱신되게 한다.
      if (event === 'SIGNED_IN' && session?.user) {
        Promise.all([
          migrateLocalToCloud(),
          migrateSongLibraryToCloud(),
          migrateTemplatesToCloud(),
        ])
          .then(([conti, songs, templates]) => {
            const total = conti.migrated + songs.migrated + templates.migrated;
            if (total > 0) {
              showToast(
                `이전 데이터를 클라우드로 옮겼어요 — 콘티 ${conti.migrated} / 곡 ${songs.migrated} / 템플릿 ${templates.migrated}`
              );
            }
          })
          .catch((err) => console.error('[migrate] 실패:', err));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [showToast]);

  // 저장된 디자인 테마 복원 (mount 시 1회). 이후 변경은 아래 effect가 자동 동기화.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('conti-design-theme');
      if (saved === 'wanted' || saved === 'paper') {
        setDesignTheme(saved);
      }
    } catch {
      /* localStorage 차단 환경 무시 */
    }
  }, []);

  // 데스크탑 ↔ 모바일 라우팅은 middleware.ts(서버 사이드, 쿠키 기반)가 담당.
  // 여기 client useEffect에서 redirect를 같이 만지면 middleware와 핑퐁 루프가 발생해서 제거함.
  // 사용자가 강제 전환할 때는 <a href="/?view=desktop"> 또는 ?view=mobile 로 진입 → middleware가 쿠키 저장.

  // designTheme 변할 때 <html data-theme> 갱신 + localStorage 저장.
  // CSS [data-theme="wanted"] selector가 토큰을 wanted 세트로 스왑한다.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = designTheme;
    try {
      window.localStorage.setItem('conti-design-theme', designTheme);
    } catch {
      /* 무시 */
    }
  }, [designTheme]);

  // OAuth 콜백 라우트가 ?auth_error=... 로 보내면 사용자에게 안내 토스트만 띄운다.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    if (!err) return;
    showToast(
      err === 'no_code'
        ? '로그인 응답이 비어 있어요. 다시 시도해주세요.'
        : '로그인에 실패했어요. 다시 시도해주세요.'
    );
    // URL에서 ?auth_error 파라미터를 제거 — 새로고침 시 토스트가 또 뜨는 걸 방지.
    const cleaned = window.location.pathname + window.location.hash;
    window.history.replaceState({}, '', cleaned);
  }, []);

  // Google OAuth 시작. redirectTo는 OAuth 성공 후 Supabase가 사용자를 다시 보낼 우리 콜백 URL.
  // window.location.origin으로 잡아 로컬(localhost:3000)/프로덕션(vercel) 양쪽 자동 처리.
  const handleSignIn = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      showToast('로그인 기능이 설정되지 않았어요');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      console.error('signIn 실패:', error.message);
      showToast('로그인 시작에 실패했어요');
      setAuthBusy(false);
    }
    // 성공 시 브라우저가 Google로 리다이렉트되므로 setAuthBusy(false)는 굳이 호출하지 않는다.
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signOut();
    setAuthBusy(false);
    if (error) {
      console.error('signOut 실패:', error.message);
      showToast('로그아웃에 실패했어요');
      return;
    }
    showToast('로그아웃 됐어요');
  };

  useEffect(() => {
    const snapshot = JSON.stringify({ songs, text });
    if (snapshot === lastSnapshotRef.current) return;
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    snapshotTimerRef.current = setTimeout(() => {
      if (snapshot === lastSnapshotRef.current) return;
      if (lastSnapshotRef.current) {
        undoStackRef.current.push(JSON.parse(lastSnapshotRef.current));
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        redoStackRef.current = [];
      }
      lastSnapshotRef.current = snapshot;
    }, 300);
    return () => {
      if (snapshotTimerRef.current) {
        clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
    };
  }, [songs, text]);

  const handleUndo = useCallback(() => {
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    const snapshot = JSON.stringify({ songs, text });
    if (snapshot !== lastSnapshotRef.current && lastSnapshotRef.current) {
      undoStackRef.current.push(JSON.parse(lastSnapshotRef.current));
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      lastSnapshotRef.current = snapshot;
    }
    const prev = undoStackRef.current.pop();
    if (!prev) {
      showToast('되돌릴 게 없어요');
      return;
    }
    redoStackRef.current.push({ songs, text });
    if (redoStackRef.current.length > 50) redoStackRef.current.shift();
    setSongs(prev.songs);
    setText(prev.text);
    lastSnapshotRef.current = JSON.stringify(prev);
    showToast('되돌리기');
  }, [text, showToast, songs]);

  const handleRedo = useCallback(() => {
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    const next = redoStackRef.current.pop();
    if (!next) {
      showToast('다시 실행할 게 없어요');
      return;
    }
    undoStackRef.current.push({ songs, text });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
    setSongs(next.songs);
    setText(next.text);
    lastSnapshotRef.current = JSON.stringify(next);
    showToast('다시 실행');
  }, [text, showToast, songs]);

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
      setProgressStep(1);
      setLoadingMsg('가사를 분석 중');
      try {
        setProgressStep(3);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // OCR 수정 이력은 서버가 활용할 수 있도록 힌트로만 전달한다.
          body: JSON.stringify({ text: pasted.trim(), accuracyMode, hint: buildCorrectionHint() }),
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
          // confirmed:false → "나누기 모드"로 시작. 사용자가 빈 줄로 묶음을 직접 나눈 뒤 확정한다.
          setSongs((prev) => [...prev, ...data.songs.map((s: Song) => ({ ...s, confirmed: false }))]);
          // 라이브러리 누적은 fire-and-forget — 사용자가 결과를 보는 흐름은 막지 않는다.
          // 실패 시 console에 남고 토스트는 별도로 안 띄움(부수 효과라 덜 중요).
          void addToLibraryAsync(data.songs);
          setPasted('');
          showToast(`${data.songs.length}곡 추출됨`);
        }
      } catch (err: any) {
        showToast(`오류: ${err.message}`);
      } finally {
        setExtracting(false);
        setProgressStep(0);
      }
      return;
    }

    if (files.length === 0) {
      showToast('악보 파일을 올려주세요');
      return;
    }

    setExtracting(true);
    setProgressStep(1);
    setLoadingMsg('파일을 준비 중');

    try {
      // PDF는 PDF.js로 페이지별 PNG 변환, 이미지는 base64로 직접 변환
      const images: { data: string; mimeType: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.type === 'application/pdf') {
          setProgressStep(2);
          setLoadingMsg(`PDF 변환 중 (${i + 1}/${files.length})`);
          // 정확도 모드에서는 고해상도 렌더링이 OCR 판독 품질에 직접 영향을 준다.
          // 기본 모드는 lib/pdf.ts의 동적 scale 분기를 유지해 속도와 품질 균형을 맡긴다.
          const pages = await pdfToImages(f, accuracyMode ? 2 : undefined);
          for (const p of pages) images.push({ data: p.data, mimeType: p.mimeType });
        } else if (f.type.startsWith('image/')) {
          setProgressStep(2);
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
      setProgressStep(3);
      setLoadingMsg(`AI가 가사 추출 중 (${images.length}장)`);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 이미지 분석도 사용자가 고른 정확도 모드와 OCR 수정 힌트를 서버에서 판단할 수 있게 함께 보낸다.
        body: JSON.stringify({ images, accuracyMode, hint: buildCorrectionHint() }),
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
        // confirmed:false → "나누기 모드"로 시작 (사용자가 직접 묶음을 나눈 뒤 확정).
        setSongs((prev) => [...prev, ...data.songs.map((s: Song) => ({ ...s, confirmed: false }))]);
        // 라이브러리 누적은 fire-and-forget — 결과 표시를 막지 않는다.
        void addToLibraryAsync(data.songs);
        // 오타 검토 시 다시 보내야 하므로 추출 시점 이미지를 메모리에 캐싱.
        extractedImagesRef.current = images;
        // 새 추출 → 이전 검토 결과 비움.
        setSuspectMap({});
        // 추출 성공 → 업로드 영역의 악보 이미지를 비운다.
        // 안 비우면 다음 드롭이 기존 파일에 더해져(append) 같은 악보를 또 중복으로 읽음.
        // (오타 검토용 원본은 extractedImagesRef에 따로 있어 영향 없음)
        setFiles([]);
        showToast(`${data.songs.length}곡 추출됨`);
      }
    } catch (err: any) {
      showToast(`오류: ${err.message}`);
    } finally {
      setExtracting(false);
      setProgressStep(0);
    }
  };

  // ----- 오타 검토 (전체) — 추출 시점 이미지 + 현재 songs를 verify-lyrics에 보냄 -----
  const handleVerifyLyrics = async () => {
    if (songs.length === 0) {
      showToast('검토할 곡이 없어요');
      return;
    }
    if (extractedImagesRef.current.length === 0) {
      showToast('원본 이미지가 없어요. 가사를 다시 추출해주세요.');
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch('/api/verify-lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: extractedImagesRef.current,
          songs: songs.map((s) => ({
            title: s.title,
            sections: s.sections.map((sec) => ({ label: sec.label, text: sec.text })),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '검토 실패');

      // 응답 → { songIdx → { sectionIdx → suspects[] } } 형태로 변환
      const map: Record<number, Record<number, string[]>> = {};
      let totalCount = 0;
      for (const song of data.songs ?? []) {
        const songIdx = Number(song.songIdx);
        if (!Number.isInteger(songIdx)) continue;
        const secMap: Record<number, string[]> = {};
        for (const sec of song.sections ?? []) {
          const secIdx = Number(sec.sectionIdx);
          const suspects = Array.isArray(sec.suspects)
            ? sec.suspects.filter((s: unknown) => typeof s === 'string' && s.trim())
            : [];
          if (Number.isInteger(secIdx) && suspects.length > 0) {
            secMap[secIdx] = suspects;
            totalCount += suspects.length;
          }
        }
        if (Object.keys(secMap).length > 0) map[songIdx] = secMap;
      }
      setSuspectMap(map);
      if (totalCount === 0) {
        showToast('의심 부분이 없어요 — 추출 결과 깔끔합니다');
      } else {
        showToast(`${totalCount}건 의심 — 빨간 점이 있는 섹션 확인해주세요`);
      }
    } catch (err: any) {
      showToast(`검토 실패: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  // 검토 결과가 사용자 수정으로 더 이상 본문에 없으면 자동으로 정리.
  // (songs.sections[].text가 바뀔 때마다 실행)
  useEffect(() => {
    setSuspectMap((prev) => {
      let dirty = false;
      const next: Record<number, Record<number, string[]>> = {};
      for (const [songIdxStr, secMap] of Object.entries(prev)) {
        const songIdx = Number(songIdxStr);
        const song = songs[songIdx];
        if (!song) {
          dirty = true;
          continue;
        }
        const nextSecMap: Record<number, string[]> = {};
        for (const [secIdxStr, suspects] of Object.entries(secMap)) {
          const secIdx = Number(secIdxStr);
          const sec = song.sections[secIdx];
          if (!sec) {
            dirty = true;
            continue;
          }
          const remaining = suspects.filter((sus) => sec.text.includes(sus));
          if (remaining.length !== suspects.length) dirty = true;
          if (remaining.length > 0) nextSecMap[secIdx] = remaining;
        }
        if (Object.keys(nextSecMap).length > 0) next[songIdx] = nextSecMap;
      }
      return dirty ? next : prev;
    });
  }, [songs]);

  // suspectMap localStorage 영속화 — 다음 세션에도 빨간 점 살아있게.
  // 곡 제목 시그니처와 함께 저장해서 추출 결과가 바뀌면 무효화.
  const songsSignature = useMemo(
    () => songs.map((s) => s.title).join('|'),
    [songs]
  );
  // mount 시 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('conti-suspect-map');
      if (!raw) return;
      const parsed = JSON.parse(raw) as { signature: string; map: typeof suspectMap };
      if (parsed.signature === songsSignature && parsed.map) {
        setSuspectMap(parsed.map);
      }
    } catch {}
    // 의도적으로 mount 시 1회만 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 변경 시 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        'conti-suspect-map',
        JSON.stringify({ signature: songsSignature, map: suspectMap })
      );
    } catch {}
  }, [suspectMap, songsSignature]);

  // ----- 곡(songs) 조작 — 2번 영역 카드용. text 모델과 무관 -----

  // 곡 단위 삭제 — songs[]에서만 제거 (text는 사용자가 직접 정리).
  const removeSong = (targetIdx: number) => {
    setSongs((prev) => prev.filter((_, i) => i !== targetIdx));
    showToast('곡 제거됨');
  };

  // 빈 곡 추가 — 추출 없이 사용자가 직접 가사를 입력하는 경로.
  // confirmed:false → 나누기 모드(빈 편집창)로 시작. 사용자가 가사를 붙여넣고 빈 줄로 나눈 뒤 확정.
  const addEmptySong = () => {
    setSongs((prev) => [...prev, { title: '새 곡', sections: [], confirmed: false }]);
    showToast('빈 곡 추가됨 — 가사를 붙여넣고 빈 줄로 나눠보세요');
  };

  // 곡 단위 갱신 — ExtractedSection 안 인라인 편집(제목/섹션/+추가/삭제)에서 호출.
  // 사용자가 가사를 직접 수정한 경우 OCR 학습 힌트에 패턴을 기록한다.
  const updateSong = (idx: number, next: Song) => {
    setSongs((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        // 같은 secIdx 기준으로 텍스트가 바뀐 섹션만 골라 학습 힌트에 기록
        s.sections.forEach((origSec, secIdx) => {
          const nextSec = next.sections[secIdx];
          if (nextSec && origSec.text.trim() !== nextSec.text.trim()) {
            recordCorrection(origSec.text, nextSec.text);
          }
        });
        return next;
      })
    );
  };

  // ----- 텍스트 모델 직렬화/다운로드 -----

  // 파일명에 들어갈 오늘 날짜 (콘티_20260426.txt 같은 식)
  const dateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  };

  // 클립보드 복사 — text를 그대로 (제목은 # 그대로 두기보단 ━━━ 변환).
  const textForExport = (): string => {
    return text
      .split(/\n\n+/)
      .map((p) => {
        const lines = p.split('\n');
        const first = lines[0] ?? '';
        if (first.startsWith('# ')) {
          return `━━━ ${first.slice(2)} ━━━\n${lines.slice(1).join('\n')}`.trim();
        }
        if (first.startsWith('> ')) {
          return lines.map((l) => l.replace(/^>\s?/, '')).join('\n');
        }
        return p;
      })
      .join('\n\n')
      .trim();
  };

  const handleCopy = async () => {
    const out = textForExport();
    if (!out) {
      showToast('비어있어요');
      return;
    }
    await navigator.clipboard.writeText(out);
    showToast('복사됨');
  };

  const handleCopyShareLink = () => {
    const hash = encodeStateToHash({ songs, text });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => showToast('공유 링크 복사됨'));
  };

  const handleSaveTxt = () => {
    const out = textForExport();
    if (!out) {
      showToast('비어있어요');
      return;
    }
    const blob = new Blob([out], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `콘티_${dateStr()}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    showToast('.txt 저장됨');
  };

  const handleSaveDocx = async () => {
    const out = textForExport();
    if (!out) {
      showToast('비어있어요');
      return;
    }
    try {
      await exportToDocx(out, `콘티_${dateStr()}.docx`);
      showToast('.docx 저장됨');
    } catch (err: any) {
      showToast('저장 실패: ' + err.message);
    }
  };

  // text → PptSlide[]
  // PptSlide는 이제 text-doc.ts의 Slide와 동일 타입이라 변환 없이 그대로 사용.
  // 이렇게 해야 title 슬라이드의 kind 정보가 살아남아 lib/pptx.ts에서 볼드/큰 폰트로 그려진다.
  const buildPptSlides = (): PptSlide[] => buildSlidesFromText(text);

  // 4줄 한도를 넘는 슬라이드 인덱스(0-base) 목록. UI에서 빨간 강조용.
  // text가 바뀔 때마다 자동 재계산되어 사용자가 해당 슬라이드 줄여서 통과하면 빨간색이 풀린다.
  const overflowSlideIndices = useMemo(() => {
    const slides = buildSlidesFromText(text);
    const out: number[] = [];
    slides.forEach((s, i) => {
      if (!validateSlide(s).ok) out.push(i);
    });
    return out;
  }, [text]);

  const handleSavePptx = async () => {
    const slides = buildPptSlides();
    if (slides.length === 0) {
      showToast('PPT로 만들 슬라이드가 없어요');
      return;
    }
    if (overflowSlideIndices.length > 0) {
      // 첫 번째 하나만 알려주지 않고 모든 문제 슬라이드 번호를 한 번에 표시.
      // 사용자가 미리보기 열어서 빨간 테두리 카드를 보고 수정할 수 있게.
      const list = overflowSlideIndices.map((i) => i + 1).join(', ');
      showToast(`${list}번 슬라이드 4줄 초과 — 미리보기에서 확인하세요`);
      return;
    }
    try {
      const fname = `contionote-${Date.now()}.pptx`;
      const copyright: PptCopyrightInfo | undefined = includeCopyright ? {
        songTitles: songs.map((s) => s.title || 'Untitled'),
        ccliNumber: ccliNumber.trim() || undefined,
        licenseLabel: licenseLabel.trim() || undefined,
      } : undefined;
      await exportToPptx(slides, pptFont, fname, pptTheme, copyright, pptVAlign);
      showToast('PPT 다운로드 시작');
    } catch (err: any) {
      showToast(`PPT 생성 실패: ${err.message}`);
    }
  };

  const handleSavePlainSlides = () => {
    const slides = buildPptSlides();
    if (slides.length === 0) {
      showToast('콘티가 비어있어요');
      return;
    }
    downloadText(
      buildPlainSlidesTxt({ slides, songTitles: songs.map((s) => s.title) }),
      `contionote-${Date.now()}.txt`
    );
    showToast('Plain Slides 다운로드 시작');
  };

  const handleSaveOpenSong = () => {
    const slides = buildPptSlides();
    if (slides.length === 0) {
      showToast('콘티가 비어있어요');
      return;
    }
    downloadText(
      buildOpenSongXml({ slides, songTitles: songs.map((s) => s.title) }),
      `contionote-${Date.now()}.xml`,
      'application/xml;charset=utf-8'
    );
    showToast('OpenSong 다운로드 시작');
  };

  const onClear = () => {
    if (confirm('콘티를 모두 비울까요?')) setText('');
  };

  // 공유 링크로 진입한 경우 URL hash에서 콘티 상태 자동 복원.
  // 기존 Block[] 공유 링크도 호환 — ensureText가 자동 변환.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const restored = decodeHashToState<{ songs: Song[]; text?: string; doc?: unknown }>(hash);
    if (restored && Array.isArray(restored.songs)) {
      setSongs(restored.songs);
      // 새 포맷: text 필드. 옛 포맷: doc 필드(Block[]). 둘 다 처리.
      if (typeof restored.text === 'string') {
        setText(restored.text);
      } else if (restored.doc !== undefined) {
        // ensureText는 lib/text-doc에서 export — Block[] → string 변환
        import('@/lib/text-doc').then(({ ensureText }) => setText(ensureText(restored.doc)));
      }
      showToast('공유 링크에서 콘티를 복원했어요');
    }
  }, []);

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

  // ⌘/Ctrl 단축키: 저장 모달, 가사 추출, 콘티 undo/redo를 전역에서 처리한다.
  // ref 패턴으로 stale closure 회피 — handleExtract가 항상 최신 state(files, pasted 등)를 봄.
  const handleExtractRef = useRef(handleExtract);
  useEffect(() => {
    handleExtractRef.current = handleExtract;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMac = navigator.userAgent.includes('Mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;
      const active = document.activeElement as HTMLElement | null;
      const isEditing =
        active?.tagName === 'INPUT' ||
        active?.tagName === 'TEXTAREA' ||
        Boolean(active?.isContentEditable);

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShowSets(true);
        return;
      }

      if (e.key === 'Enter' && !isEditing) {
        e.preventDefault();
        if (!extracting) handleExtractRef.current();
        return;
      }

      if ((e.key === 'z' || e.key === 'Z') && !isEditing) {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [extracting, handleRedo, handleUndo]);

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
    const originalText = songs[songIdx]?.sections[secIdx]?.text ?? '';
    // 사용자가 추출 결과를 직접 고친 패턴을 다음 OCR 요청의 약한 힌트로 저장한다.
    if (originalText.trim() !== cardDraft.text.trim()) {
      recordCorrection(originalText, cardDraft.text);
    }
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

  // 결과 패널 UI 헬퍼 — text 모델 기준
  const isTitleInDoc = (title: string) => docHasSongTitle(text, title);
  const isEmpty = !text || !text.trim();
  const hasResult = songs.length > 0;

  // ============== 렌더 ==============
  return (
    <div className="app">
      {/* ----- 상단 바 (Header 컴포넌트로 분리) ----- */}
      <Header
        theme={designTheme}
        onChangeTheme={setDesignTheme}
        onOpenMenu={() => setShowMenu(true)}
        onOpenHelp={() => setShowHelp(true)}
        supabaseEnabled={isSupabaseConfigured()}
        authUser={authUser}
        authBusy={authBusy}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />
      {/* 헤더의 "내 보관함" 버튼이 트리거하는 드로어 — 콘티 모음/곡 라이브러리/교회 템플릿 3개 옵션 */}
      {showMenu && (
        <MenuDrawer onClose={() => setShowMenu(false)}>
          <MenuItem
            label="콘티 모음"
            sub="저장/불러오기"
            onClick={() => { setShowMenu(false); setShowSets(true); }}
          />
          <MenuItem
            label="곡 라이브러리"
            sub="추출한 곡 재사용"
            onClick={() => { setShowMenu(false); setShowLibrary(true); }}
          />
          <MenuItem
            label="교회 템플릿"
            sub="PPT 기본값 저장"
            onClick={() => { setShowMenu(false); setShowTemplates(true); }}
          />
        </MenuDrawer>
      )}

      {/* ----- 히어로 ----- */}
      <section
        className="hero-section"
        style={{
          padding: '34px 32px 22px',
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
          className="hero-copy"
          style={{
            marginTop: 14,
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

      {/* ----- 메인: 3-row 레이아웃 ----- */}
      {/* Row 1: 1번 악보 업로드 (full width)
          Row 2: 2번 추출된 곡 | 3번 콘티 편집 (1:1 equal width — 실시간 추가 확인)
          Row 3: 4번 PPT 만들기 (full width — 슬라이드 필요한 사람만) */}
      <main className="work-main" style={{ maxWidth: 1360, margin: '0 auto', padding: '8px 32px 56px' }}>
        <UploadSection
          dragging={dragging}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onPick={onPick}
          files={files}
          thumbs={thumbs}
          onRemoveFile={removeFile}
          accuracyMode={accuracyMode}
          setAccuracyMode={(v) => setAccuracyMode(v)}
          pasteMode={pasteMode}
          setPasteMode={(v) => setPasteMode(v)}
          pasted={pasted}
          setPasted={(v) => setPasted(v)}
          extracting={extracting}
          loadingMsg={loadingMsg}
          progressStep={progressStep}
          hasResult={hasResult}
          onExtract={handleExtract}
        />

        {/* Row 2: 02 추출된 곡 | 03 콘티 편집 */}
        <div className="work-grid">
          <ExtractedSection
            songs={songs}
            text={text}
            extracting={extracting}
            onUpdateSong={updateSong}
            onRemoveSong={removeSong}
            onAddEmptySong={addEmptySong}
            suspectMap={suspectMap}
            onVerifyLyrics={handleVerifyLyrics}
            verifying={verifying}
          />
          <EditorSection
            text={text}
            setText={setText}
            onClear={onClear}
            onCopy={handleCopy}
            onDownloadTxt={handleSaveTxt}
            onDownloadDocx={handleSaveDocx}
            overflowSlideIndices={overflowSlideIndices}
          />
        </div>

        {/* Row 3: 04 PPT 만들기 */}
        <PptSection
          slideCount={buildSlidesFromText(text).length}
          pptFont={pptFont}
          setPptFont={setPptFont}
          pptTheme={pptTheme}
          setPptTheme={setPptTheme}
          pptVAlign={pptVAlign}
          setPptVAlign={setPptVAlign}
          includeCopyright={includeCopyright}
          setIncludeCopyright={setIncludeCopyright}
          onOpenPreview={() => setPreviewOpen(true)}
          onDownloadPptx={handleSavePptx}
          onCopyShareLink={handleCopyShareLink}
          onDownloadOpenSong={handleSaveOpenSong}
          onDownloadPlainSlides={handleSavePlainSlides}
        />
      </main>

      {/* PPT 전체 미리보기 모달 — 04 PptSection의 "전체 미리보기" 버튼이 트리거 */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        text={text}
        pptTheme={pptTheme}
        pptFont={pptFont}
        pptVAlign={pptVAlign}
        overflowSlideIndices={overflowSlideIndices}
      />


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
          {/* 푸터 — 군더더기 멘트 제거(2026-05-20 사용자 요청), 정체성 한 줄만 유지 */}
          <span className="caption">콘티노트 · CCM 찬양팀을 위한 도구</span>
        </div>
      </footer>

      {/* 토스트 알림 */}
      {toast && <div className="toast">{toast}</div>}

      {/* 도움말 모달 — 헤더 [사용법] 버튼으로 열림. ESC/배경 클릭/✕로 닫힘. */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      {/* 콘티 모음 모달 — 현재 콘티 저장 + 과거 콘티 불러오기/삭제 */}
      {showSets && (
        <SavedSetsModal
          currentSongs={songs}
          currentDoc={text}
          isCurrentEmpty={isEmpty}
          isCloudUser={Boolean(authUser)}
          onClose={() => setShowSets(false)}
          onLoad={(s) => {
            setSongs(s.songs);
            // s.doc은 이제 string (ensureText에서 자동 변환됨)
            setText(s.doc);
            showToast(`"${s.name}" 콘티를 불러왔어요`);
            setShowSets(false);
          }}
          onSaved={(s) => {
            showToast(`"${s.name}" 콘티 저장 완료`);
          }}
        />
      )}

      {/* 곡 라이브러리 모달 — 자동 누적된 곡 검색/추가/삭제 */}
      {showLibrary && (
        <SongLibraryModal
          isCloudUser={Boolean(authUser)}
          onClose={() => setShowLibrary(false)}
          onAdd={(song) => {
            setSongs((prev) => [...prev, { title: song.title, sections: song.sections }]);
            showToast(`"${song.title || 'Untitled'}" 곡 추가됨`);
            setShowLibrary(false);
          }}
        />
      )}

      {/* 교회 템플릿 모달 — PPT 기본값(폰트/배경/저작권)을 저장하고 매주 적용 */}
      {showTemplates && (
        <ChurchTemplateModal
          isCloudUser={Boolean(authUser)}
          pptFont={pptFont}
          pptTheme={pptTheme}
          ccliNumber={ccliNumber}
          licenseLabel={licenseLabel}
          setPptFont={setPptFont}
          setPptTheme={setPptTheme}
          setCcliNumber={setCcliNumber}
          setLicenseLabel={setLicenseLabel}
          showToast={showToast}
          onClose={() => setShowTemplates(false)}
        />
      )}
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
            <li>악보 사진/PDF 업로드 (한 번에 12개까지)</li>
            <li><b>가사 추출하기</b> 버튼 누르기</li>
            <li>왼쪽에 나온 곡 제목·섹션(Verse/후렴) 카드를 클릭하면 오른쪽 콘티에 추가됨</li>
            <li>가사 안에서 <b>Enter 두 번</b>(빈 줄 만들기)으로 슬라이드를 잘라요</li>
            <li>아래 <b>PPT 다운로드</b> 버튼 누르면 끝</li>
          </ol>
        </Section>

        <Section title="이 버튼들 뭐예요? (메뉴 · 주요 기능 안내)">
          <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
            오른쪽 위 ☰ (세 줄 아이콘) 메뉴 안 항목들과, 화면 곳곳의 버튼들을 풀어서 설명해요.
          </p>

          <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px', fontWeight: 600 }}>
            ☰ 메뉴 안 (오른쪽 위)
          </h4>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>콘티 모음</b> — 만든 콘티에 이름 붙여서 저장. 다음에 똑같이 불러올 수 있어요.
              <span style={{ color: 'var(--ink-3)' }}> (내 브라우저 안에만 저장됨)</span>
            </li>
            <li>
              <b>곡 라이브러리</b> — 한 번 추출한 곡은 여기 자동으로 모여요. 다음 주에 같은 곡 또 쓰면 검색해서 바로 추가.
            </li>
            <li>
              <b>교회 템플릿</b> — 우리 교회 기본 폰트·배경·CCLI 번호를 저장. 매번 같은 설정 다시 안 골라도 돼요.
            </li>
          </ul>

          <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px', fontWeight: 600 }}>
            1번 영역 — 악보 업로드
          </h4>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>정확도 우선</b> 토글 — 흐릿하거나 글씨 작은 악보일 때만 켜기. 더 신중하게 읽어주는 대신 시간 살짝 더 걸려요.
            </li>
            <li>
              <b>가사 추출하기</b> — 업로드한 악보에서 가사만 골라서 뽑아주는 메인 버튼.
            </li>
          </ul>

          <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px', fontWeight: 600 }}>
            2번 영역 — 추출된 곡 (왼쪽 결과)
          </h4>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>곡 제목 클릭</b> → 인라인으로 제목을 바로 수정할 수 있어요.
            </li>
            <li>
              <b>섹션 칩(Verse/후렴/Bridge…) 본문 클릭</b> → 오른쪽 콘티에 그 섹션 가사가 추가됨. <b>여러 번 누르면 여러 번 추가</b> (후렴 4번이면 4번 클릭).
            </li>
            <li>
              섹션 칩 위 <b>✎</b> → 라벨과 가사를 직접 수정 (AI가 잘못 읽었을 때 보완용).
            </li>
            <li>
              <b>+ 새 섹션 추가</b> → 6종 라벨(Verse/Pre-Chorus/Chorus/Bridge/Ending/Intro) 중 선택하면 빈 가사 칩이 새로 만들어져요.
            </li>
            <li>
              곡 카드의 <b>+ 곡 추가</b> → 그 곡의 모든 섹션을 콘티에 한 번에 추가. <b>✕</b> → 곡 라이브러리에서 곡 제거.
            </li>
          </ul>

          <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px', fontWeight: 600 }}>
            3번 영역 — 콘티 편집 (오른쪽 큰 텍스트 박스)
          </h4>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>한 줄</b> = 화면 한 줄. <b>빈 줄</b>(Enter 두 번) = <b>슬라이드 분리</b>. 그게 전부예요.
            </li>
            <li>
              가사 안에서 빈 줄을 지우면(백스페이스) 두 슬라이드가 자동으로 <b>합쳐짐</b>.
            </li>
            <li>
              <b>제목 슬라이드</b>를 직접 만들고 싶으면 줄 맨 앞에 <b>"#&nbsp;"</b> 입력. 예: <code className="kbd"># 은혜로다</code>
            </li>
            <li>
              <b>메모 슬라이드</b>(광고/기도제목/축도자) 만들고 싶으면 줄 맨 앞에 <b>"&gt;&nbsp;"</b> 입력. 예: <code className="kbd">&gt; 예배 후 광고</code>
            </li>
            <li>
              하단 <b>📋 클립보드 / 📄 TXT / 📝 DOCX</b> — 슬라이드 안 만들고 텍스트만 뽑고 싶을 때.
            </li>
            <li>
              하단 <b>전체 비우기</b> — 콘티 통째로 지움 (한 번 더 묻습니다).
            </li>
          </ul>

          <h4 style={{ fontSize: 13, color: 'var(--ink)', margin: '14px 0 6px', fontWeight: 600 }}>
            4번 영역 — PPT 만들기
          </h4>
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>폰트</b> — 4종 중 선택. <b>본명조 Pro</b>가 모든 컴퓨터에서 가장 잘 보여서 추천.
            </li>
            <li>
              <b>배경</b> — 검정/흰색/종이톤 + 실제 사진 3종(초원·십자가·성경책). 어두운 예배실은 검정, 밝으면 흰색.
            </li>
            <li>
              <b>저작권/CCLI 슬라이드</b> — PPT 맨 끝에 "오늘 부른 곡 + CCLI 번호" 슬라이드 자동 추가. CCLI 번호는 안 적어도 됨.
            </li>
            <li>
              <b>다른 도구로 내보내기 ▾</b> — Plain Slides(다른 PPT 도구용 .txt), OpenSong(찬양 전용 프로그램용 .xml).
              <span style={{ color: 'var(--ink-3)' }}> 평소에 PowerPoint만 쓰면 무시해도 됨.</span>
            </li>
          </ul>
        </Section>

        <Section title="슬라이드 분리하는 법 (4가지)">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>
              <b>Enter 두 번</b>(가장 쉬움) — 가사 안에서 빈 줄 만들면 거기서부터 새 슬라이드. 빈 줄 지우면 다시 합쳐짐.
            </li>
            <li>
              <b>섹션이 바뀔 때</b> — Verse 다음에 후렴이 오면 자동으로 다른 슬라이드.
            </li>
            <li>
              <b>+ 슬라이드 구분</b> — 정확히 여기서 자르고 싶을 때 콘티 편집 헤더에서 추가.
            </li>
            <li>
              <b>합치고 싶을 때</b> — Enter 한 번(줄바꿈)만 하면 같은 슬라이드 안에서 두 줄 됨.
            </li>
          </ul>
        </Section>

        <Section title="글씨 크기는 자동으로 맞춰져요">
          <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
            이제는 줄을 직접 안 나눠도 돼요. 줄 수가 많거나 한 줄이 길면 그 슬라이드만 글씨를
            자동으로 줄여서 한 화면에 담아줘요. 너무 작아지지 않게 최소 24pt까지만 줄이고,
            그래도 줄이 길면 PowerPoint가 알아서 줄바꿈해요.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--rule)' }}>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-2)' }}>줄 수</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', color: 'var(--ink-2)' }}>기본 글씨 크기</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ padding: '6px 4px' }}>1줄</td><td style={{ padding: '6px 4px' }}>56pt</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>2줄</td><td style={{ padding: '6px 4px' }}>48pt</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>3줄</td><td style={{ padding: '6px 4px' }}>38pt</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>4줄</td><td style={{ padding: '6px 4px' }}>32pt</td></tr>
              <tr><td style={{ padding: '6px 4px' }}>5~7줄</td><td style={{ padding: '6px 4px' }}>28~24pt로 자동 축소</td></tr>
              <tr><td style={{ padding: '6px 4px', color: 'var(--ink-3)' }}>한 줄이 길면</td><td style={{ padding: '6px 4px', color: 'var(--ink-3)' }}>그 줄 길이에 맞춰 더 작게 (최소 24pt)</td></tr>
            </tbody>
          </table>
        </Section>

        <Section title="자주 묻는 질문">
          <FAQ
            q="'정확도 우선' 켜면 뭐가 달라져요?"
            a="흐릿한 PDF/사진을 더 선명하게 처리하고, AI가 가사를 더 천천히·신중히 읽어요. 깔끔한 악보면 굳이 안 켜도 되고, 글씨가 작거나 흐릿하면 켜는 걸 추천해요. 시간이 살짝 더 걸려요."
          />
          <FAQ
            q="가사가 빠지거나 이상하게 나왔어요."
            a="① '정확도 우선' 켜고 다시 추출하기. ② 그래도 안 되면 ② 곡 카드 안 섹션 칩의 ✎ 버튼으로 가사를 직접 고치기 — AI는 한 번 고친 패턴을 다음 추출 때 힌트로 참고해요. ③ AI가 한 섹션을 통째로 빼먹었다면 '+ 새 섹션 추가'로 직접 만드세요."
          />
          <FAQ
            q="곡 카드 ✕ 누르면 콘티에 추가한 것도 사라져요?"
            a="아니요, 콘티 편집창 텍스트는 그대로 남아요. 곡 카드는 그냥 '왼쪽 라이브러리에서 그 곡을 빼는' 것일 뿐, 이미 콘티에 들어간 가사는 그대로 유지됩니다."
          />
          <FAQ
            q="PPT 열었더니 글씨체가 다르게 보여요."
            a="그 컴퓨터에 해당 폰트가 설치되어 있어야 똑같이 보여요. '본명조 Pro'가 가장 호환성 좋아서 추천."
          />
          <FAQ
            q="저장한 콘티는 어디 있나요?"
            a="내 브라우저(이 컴퓨터, 이 크롬/사파리)에만 저장돼요. 다른 컴퓨터·다른 사람한테는 안 보여요. 공유하려면 '공유 링크 복사'를 쓰세요."
          />
        </Section>

        <Section title="다른 다운로드 형식">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li><b>TXT</b> — 콘티 텍스트만 메모장 파일로 (제목은 ━━━ 강조)</li>
            <li><b>DOCX</b> — Word 문서</li>
            <li><b>클립보드 복사</b> — 콘티 전체 텍스트를 카톡·메모 앱에 바로 붙여넣을 수 있게</li>
          </ul>
        </Section>

        <Section title="단축키 (Mac은 ⌘, Windows는 Ctrl)">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li><b>Ctrl/⌘ + S</b> — 콘티 모음 (저장/불러오기) 열기</li>
            <li><b>Ctrl/⌘ + Enter</b> — 가사 추출하기 (편집 중 아닐 때)</li>
            <li><b>Ctrl/⌘ + Z</b> — 방금 한 거 되돌리기</li>
            <li><b>Ctrl/⌘ + Shift + Z</b> — 되돌린 거 다시 실행</li>
          </ul>
        </Section>

        <Section title="저장 위치 (개인정보 안내)">
          <ul style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li><b>콘티 모음 / 곡 라이브러리 / 교회 템플릿</b> — <span style={{ color: 'var(--ink-3)' }}>전부 내 브라우저 안에만 저장 (서버 X)</span>. 다른 컴퓨터 가면 안 보여요.</li>
            <li><b>공유 링크 복사</b> — <span style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>URL 자체에 콘티가 통째로 담겨있음</span>. 링크 받은 누구나 그 콘티 볼 수 있어요. (서버에 저장되는 게 아니에요)</li>
            <li><b>악보 이미지/PDF</b> — 가사 추출할 때만 잠깐 AI(Gemini)에 보내고, 추출 끝나면 우리 서버엔 안 남아요.</li>
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

// 햄버거 메뉴 → 우측 슬라이드 패널 (drawer).
// Google AI Studio처럼 사이드에서 슉 슬라이드인. 배경 dim + ESC + ✕로 닫힘.
function MenuDrawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* 배경 dim — 클릭 시 닫힘 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(31, 27, 22, 0.4)',
          zIndex: 150,
          animation: 'fadeIn .18s ease-out',
        }}
      />
      <div
        role="menu"
        aria-label="메뉴"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(86vw, 320px)',
          height: '100vh',
          background: 'var(--paper)',
          borderLeft: '1px solid var(--rule)',
          boxShadow: '-12px 0 36px -10px rgba(0,0,0,0.18)',
          zIndex: 151,
          padding: '20px 0 24px',
          animation: 'drawerSlideIn .22s ease-out',
          overflowY: 'auto',
        }}
      >
        {/* 패널 헤더 — 제목 + 닫기 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px 16px',
            borderBottom: '1px solid var(--rule)',
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 600,
              fontSize: 18,
              color: 'var(--ink)',
            }}
          >
            메뉴
          </span>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
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
        </div>
        {children}
      </div>
    </>
  );
}

// 헤더 메뉴 항목 — 토스 스타일(메인 라벨 + 작은 sub 캡션)
function MenuItem({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '10px 16px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--sans)',
        color: 'var(--ink)',
        transition: 'background .12s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'var(--paper-2)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
      <div className="caption" style={{ color: 'var(--ink-3)', marginTop: 2, fontSize: 11.5 }}>
        {sub}
      </div>
    </button>
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

// ============== 콘티 모음 모달 ==============
// 로그인 상태면 Supabase conti_sets, 비로그인이면 localStorage에서 콘티 리스트를 가져온다.
// 새 저장 / 불러오기 / 삭제는 모두 conti-cloud의 async API로 통일.
function SavedSetsModal({
  currentSongs,
  currentDoc,
  isCurrentEmpty,
  isCloudUser,
  onClose,
  onLoad,
  onSaved,
}: {
  currentSongs: Song[];
  currentDoc: string;
  isCurrentEmpty: boolean;
  // 로그인 상태인지 — UI에 "클라우드에 저장됨" 안내 표기용
  isCloudUser: boolean;
  onClose: () => void;
  onLoad: (set: SavedSet) => void;
  onSaved: (set: SavedSet) => void;
}) {
  const [sets, setSets] = useState<SavedSet[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  // saving/removing 동안 버튼 disabled — 중복 클릭 방지
  const [busy, setBusy] = useState(false);

  // 모달 열릴 때 리스트 로드 (async). 이후 저장/삭제 후에도 갱신.
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listSetsAsync();
      setSets(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSave = async () => {
    if (isCurrentEmpty || busy) return;
    setBusy(true);
    try {
      const saved = await saveSetAsync(name, currentSongs, currentDoc);
      await refresh();
      setName('');
      onSaved(saved);
    } catch (err) {
      console.error(err);
      alert('저장에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (busy) return;
    if (!window.confirm('이 콘티를 삭제할까요?')) return;
    setBusy(true);
    try {
      await removeSetAsync(id);
      await refresh();
    } catch (err) {
      console.error(err);
      alert('삭제에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="콘티 모음"
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
          maxWidth: 560,
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
          콘티 모음
        </h2>
        <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 18 }}>
          명시적으로 저장한 콘티만 여기에 보입니다 (자동 저장 X). 같은 이름이어도 여러 번 저장 가능.
        </p>

        {/* 현재 콘티 저장 영역 */}
        <div
          style={{
            border: '1px solid var(--rule)',
            borderRadius: 4,
            padding: 14,
            marginBottom: 20,
            background: 'color-mix(in oklab, var(--paper) 70%, white)',
          }}
        >
          <div className="label" style={{ marginBottom: 8 }}>현재 콘티 저장</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isCurrentEmpty) handleSave();
              }}
              placeholder="예: 2026-05-04 주일 1부"
              style={{ flex: 1, fontSize: 14 }}
              disabled={isCurrentEmpty}
            />
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={isCurrentEmpty || busy}
              style={{ padding: '10px 16px', fontSize: 14 }}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
          {isCurrentEmpty && (
            <div className="caption" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
              콘티가 비어있어요. 곡 제목·섹션을 먼저 추가하세요.
            </div>
          )}
        </div>

        {/* 저장 위치 안내 — 로그인 여부에 따라 클라우드/로컬 표시.
            로그인 상태면 다른 기기에서도 그대로 보임을 강조해 사용자가 가치를 체감하게 한다. */}
        <div
          className="caption"
          style={{
            color: 'var(--ink-3)',
            marginBottom: 12,
            padding: '8px 10px',
            background: 'color-mix(in oklab, var(--paper) 70%, white)',
            border: '1px solid var(--rule)',
            borderRadius: 2,
          }}
        >
          {isCloudUser ? (
            <>
              <strong style={{ color: 'var(--accent-ink)' }}>☁ 클라우드 저장 중</strong> — 다른 컴퓨터·휴대폰에서도 같은 계정으로 로그인하면 이 콘티들을 볼 수 있어요.
            </>
          ) : (
            <>
              <strong>💾 이 브라우저에만 저장</strong> — 로그인하면 클라우드로 자동 옮겨져 다른 기기에서도 볼 수 있어요.
            </>
          )}
        </div>

        {/* 저장된 콘티 리스트 */}
        <div className="label" style={{ marginBottom: 8 }}>
          저장된 콘티 ({sets.length})
        </div>
        {loading ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            불러오는 중…
          </div>
        ) : sets.length === 0 ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            아직 저장된 콘티가 없어요.
          </div>
        ) : (
          <div className="stack" style={cssVar('--gap', '8px')}>
            {sets.map((s) => {
              // 텍스트 모델: 빈 줄 기준 paragraph 수 = 슬라이드 수
              const sectionCount = s.doc
                ? s.doc.split(/\n[ \t]*\n+/).filter((p) => p.trim().length > 0).length
                : 0;
              return (
                <div
                  key={s.id}
                  style={{
                    border: '1px solid var(--rule)',
                    borderLeft: '2px solid var(--ink)',
                    padding: '12px 14px',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: 'color-mix(in oklab, var(--paper) 65%, white)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--serif)',
                        fontWeight: 600,
                        fontSize: 16,
                        color: 'var(--ink)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {s.name}
                    </div>
                    <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                      {formatSavedAt(s.savedAt)} · {s.songs.length}곡 · {sectionCount}개 섹션
                    </div>
                  </div>
                  <button
                    className="btn-text"
                    onClick={() => onLoad(s)}
                    style={{ padding: '6px 12px', fontSize: 13 }}
                  >
                    불러오기
                  </button>
                  <button
                    onClick={() => handleRemove(s.id)}
                    aria-label="삭제"
                    title="삭제"
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== 곡 라이브러리 모달 ==============
// 자동 저장된 곡(로그인이면 클라우드, 비로그인이면 localStorage)을 제목/가사로 검색해 다시 추가한다.
// 검색은 client-side 필터링이라 서버 부하 없이 즉시 반응.
function SongLibraryModal({
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
              <strong>💾 이 브라우저에만 저장</strong> — 로그인하면 클라우드로 자동 옮겨져 다른 기기에서도 보여요.
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
                    <div
                      style={{
                        fontFamily: 'var(--serif)',
                        fontWeight: 600,
                        fontSize: 18,
                        color: 'var(--ink)',
                        lineHeight: 1.35,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {song.title || 'Untitled'}
                    </div>
                    <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                      섹션 {song.sections.length}개 · {formatLibrarySavedAt(song.savedAt)}
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

// ============== 교회 템플릿 모달 ==============
// 매주 반복 입력하는 PPT 기본값(폰트/배경/저작권)을 저장하고 바로 적용한다.
// 로그인이면 Supabase templates 테이블, 비로그인이면 localStorage.
function ChurchTemplateModal({
  isCloudUser,
  pptFont,
  pptTheme,
  ccliNumber,
  licenseLabel,
  setPptFont,
  setPptTheme,
  setCcliNumber,
  setLicenseLabel,
  showToast,
  onClose,
}: {
  isCloudUser: boolean;
  pptFont: PptFont;
  pptTheme: PptTheme;
  ccliNumber: string;
  licenseLabel: string;
  setPptFont: React.Dispatch<React.SetStateAction<PptFont>>;
  setPptTheme: React.Dispatch<React.SetStateAction<PptTheme>>;
  setCcliNumber: React.Dispatch<React.SetStateAction<string>>;
  setLicenseLabel: React.Dispatch<React.SetStateAction<string>>;
  showToast: (msg: string) => void;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<ChurchTemplate[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listTemplatesAsync();
      setTemplates(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const formatTemplateCreatedAt = (ms: number) =>
    new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ms));

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const saved = await saveTemplateAsync({
        name,
        font: pptFont,
        theme: pptTheme,
        ccliNumber: ccliNumber.trim() || undefined,
        licenseLabel: licenseLabel.trim() || undefined,
      });
      await refresh();
      setName('');
      showToast(`"${saved.name}" 템플릿 저장 완료`);
    } catch (err) {
      console.error(err);
      alert('저장에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = (template: ChurchTemplate) => {
    setPptFont(template.font);
    setPptTheme(template.theme);
    setCcliNumber(template.ccliNumber ?? '');
    setLicenseLabel(template.licenseLabel ?? '');
    showToast(`"${template.name}" 템플릿을 적용했어요`);
  };

  const handleRemove = async (id: string) => {
    if (busy) return;
    if (!window.confirm('이 템플릿을 삭제할까요?')) return;
    setBusy(true);
    try {
      await removeTemplateAsync(id);
      await refresh();
    } catch (err) {
      console.error(err);
      alert('삭제에 실패했어요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="교회 템플릿"
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
          maxWidth: 600,
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
          교회 템플릿
        </h2>
        <p className="caption" style={{ color: 'var(--ink-3)', marginBottom: 12 }}>
          교회별로 매주 반복되는 PPT 폰트, 배경, CCLI 정보를 저장해두고 다시 적용합니다.
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
              <strong style={{ color: 'var(--accent-ink)' }}>☁ 클라우드 저장 중</strong> — 다른 컴퓨터에서도 이 템플릿을 그대로 쓸 수 있어요.
            </>
          ) : (
            <>
              <strong>💾 이 브라우저에만 저장</strong> — 로그인하면 클라우드로 자동 옮겨져 다른 기기에서도 보여요.
            </>
          )}
        </div>

        {/* 현재 설정 저장 영역 */}
        <div
          style={{
            border: '1px solid var(--rule)',
            borderRadius: 4,
            padding: 14,
            marginBottom: 20,
            background: 'color-mix(in oklab, var(--paper) 70%, white)',
          }}
        >
          <div className="label" style={{ marginBottom: 8 }}>현재 설정 저장</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              placeholder="예: OO교회 청년부 PPT"
              style={{ flex: 1, fontSize: 14 }}
            />
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={busy}
              style={{ padding: '10px 16px', fontSize: 14 }}
            >
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
          <div className="caption" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
            {PPT_FONT_LABELS[pptFont]} · {PPT_THEME_LABELS[pptTheme]}
            {ccliNumber.trim() ? ` · CCLI ${ccliNumber.trim()}` : ''}
            {licenseLabel.trim() ? ` · ${licenseLabel.trim()}` : ''}
          </div>
        </div>

        {/* 저장된 템플릿 리스트 */}
        <div className="label" style={{ marginBottom: 8 }}>
          저장된 템플릿 ({templates.length})
        </div>
        {loading ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            불러오는 중…
          </div>
        ) : templates.length === 0 ? (
          <div className="caption" style={{ color: 'var(--ink-3)', padding: 12 }}>
            아직 저장된 템플릿이 없어요.
          </div>
        ) : (
          <div className="stack" style={cssVar('--gap', '8px')}>
            {templates.map((template) => (
              <div
                key={template.id}
                style={{
                  border: '1px solid var(--rule)',
                  borderLeft: '2px solid var(--accent)',
                  padding: '12px 14px',
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'color-mix(in oklab, var(--paper) 65%, white)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--serif)',
                      fontWeight: 600,
                      fontSize: 16,
                      color: 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {template.name}
                  </div>
                  <div className="mono" style={{ color: 'var(--ink-3)', fontSize: 11 }}>
                    {formatTemplateCreatedAt(template.createdAt)} · {PPT_FONT_LABELS[template.font]} · {PPT_THEME_LABELS[template.theme]}
                  </div>
                </div>
                <button
                  className="btn-text"
                  onClick={() => handleApply(template)}
                  style={{ padding: '6px 12px', fontSize: 13 }}
                >
                  적용
                </button>
                <button
                  onClick={() => handleRemove(template.id)}
                  aria-label="삭제"
                  title="삭제"
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
