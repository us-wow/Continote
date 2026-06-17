'use client';

// 콘티노트 모바일 — 4단계 wizard.
//
// 각 단계는 풀스크린 하나의 섹션만 보여주고, 하단에 [이전][다음] 또는 핵심 액션 버튼.
//   Step 1: 악보 업로드 → 가사 추출하기
//   Step 2: 추출된 곡 확인/편집 (인라인 편집 + 새 섹션 추가)
//   Step 3: 콘티 편집 (textarea + TXT/DOCX/클립보드)
//   Step 4: PPT 만들기 (테마/폰트/저작권/다운로드)
//
// 데스크탑 컴포넌트(UploadSection, ExtractedSection, EditorSection, PptSection)를 그대로 재사용한다.
// 상태는 /m 페이지가 자체 관리(데스크탑 /와 별개).
// 데이터 영속화는 Supabase Auth + Cloud 모듈 통해 자동 동기화되므로,
// 같은 계정으로 데스크탑/모바일 양쪽 들어가도 콘티 모음/곡/템플릿이 그대로 보임.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Song } from '@/lib/types';
import { attachRefChecks } from '@/lib/reference-lyrics';
import { canUseCustomBg, checkPremiumAccess, type CustomBg } from '@/lib/custom-bg';
import { listMyBackgrounds, saveBackground, deleteBackground, type SavedBg } from '@/lib/custom-bg-cloud';
import { pdfToImages, fileToBase64, pdfFirstPageThumb } from '@/lib/pdf';
import { exportToDocx } from '@/lib/docx';
import { encodeStateToHash } from '@/lib/url-sync';
import { recordCorrection, buildCorrectionHint } from '@/lib/ocr-learning';
import { buildPlainSlidesTxt, buildOpenSongXml, downloadText } from '@/lib/export-formats';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { exportToPptx, validateSlide, type PptCopyrightInfo, type PptFont, type PptSlide, type PptTheme, type PptVAlign } from '@/lib/pptx';
import { buildSlidesFromText } from '@/lib/text-doc';
import { addToLibraryAsync, migrateSongLibraryToCloud, reuseFromLibrary, FREE_LIBRARY_LIMIT } from '@/lib/song-library-cloud';
import { migrateLocalToCloud } from '@/lib/conti-cloud';
import { migrateTemplatesToCloud } from '@/lib/template-cloud';
import BrandMark from '@/components/BrandMark';
import UploadSection from '@/components/UploadSection';
import ExtractedSection from '@/components/ExtractedSection';
// MobileSongPicker 제거 — 단일 스크롤에선 위 ExtractedSection의 칩으로 콘티에 추가한다.
import SlideStudio from '@/components/SlideStudio';
import PreviewModal from '@/components/PreviewModal';
import PricingModal from '@/components/PricingModal';
import OnboardingGuide from '@/components/OnboardingGuide';
import SongLibraryModal from '@/components/SongLibraryModal';
import type { DesignTheme } from '@/components/Header';

