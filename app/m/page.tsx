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
import { canUseCustomBg } from '@/lib/custom-bg';
import { pdfToImages, fileToBase64, pdfFirstPageThumb } from '@/lib/pdf';
import { exportToDocx } from '@/lib/docx';
import { encodeStateToHash } from '@/lib/url-sync';
import { recordCorrection, buildCorrectionHint } from '@/lib/ocr-learning';
import { buildPlainSlidesTxt, buildOpenSongXml, downloadText } from '@/lib/export-formats';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { exportToPptx, validateSlide, type PptCopyrightInfo, type PptFont, type PptSlide, type PptTheme, type PptVAlign } from '@/lib/pptx';
import { buildSlidesFromText } from '@/lib/text-doc';
import { addToLibraryAsync, migrateSongLibraryToCloud } from '@/lib/song-library-cloud';
import { migrateLocalToCloud } from '@/lib/conti-cloud';
import { migrateTemplatesToCloud } from '@/lib/template-cloud';
import BrandMark from '@/components/BrandMark';
import UploadSection from '@/components/UploadSection';
import ExtractedSection from '@/components/ExtractedSection';
// MobileSongPicker 제거 — 단일 스크롤에선 위 ExtractedSection의 칩으로 콘티에 추가한다.
import EditorSection from '@/components/EditorSection';
import PptSection from '@/components/PptSection';
import PreviewModal from '@/components/PreviewModal';
import OnboardingGuide from '@/components/OnboardingGuide';
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

  // 업로드 옵션
  const [accuracyMode, setAccuracyMode] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasted, setPasted] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [progressStep, setProgressStep] = useState<0 | 1 | 2 | 3>(0);
  const [dragging, setDragging] = useState(false);

  // PPT 옵션
  const [pptFont, setPptFont] = useState<PptFont>('nanum-gothic');
  // 내 교회 PPT(커스텀 배경) 이미지 — 세션 한정(저장 안 됨). 운영자 계정만 사용 가능(유료 예정).
  const [customBg, setCustomBg] = useState<string | null>(null);
  // 잠금 해제 여부 — localStorage는 렌더 중에 읽으면 hydration이 어긋나므로 effect에서 판별.
  const [customUnlocked, setCustomUnlocked] = useState(false);
  const [pptTheme, setPptTheme] = useState<PptTheme>('black');
  // PPT 세로 정렬 — 기본 가운데. 데스크탑과 동일하게 미리보기·PPT 동시 적용.
  const [pptVAlign, setPptVAlign] = useState<PptVAlign>('middle');
  // 글꼴 포함(임베드) — 기본 ON. 본명조 선택 시 글꼴을 PPT에 심어 어디서나 똑같이.
  const [embedFont, setEmbedFont] = useState(true);
  // 저작권(CCLI) 상태 제거됨 — 한국 교회 미사용
  const [previewOpen, setPreviewOpen] = useState(false);

  // Auth + 디자인
  const [authUser, setAuthUser] = useState<User | null>(null);
  // 내 교회 PPT 잠금 해제 — 운영자 이메일 또는 테스트 스위치(localStorage)
  useEffect(() => {
    setCustomUnlocked(canUseCustomBg(authUser?.email));
  }, [authUser]);
  const [authBusy, setAuthBusy] = useState(false);
  const [designTheme, setDesignTheme] = useState<DesignTheme>('wanted');

  // 메뉴 시트 — ☰ 햄버거 눌렀을 때 바닥에서 슉 올라옴.
  // 안에 사용법 / 데스크탑으로 보기 / 로그아웃 등 잘 안 쓰는 액션 모음.
  const [menuOpen, setMenuOpen] = useState(false);
  // 사용법 가이드(OnboardingGuide) 표시 여부 — 메뉴의 "사용법 보기"로 연다.
  const [showGuide, setShowGuide] = useState(false);

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
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    setFiles((prev) => [...prev, ...dropped]);
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
            accuracyMode,
            hint: buildCorrectionHint(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 실패');
        if (data.songs?.length) {
          const newSongs: Song[] = data.songs;
          setSongs((prev) => [...prev, ...newSongs]);
          // 가사 대조 검토 — 같은 제목의 확정본이 있으면 배너로 일치율·교정 제안 표시 (비동기)
          attachRefChecks(newSongs, setSongs);
          void addToLibraryAsync(data.songs);
          setPasted('');
          showToast(`${data.songs.length}곡 추출됨`);
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
            const pages = await pdfToImages(f, accuracyMode ? 2 : undefined);
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
          body: JSON.stringify({ images, accuracyMode, hint: buildCorrectionHint() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '분석 실패');
        if (data.songs?.length) {
          const newSongs: Song[] = data.songs;
          setSongs((prev) => [...prev, ...newSongs]);
          // 가사 대조 검토 — 같은 제목의 확정본이 있으면 배너로 일치율·교정 제안 표시 (비동기)
          attachRefChecks(newSongs, setSongs);
          void addToLibraryAsync(data.songs);
          // 오타 검토용 이미지 캐싱 + 이전 검토 결과 초기화
          extractedImagesRef.current = images;
          setSuspectMap({});
          showToast(`${data.songs.length}곡 추출됨`);
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
      await exportToPptx(slides, pptFont, fname, pptTheme, undefined, pptVAlign, embedFont, customBg ?? undefined);
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
          <BrandMark size={28} />
          <span className="m-brand-name">콘티노트</span>
        </button>
        <div className="m-header-actions">
          {/* 디자인 토글 — 두 톤 전환은 자주 쓰는 액션이라 메뉴 밖에 둠 */}
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

      {/* ===== 빠른 이동 칩 — 누르면 해당 패널로 스크롤 (sticky) ===== */}
      <div className="m-steps">
        {[
          { n: 1, id: 'm-sec-1', label: '업로드' },
          { n: 2, id: 'm-sec-2', label: '곡 확인' },
          { n: 3, id: 'm-sec-3', label: '콘티' },
          { n: 4, id: 'm-sec-4', label: 'PPT' },
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
          />
        </div>

        <div id="m-sec-3" style={{ scrollMarginTop: 64 }}>
            {/* Undo/Redo 액션 바 — 모바일엔 단축키가 없어 버튼으로 노출.
                EditorSection은 그대로 두고 위에 별도 바를 둬서 공용 컴포넌트는 영향 없음. */}
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 8,
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={handleUndo}
                aria-label="되돌리기"
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--rule)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                되돌리기
              </button>
              <button
                type="button"
                onClick={handleRedo}
                aria-label="다시 실행"
                style={{
                  padding: '6px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--rule)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                다시 실행
              </button>
            </div>
            <EditorSection
              text={text}
              setText={setText}
              onClear={() => {
                if (confirm('콘티를 모두 비울까요?')) setText('');
              }}
              onCopy={handleCopy}
              onDownloadTxt={handleSaveTxt}
              onDownloadDocx={handleSaveDocx}
              overflowSlideIndices={overflowSlideIndices}
              // 모바일에선 textarea를 컨텐츠 높이만큼 자연 늘림 + 페이지 스크롤로 통일.
              // (자체 스크롤 + transform 동기화는 모바일에서 거터 어긋남의 원인)
              autoResize
            />
        </div>

        <div id="m-sec-4" style={{ scrollMarginTop: 64 }}>
          <PptSection
            slideCount={slideCount}
            pptFont={pptFont}
            setPptFont={setPptFont}
            pptTheme={pptTheme}
            setPptTheme={setPptTheme}
            pptVAlign={pptVAlign}
            setPptVAlign={setPptVAlign}
            embedFont={embedFont}
            setEmbedFont={setEmbedFont}
            customBg={customBg}
            customUnlocked={customUnlocked}
            onCustomBgChange={(dataUrl) => {
              setCustomBg(dataUrl);
              setPptTheme('custom'); // 올리자마자 바로 적용
              showToast('교회 PPT 이미지가 배경으로 적용됐어요');
            }}
            onLockedCustom={() => showToast('교회 PPT 배경은 유료 기능으로 준비 중이에요 🙏')}
            onOpenPreview={() => setPreviewOpen(true)}
            onDownloadPptx={handleSavePptx}
            onCopyShareLink={handleCopyShareLink}
            onDownloadOpenSong={handleSaveOpenSong}
            onDownloadPlainSlides={handleSavePlainSlides}
          />
        </div>
      </main>

      {/* PPT 전체 미리보기 */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        text={text}
        pptTheme={pptTheme}
        pptFont={pptFont}
        pptVAlign={pptVAlign}
        overflowSlideIndices={overflowSlideIndices}
        customBgUrl={customBg}
      />

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
  authUser,
  authBusy,
  onSignIn,
  onSignOut,
  supabaseEnabled,
}: {
  onClose: () => void;
  onOpenGuide: () => void;
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