export default function MobilePage() {
  // ----- 핵심 상태 -----
  // introSeen: 처음 진입 시 IntroScreen 보여주는 게이트.
  //   null = mount 전 아직 모름(SSR/hydration 깜빡임 방지 위해 처음엔 아무것도 렌더 X)
  //   false = 인트로 표시 중
  //   true = 인트로 건너뛰고 wizard 표시
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  // 단계 위저드 제거 — 데스크톱처럼 4개 패널을 한 스크롤에 모두 보여준다.
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [text, setText] = useState<string>('');
  // 슬라이드 스튜디오에서 편집 중인 슬라이드 번호(데스크탑과 동일). 전체 보기에서 슬라이드 클릭 시 점프.
  const [studioSelected, setStudioSelected] = useState(0);

  // 작업 중인 콘티 임시 저장 — 예배 순서 빌더(/worship)의 "방금 작업하던 콘티"가 읽어간다.
  // 데스크톱(app/page.tsx)과 같은 키·같은 규칙(0.5초 디바운스, 빈 텍스트는 건드리지 않음).
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (text.trim()) {
          window.localStorage.setItem(
            'contino-working-draft',
            JSON.stringify({ text, at: Date.now() })
          );
        }
      } catch {
        // localStorage 불가 환경 → 임시 저장만 생략
      }
    }, 500);
    return () => clearTimeout(t);
  }, [text]);

  // 업로드 옵션
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progressStep, setProgressStep] = useState<0 | 1 | 2 | 3>(0);
  const [dragging, setDragging] = useState(false);

  // PPT 옵션
  const [pptFont, setPptFont] = useState<PptFont>('nanum-gothic');
  // 내 교회 PPT(커스텀 배경) 이미지 — 세션 한정(저장 안 됨). 운영자 계정만 사용 가능(유료 예정).
  const [customBg, setCustomBg] = useState<CustomBg | null>(null);
  // 클라우드에 저장된 "내 배경" 목록 (유료 기능 — 현재 운영자만)
  const [savedBgs, setSavedBgs] = useState<SavedBg[]>([]);
  // 잠금 해제 여부 — localStorage는 렌더 중에 읽으면 hydration이 어긋나므로 effect에서 판별.
  const [premiumUnlocked, setPremiumUnlocked] = useState(false);
  const [pptTheme, setPptTheme] = useState<PptTheme>('black');
  // 곡별 배경(유료) — 곡 순번(0번부터)별 테마. 비어 있으면 전부 기본 테마(pptTheme)를 따른다.
  const [songThemes, setSongThemes] = useState<(PptTheme | undefined)[]>([]);
  // PPT 세로 정렬 — 기본 가운데. 데스크탑과 동일하게 미리보기·PPT 동시 적용.
  const [pptVAlign, setPptVAlign] = useState<PptVAlign>('middle');
  // 글꼴 포함(임베드) — 기본 ON. 본명조 선택 시 글꼴을 PPT에 심어 어디서나 똑같이.
  const [embedFont, setEmbedFont] = useState(true);
  // 저작권(CCLI) 상태 제거됨 — 한국 교회 미사용
  const [previewOpen, setPreviewOpen] = useState(false);
  // 요금제 안내 모달 — 잠긴 유료 기능(왕관) 클릭 시 열림
  const [pricingOpen, setPricingOpen] = useState(false);

  // Auth + 디자인
  const [authUser, setAuthUser] = useState<User | null>(null);
  // 유료 기능 잠금 해제 — 운영자 이메일 또는 테스트 스위치(localStorage)
  useEffect(() => {
    // 1차: 운영자 이메일·테스트 스위치 (즉시) → 2차: 무료 체험 명단(premium_access) 조회 (비동기)
    if (canUseCustomBg(authUser?.email)) {
      setPremiumUnlocked(true);
      return;
    }
    if (!authUser?.email) {
      setPremiumUnlocked(false);
      return;
    }
    let cancelled = false;
    void checkPremiumAccess(authUser.email).then((ok) => {
      if (!cancelled) setPremiumUnlocked(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [authUser]);
  // 해제된 계정이면 클라우드의 "내 배경" 목록을 불러온다
  useEffect(() => {
    if (premiumUnlocked && authUser) {
      void listMyBackgrounds().then(setSavedBgs);
    } else {
      setSavedBgs([]);
    }
  }, [premiumUnlocked, authUser]);

  // 업로드/변환 성공 → 바로 적용하고, 로그인 상태면 이름 받아 클라우드에 저장
  const handleCustomBgChange = (bg: CustomBg, note?: string) => {
    setCustomBg(bg);
    setPptTheme('custom');
    showToast(note ?? '교회 PPT 배경이 적용됐어요');
    if (premiumUnlocked && authUser && bg.src.startsWith('data:')) {
      const name = window.prompt('이 배경의 이름을 지어주세요 (저장 안 하려면 취소)', '우리 교회 배경');
      if (name !== null) {
        void saveBackground(name, bg.src, bg.kind)
          .then((saved) => {
            setSavedBgs((prev) => [saved, ...prev]);
            setCustomBg({ src: saved.url, kind: saved.kind });
            showToast('저장했어요 — 다음에도 바로 쓸 수 있어요');
          })
          .catch((err: Error) => showToast(err.message));
      }
    }
  };

  const handleDeleteSavedBg = (bg: SavedBg) => {
    if (!confirm(`"${bg.name}" 배경을 지울까요?`)) return;
    void deleteBackground(bg).then(() => {
      setSavedBgs((prev) => prev.filter((b) => b.id !== bg.id));
      if (customBg?.src === bg.url) {
        setCustomBg(null);
        setPptTheme('black');
      }
    });
  };

  // 추출 결과 투입 — ①라이브러리 재사용 ②새 곡만 대조 검토 ③새 곡만 적립(무료 5곡) ④요약 토스트.
  // 모바일은 곡을 칩 모드 그대로 받으므로 markUnconfirmed=false.
  const ingestExtractedSongs = async (raw: Song[]) => {
    const { songs: merged, reusedCount } = await reuseFromLibrary(raw, false);
    setSongs((prev) => [...prev, ...merged]);
    attachRefChecks(merged.filter((s) => !s.reused), setSongs);
    const parts = [`${raw.length}곡 추출됨`];
    if (reusedCount > 0) parts.push(`${reusedCount}곡은 지난번 다듬은 버전 📚`);
    showToast(parts.join(' · '));
  };
  // 곡 라이브러리 수동 저장 — 자동 저장 대체. 지금 곡들을 한 번에 담는다.
  const [savingLibrary, setSavingLibrary] = useState(false);
  const handleSaveLibrary = async () => {
    if (songs.length === 0) { showToast('저장할 곡이 없어요'); return; }
    setSavingLibrary(true);
    try {
      const { skipped } = await addToLibraryAsync(songs, premiumUnlocked ? undefined : FREE_LIBRARY_LIMIT);
      const saved = songs.length - skipped;
      let msg = `${saved}곡 라이브러리에 저장했어요 📚`;
      if (skipped > 0) msg += ` · 무료는 ${FREE_LIBRARY_LIMIT}곡까지라 ${skipped}곡은 저장 안 됨`;
      showToast(msg);
    } catch {
      showToast('저장 실패 — 다시 시도해 주세요');
    } finally {
      setSavingLibrary(false);
    }
  };
  const [authBusy, setAuthBusy] = useState(false);
  const [designTheme, setDesignTheme] = useState<DesignTheme>('wanted');

  // 메뉴 시트 — ☰ 햄버거 눌렀을 때 바닥에서 슉 올라옴.
  // 안에 사용법 / 데스크탑으로 보기 / 로그아웃 등 잘 안 쓰는 액션 모음.
  const [menuOpen, setMenuOpen] = useState(false);
  // 사용법 가이드(OnboardingGuide) 표시 여부 — 메뉴의 "사용법 보기"로 연다.
  const [showGuide, setShowGuide] = useState(false);
  // 곡 라이브러리 모달 표시 여부 — 메뉴의 "곡 라이브러리"로 연다.
  // 한 번 추출한 곡들을 다시 불러와 콘티에 추가할 수 있다.
  const [showLibrary, setShowLibrary] = useState(false);

  // 오타 검토 — page.tsx와 동일 구조
  const extractedImagesRef = useRef<{ data: string; mimeType: string }[]>([]);
  const [suspectMap, setSuspectMap] = useState<
    Record<number, Record<number, string[]>>
  >({});
  const [verifying, setVerifying] = useState(false);

  // Undo/Redo — page.tsx와 동일 구조(text + songs 묶음 스냅샷, 50개 한도, 300ms debounce).
  // 모바일은 키보드 단축키 대신 콘티 편집 화면에 버튼 UI 2개를 둔다.
  const lastSnapshotRef = useRef<string>('');
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<{ songs: Song[]; text: string }[]>([]);
  const redoStackRef = useRef<{ songs: Song[]; text: string }[]>([]);

  // 토스트
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // songs/text 변경 감지 → 300ms debounce 후 스냅샷을 undoStack에 push, redoStack 비움.
  // 빠른 연속 타이핑이 다 별개 스냅샷으로 쌓이지 않도록 debounce.
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
    // 편집 중인 미반영 변경이 있다면 먼저 스냅샷 push (안 그러면 한 번 undo가 무시되는 느낌)
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

  // 라우팅은 middleware.ts가 담당 — client redirect 제거 (핑퐁 루프 방지).

  // ----- 디자인 테마 -----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('conti-design-theme');
      if (saved === 'wanted' || saved === 'paper') setDesignTheme(saved);
    } catch {}
  }, []);

  // ----- 첫 진입 게이트 — 처음 온 사람에겐 사용법 캐러셀을 한 번 띄운다 -----
  // 예전엔 별도 IntroScreen 전체화면을 띄웠지만, 이제 OnboardingGuide 캐러셀로 통일.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem('contino-guide-seen.v1');
      if (seen !== '1') {
        setShowGuide(true); // 첫 방문 → 캐러셀 자동 열기
        window.localStorage.setItem('contino-guide-seen.v1', '1');
      }
    } catch {
      // localStorage 차단 환경 → 캐러셀 생략하고 바로 wizard
    }
    setIntroSeen(true); // 항상 wizard 렌더(SSR 블랭크 깜빡임만 방지)
  }, []);

  // dismissIntro 제거됨 — IntroScreen 폐기. 첫 진입 표시는 위 useEffect에서 직접 처리.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = designTheme;
    try {
      window.localStorage.setItem('conti-design-theme', designTheme);
    } catch {}
  }, [designTheme]);

  // ----- Supabase 로그인 구독 + 마이그레이션 -----
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
      if (event === 'SIGNED_IN' && session?.user) {
        Promise.all([
          migrateLocalToCloud(),
          migrateSongLibraryToCloud(),
          migrateTemplatesToCloud(),
        ])
          .then(([conti, songsR, templates]) => {
            const total = conti.migrated + songsR.migrated + templates.migrated;
            if (total > 0) {
              showToast(`이전에 쓰던 데이터를 클라우드에 저장했어요 (${total}개)`);
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

  const handleSignIn = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      showToast('로그인 기능이 설정되지 않았어요');
      return;
    }
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      showToast('로그인 시작에 실패했어요');
      setAuthBusy(false);
    }
  };
  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setAuthBusy(true);
    await supabase.auth.signOut();
    setAuthBusy(false);
    showToast('로그아웃 됐어요');
  };

  // ----- 파일 처리 -----
  const MAX_IMAGES = 10; // 한 번에 올릴 수 있는 최대 장수(서버 분석 한도와 동일)
  // 10장을 넘으면 자르지 않고 통째로 막는다(경고 + 추가 안 함).
  const addFiles = (incoming: File[]) => {
    if (!incoming.length) return;
    if (files.length + incoming.length > MAX_IMAGES) {
      showToast('이미지는 10개 이하만 올려주세요');
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
  };
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };
  const removeFile = (i: number) =>
    setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // 파일 → 썸네일 생성
  useEffect(() => {
    let cancelled = false;
    const fileToDataUrl = (f: File): Promise<string> =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(f);
      });
    (async () => {
      const next: string[] = [];
      for (const f of files) {
        try {
          if (f.type === 'application/pdf') {
            next.push(await pdfFirstPageThumb(f));
          } else {
            next.push(await fileToDataUrl(f));
          }
        } catch {
          next.push('');
        }
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  // ----- Gemini 추출 -----
  const handleExtract = async () => {
    if (files.length === 0 && !pasted.trim()) {
      showToast('악보를 올리거나 가사를 붙여 넣어주세요');
      return;
    }
    setExtracting(true);
    setLoadingMsg('가사 추출 중');
    setProgressStep(1);
    try {
      if (pasteMode && pasted.trim()) {
        // 텍스트 직접 붙여넣기 분석
        setProgressStep(3);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: pasted.trim(),
            hint: buildCorrectionHint(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 실패');
        if (data.songs?.length) {
          // 라이브러리 재사용 → 대조 검토 → 적립 → 요약 토스트까지 한 번에
          await ingestExtractedSongs(data.songs);
          setPasted('');
          document.getElementById('m-sec-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          showToast('가사를 찾을 수 없어요');
        }
      } else {
        // 파일 분석
        setProgressStep(1);
        const images: { data: string; mimeType: string }[] = [];
        for (const f of files) {
          if (f.type === 'application/pdf') {
            setProgressStep(2);
            const pages = await pdfToImages(f, 2);
            for (const p of pages) images.push({ data: p.data, mimeType: p.mimeType });
          } else if (f.type.startsWith('image/')) {
            const img = await fileToBase64(f);
            images.push(img);
          }
        }
        setProgressStep(3);
        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ images, hint: buildCorrectionHint() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 실패');
        if (data.songs?.length) {
          // 라이브러리 재사용 → 대조 검토 → 적립 → 요약 토스트까지 한 번에
          await ingestExtractedSongs(data.songs);
          // 오타 검토용 이미지 캐싱 + 이전 검토 결과 초기화
          extractedImagesRef.current = images;
          setSuspectMap({});
          document.getElementById('m-sec-2')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          showToast('가사를 찾을 수 없어요');
        }
      }
    } catch (err: any) {
      showToast(`오류: ${err.message}`);
    } finally {
      setExtracting(false);
      setProgressStep(0);
      setLoadingMsg('');
    }
  };

  // ----- 곡 조작 -----
  const updateSong = (idx: number, next: Song) => {
    setSongs((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
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
  const removeSong = (idx: number) => {
    setSongs((prev) => prev.filter((_, i) => i !== idx));
    showToast('곡 제거됨');
  };
  const addEmptySong = () => {
    setSongs((prev) => [...prev, { title: '새 곡', sections: [] }]);
    showToast('빈 곡 추가됨 — 제목 클릭해 수정');
  };

  // 전체 오타 검토 — 추출 시점 이미지 + 현재 songs를 verify-lyrics에 보냄.
  const handleVerifyLyrics = async () => {
    if (songs.length === 0) {
      showToast('검토할 곡이 없어요');
      return;
    }
    if (extractedImagesRef.current.length === 0) {
      showToast('원본 악보 이미지를 찾을 수 없어요. 다시 추출해 주세요.');
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
        showToast('의심 부분 없음 — 추출 결과 깔끔합니다');
      } else {
        showToast(`${totalCount}건 확인 필요 — 빨간 점 있는 곡 확인`);
      }
    } catch (err: any) {
      showToast(`검토 실패: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  // 사용자 수정으로 의심 substring이 없어지면 자동 클린업
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

  // ----- 다운로드 헬퍼 -----
  const dateStr = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
  };
  const textForExport = (): string =>
    text
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

  const handleCopy = async () => {
    const out = textForExport();
    if (!out) {
      showToast('비어있어요');
      return;
    }
    await navigator.clipboard.writeText(out);
    showToast('복사됨');
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
  const handleCopyShareLink = () => {
    const hash = encodeStateToHash({ songs, text });
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    navigator.clipboard.writeText(url).then(() => showToast('공유 링크 복사됨'));
  };

  // PptSlide는 text-doc.ts의 Slide와 동일 타입이라 변환 없이 그대로 사용.
  // 이렇게 해야 title 슬라이드의 kind 정보가 살아남아 PPT에서 볼드/큰 폰트로 그려진다.
  const buildPptSlides = (): PptSlide[] => buildSlidesFromText(text);

  // 4줄 한도 초과 슬라이드 인덱스 — text가 바뀔 때마다 자동 재계산. UI에서 빨간 강조용.
  const overflowSlideIndices = useMemo(() => {
    const slides = buildSlidesFromText(text);
    const out: number[] = [];
    slides.forEach((s, i) => {
      if (!validateSlide(s).ok) out.push(i);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const handleSavePptx = async () => {
    const slides = buildPptSlides();
    if (slides.length === 0) {
      showToast('PPT로 만들 슬라이드가 없어요');
      return;
    }
    if (overflowSlideIndices.length > 0) {
      const list = overflowSlideIndices.map((i) => i + 1).join(', ');
      showToast(`${list}번 슬라이드 4줄 초과 — 미리보기에서 확인`);
      return;
    }
    try {
      const fname = `contionote-${Date.now()}.pptx`;
      // 저작권 슬라이드 기능 제거됨 → copyright는 항상 undefined.
      await exportToPptx(slides, pptFont, fname, pptTheme, undefined, pptVAlign, embedFont, customBg?.src, customBg?.kind === 'gif', songThemes);
      showToast('PPT 다운로드 시작');
    } catch (err: any) {
      showToast(`PPT 생성 실패: ${err.message}`);
    }
  };
  // 즉시 공유 — 만든 PPT 파일을 네이티브 공유 시트로(카톡·메일·드라이브 등). 미지원 시 다운로드 폴백.
  const handleSharePptx = async () => {
    const slides = buildPptSlides();
    if (slides.length === 0) { showToast('PPT로 만들 슬라이드가 없어요'); return; }
    if (overflowSlideIndices.length > 0) {
      const list = overflowSlideIndices.map((i) => i + 1).join(', ');
      showToast(`${list}번 슬라이드 4줄 초과 — 미리보기에서 확인`);
      return;
    }
    const fname = `contionote-${Date.now()}.pptx`;
    try {
      const blob = (await exportToPptx(slides, pptFont, fname, pptTheme, undefined, pptVAlign, embedFont, customBg?.src, customBg?.kind === 'gif', songThemes, true)) as Blob;
      const file = new File([blob], fname, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
      const nav = navigator as Navigator & { canShare?: (d?: any) => boolean };
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: '콘티노트 PPT', text: '콘티노트로 만든 예배 PPT예요.' });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      showToast('이 기기는 즉시 공유가 안 돼 다운로드했어요 — 받은 파일을 공유하세요');
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      showToast('공유 준비 실패 — 다시 시도해 주세요');
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
  };

  const hasResult = songs.length > 0;
  const isEmpty = !text || !text.trim();
  const slideCount = buildSlidesFromText(text).length;

  // (단계 위저드 제거 — canGoNext/goNext/goBack 불필요)

  // 디자인 변경 — paper ↔ wanted
  const toggleTheme = () => {
    setDesignTheme((t) => (t === 'paper' ? 'wanted' : 'paper'));
  };

  // "데스크탑으로 보기" 제거 — 모바일은 모바일 전용 화면만 쓴다(사용자 요청).

  // SSR + hydration 깜빡임 방지 — introSeen이 결정되기 전까진 빈 화면
  if (introSeen === null) {
    return <div className="m-app" />;
  }

  return (
    <div className="m-app">
      {/* ===== Top Bar — 미니 헤더 ===== */}
      <header className="m-header">
        {/* 브랜드(로고) 클릭 → 사용법 캐러셀 다시 보기 */}
        <button
          type="button"
          className="m-brand m-brand-button"
          onClick={() => setShowGuide(true)}
          aria-label="사용법 보기"
          title="사용법 다시 보기"
        >
          <BrandMark size={40} />
          <span className="m-brand-name">콘티노트</span>
        </button>
        <div className="m-header-actions">
          {/* 구글 로그인 — 메뉴 안에 숨기지 않고 헤더 맨 앞에 노출(가입 유도). 로그인하면 숨김. */}
          {isSupabaseConfigured() && !authUser && (
            <button
              type="button"
              className="m-login-btn"
              onClick={handleSignIn}
              disabled={authBusy}
              aria-label="구글 로그인"
            >
              <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 5 }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
              </svg>
              로그인
            </button>
          )}
          {/* 디자인 토글 — 두 톤 전환 */}
          <button
            type="button"
            className="m-icon-btn"
            onClick={toggleTheme}
            aria-label="디자인 변경"
            title={`현재: ${designTheme === 'paper' ? '종이톤' : '기본톤'}`}
          >
            ✦
          </button>
          {/* 햄버거 메뉴 — 사용법/데스크탑/로그인 등 보조 액션 모음 */}
          <button
            type="button"
            className="m-icon-btn m-menu-btn"
            onClick={() => setMenuOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <line x1="3" y1="6" x2="17" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="3" y1="14" x2="17" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* ===== 메뉴 바텀시트 ===== */}
      {menuOpen && (
        <MobileMenuSheet
          onClose={() => setMenuOpen(false)}
          onOpenGuide={() => {
            setMenuOpen(false);
            setShowGuide(true);
          }}
          onOpenLibrary={() => {
            setMenuOpen(false);
            setShowLibrary(true);
          }}
          onOpenWorship={() => {
            setMenuOpen(false);
            // 데스크탑과 동일 — 프리미엄은 빌더로, 아니면 요금제 안내(업셀)
            if (premiumUnlocked) window.location.href = '/worship';
            else setPricingOpen(true);
          }}
          premiumUnlocked={premiumUnlocked}
          authUser={authUser}
          authBusy={authBusy}
          onSignIn={() => {
            setMenuOpen(false);
            handleSignIn();
          }}
          onSignOut={() => {
            setMenuOpen(false);
            handleSignOut();
          }}
          supabaseEnabled={isSupabaseConfigured()}
        />
      )}

      {/* ===== 사용법 가이드 (메뉴 → 사용법 보기) ===== */}
      {showGuide && <OnboardingGuide onClose={() => setShowGuide(false)} />}

      {/* ===== 곡 라이브러리 (메뉴 → 곡 라이브러리) ===== */}
      {/* onAdd: 라이브러리에서 고른 곡을 현재 콘티(songs) 맨 뒤에 추가한다. */}
      {/* 데스크탑(app/page.tsx)의 onAdd 로직과 동일하게 맞췄다. */}
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

      {/* ===== 빠른 이동 칩 — 누르면 해당 패널로 스크롤 (sticky) ===== */}
      <div className="m-steps">
        {[
          { n: 1, id: 'm-sec-1', label: '업로드' },
          { n: 2, id: 'm-sec-2', label: '가사' },
          { n: 3, id: 'm-sec-3', label: '슬라이드' },
        ].map((s) => (
          <button
            key={s.n}
            type="button"
            className="m-step-pill"
            onClick={() =>
              document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          >
            <span className="m-step-num">{s.n}</span>
            <span className="m-step-label">{s.label}</span>
          </button>
        ))}
      </div>

      {/* ===== 현재 단계 본문 ===== */}
      <main className="m-main">
        <div id="m-sec-1" style={{ scrollMarginTop: 64 }}>
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
        </div>

        <div id="m-sec-2" style={{ scrollMarginTop: 64 }}>
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
            onSaveLibrary={handleSaveLibrary}
            saving={savingLibrary}
          />
        </div>

        {/* 03 슬라이드 편집 — 데스크탑과 같은 SlideStudio(좁은 화면에선 목록/캔버스/배경이 세로로 쌓임).
            기존 EditorSection+PptSection+곡별배경+하단독을 이 하나로 통합(모바일도 동일 기능·새 배경). */}
        <div id="m-sec-3" style={{ scrollMarginTop: 64 }}>
          {/* Undo/Redo — 모바일은 단축키가 없어 버튼으로 노출 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={handleUndo} aria-label="되돌리기"
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--surface, #fff)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14 }}>되돌리기</button>
            <button type="button" onClick={handleRedo} aria-label="다시 실행"
              style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--rule)', background: 'var(--surface, #fff)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14 }}>다시 실행</button>
          </div>
          <SlideStudio
            text={text}
            setText={setText}
            selected={studioSelected}
            setSelected={setStudioSelected}
            pptTheme={pptTheme}
            setPptTheme={setPptTheme}
            pptFont={pptFont}
            setPptFont={setPptFont}
            pptVAlign={pptVAlign}
            setPptVAlign={setPptVAlign}
            songThemes={songThemes}
            setSongThemes={setSongThemes}
            customBg={customBg}
            savedBgs={savedBgs}
            onCustomBgChange={handleCustomBgChange}
            onCustomNotice={showToast}
            onSelectSaved={(bg) => {
              setCustomBg({ src: bg.url, kind: bg.kind });
              setPptTheme('custom');
            }}
            onDeleteSaved={handleDeleteSavedBg}
            premiumUnlocked={premiumUnlocked}
            onLockedPremium={() => setPricingOpen(true)}
            overflowSlideIndices={overflowSlideIndices}
            onClear={() => {
              if (confirm('콘티를 모두 비울까요?')) {
                setText('');
                try { window.localStorage.removeItem('contino-working-draft'); } catch {}
              }
            }}
            onCopy={handleCopy}
            onDownloadTxt={handleSaveTxt}
            onOpenPreview={() => setPreviewOpen(true)}
            onDownloadPptx={handleSavePptx}
            onSharePptx={handleSharePptx}
          />
        </div>
      </main>

      {/* PPT 전체 미리보기 */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        text={text}
        pptTheme={pptTheme}
        songThemes={songThemes}
        pptFont={pptFont}
        pptVAlign={pptVAlign}
        overflowSlideIndices={overflowSlideIndices}
        customBgUrl={customBg?.src ?? null}
        customBgIsGif={customBg?.kind === 'gif'}
        onSelectSlide={(i) => {
          setStudioSelected(i);
          setPreviewOpen(false);
        }}
      />

      <PricingModal open={pricingOpen} onClose={() => setPricingOpen(false)} />

      {/* 토스트 */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 모바일 메뉴 바텀시트 — ☰ 햄버거 누르면 바닥에서 슉 올라옴.
// 사용법 / 인트로로 돌아가기 / 데스크탑 보기 / 로그인-로그아웃 같은 보조 액션.
// ────────────────────────────────────────────────────────────────────────
function MobileMenuSheet({
  onClose,
  onOpenGuide,
  onOpenLibrary,
  onOpenWorship,
  premiumUnlocked,
  authUser,
  authBusy,
  onSignIn,
  onSignOut,
  supabaseEnabled,
}: {
  onClose: () => void;
  onOpenGuide: () => void;
  onOpenLibrary: () => void;
  onOpenWorship: () => void;
  premiumUnlocked: boolean;
  authUser: User | null;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  supabaseEnabled: boolean;
}) {
  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      {/* 어두운 배경 — 클릭하면 닫힘 */}
      <div className="m-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="m-sheet" role="menu" aria-label="메뉴">
        <div className="m-sheet-handle" aria-hidden="true" />
        <div className="m-sheet-head">
          <span className="label">메뉴</span>
          <button
            type="button"
            className="m-sheet-close"
            onClick={onClose}
            aria-label="메뉴 닫기"
          >
            ✕
          </button>
        </div>

        <div className="m-sheet-list">
          {/* "콘티노트 인트로" 항목 제거 — IntroScreen 폐기, 사용법은 아래 "사용법 보기"로 일원화 */}
          <button type="button" className="m-sheet-item" onClick={onOpenGuide}>
            <span className="m-sheet-item-label">사용법 보기</span>
            <span className="m-sheet-item-sub">4단계로 보는 그림 가이드</span>
          </button>

          {/* 곡 라이브러리 — 한 번 추출한 곡을 다시 불러와 콘티에 추가 */}
          <button type="button" className="m-sheet-item" onClick={onOpenLibrary}>
            <span className="m-sheet-item-label">곡 라이브러리</span>
            <span className="m-sheet-item-sub">저장된 곡 검색해서 다시 추가</span>
          </button>

          {/* 예배 순서 빌더 — 유료(왕관). 프리미엄이면 /worship, 아니면 요금제 안내 */}
          <button type="button" className="m-sheet-item" onClick={onOpenWorship}>
            <span className="m-sheet-item-label">예배 순서 빌더</span>
            <span className="m-sheet-item-sub">
              {premiumUnlocked ? '예배 순서 전체를 한 PPT로' : '유료 기능 — 미리보기'}
            </span>
          </button>

          {supabaseEnabled && (
            <div className="m-sheet-auth">
              {authUser ? (
                <button
                  type="button"
                  className="m-sheet-item"
                  onClick={onSignOut}
                  disabled={authBusy}
                >
                  <span className="m-sheet-item-label">로그아웃</span>
                  <span className="m-sheet-item-sub">{authUser.email ?? ''}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="m-sheet-google"
                  onClick={onSignIn}
                  disabled={authBusy}
                >
                  <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                    <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                    <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z" />
                    <path fill="#FBBC05" d="M3.96 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04z" />
                    <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.32C4.68 5.16 6.66 3.58 9 3.58z" />
                  </svg>
                  {authBusy ? '연결 중…' : 'Google로 로그인'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
