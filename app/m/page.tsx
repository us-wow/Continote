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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { Song } from '@/lib/types';
import { pdfToImages, fileToBase64, pdfFirstPageThumb } from '@/lib/pdf';
import { exportToDocx } from '@/lib/docx';
import { encodeStateToHash } from '@/lib/url-sync';
import { recordCorrection, buildCorrectionHint } from '@/lib/ocr-learning';
import { buildPlainSlidesTxt, buildOpenSongXml, downloadText } from '@/lib/export-formats';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { exportToPptx, validateSlide, type PptCopyrightInfo, type PptFont, type PptSlide, type PptTheme } from '@/lib/pptx';
import { buildSlidesFromText } from '@/lib/text-doc';
import { addToLibraryAsync, migrateSongLibraryToCloud } from '@/lib/song-library-cloud';
import { migrateLocalToCloud } from '@/lib/conti-cloud';
import { migrateTemplatesToCloud } from '@/lib/template-cloud';
import BrandMark from '@/components/BrandMark';
import UploadSection from '@/components/UploadSection';
import ExtractedSection from '@/components/ExtractedSection';
import EditorSection from '@/components/EditorSection';
import PptSection from '@/components/PptSection';
import PreviewModal from '@/components/PreviewModal';
import IntroScreen from '@/components/IntroScreen';
import type { DesignTheme } from '@/components/Header';

export default function MobilePage() {
  // ----- 핵심 상태 -----
  // introSeen: 처음 진입 시 IntroScreen 보여주는 게이트.
  //   null = mount 전 아직 모름(SSR/hydration 깜빡임 방지 위해 처음엔 아무것도 렌더 X)
  //   false = 인트로 표시 중
  //   true = 인트로 건너뛰고 wizard 표시
  const [introSeen, setIntroSeen] = useState<boolean | null>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
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
  const [pptFont, setPptFont] = useState<PptFont>('noto-serif-kr');
  const [pptTheme, setPptTheme] = useState<PptTheme>('black');
  const [ccliNumber, setCcliNumber] = useState('');
  const [licenseLabel, setLicenseLabel] = useState('');
  const [includeCopyright, setIncludeCopyright] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Auth + 디자인
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [designTheme, setDesignTheme] = useState<DesignTheme>('wanted');

  // 토스트
  const [toast, setToast] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }, []);

  // ----- 데스크탑 ↔ 모바일 자동 라우팅 (양방향) -----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const force = new URL(window.location.href).searchParams.get('view');
      if (force === 'desktop' || force === 'mobile') {
        window.localStorage.setItem('conti-view', force);
      } else if (force === 'auto') {
        window.localStorage.removeItem('conti-view');
      }
      const pref = window.localStorage.getItem('conti-view');
      let isMobile: boolean;
      if (pref === 'mobile') isMobile = true;
      else if (pref === 'desktop') isMobile = false;
      else {
        isMobile =
          /iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
          ) || window.matchMedia('(max-width: 768px)').matches;
      }
      if (!isMobile && window.location.pathname === '/m') {
        window.location.replace('/');
      }
    } catch {
      /* noop */
    }
  }, []);

  // ----- 디자인 테마 -----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('conti-design-theme');
      if (saved === 'wanted' || saved === 'paper') setDesignTheme(saved);
    } catch {}
  }, []);

  // ----- 인트로 게이트 — 처음 들어왔으면 IntroScreen, 한 번 본 적 있으면 wizard 직행 -----
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const seen = window.localStorage.getItem('intro-seen');
      setIntroSeen(seen === '1');
    } catch {
      setIntroSeen(true); // localStorage 차단 환경에선 그냥 wizard로
    }
  }, []);

  const dismissIntro = useCallback(() => {
    try {
      window.localStorage.setItem('intro-seen', '1');
    } catch {}
    setIntroSeen(true);
  }, []);
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
              showToast(`이전 데이터 클라우드로 옮겼어요 (${total}개)`);
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
          setSongs((prev) => [...prev, ...data.songs]);
          void addToLibraryAsync(data.songs);
          setPasted('');
          showToast(`${data.songs.length}곡 추출됨`);
          setStep(2); // 다음 단계로 자동 이동
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
          setSongs((prev) => [...prev, ...data.songs]);
          void addToLibraryAsync(data.songs);
          showToast(`${data.songs.length}곡 추출됨`);
          setStep(2);
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

  const buildPptSlides = (): PptSlide[] =>
    buildSlidesFromText(text).map((s) => {
      if (s.kind === 'title') {
        const lines = [s.title];
        if (s.subtitle) lines.push(s.subtitle);
        return { lines };
      }
      if (s.kind === 'memo') return { lines: [s.text] };
      return { lines: s.lines };
    });

  const handleSavePptx = async () => {
    const slides = buildPptSlides();
    if (slides.length === 0) {
      showToast('PPT로 만들 슬라이드가 없어요');
      return;
    }
    const overflow = slides.findIndex((s) => !validateSlide(s).ok);
    if (overflow !== -1) {
      showToast(`${overflow + 1}번 슬라이드 4줄 초과`);
      return;
    }
    try {
      const fname = `contionote-${Date.now()}.pptx`;
      const copyright: PptCopyrightInfo | undefined = includeCopyright
        ? {
            songTitles: songs.map((s) => s.title || 'Untitled'),
            ccliNumber: ccliNumber.trim() || undefined,
            licenseLabel: licenseLabel.trim() || undefined,
          }
        : undefined;
      await exportToPptx(slides, pptFont, fname, pptTheme, copyright);
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

  // 단계 이동 제약 — 비어있는데 다음 단계 진행 못 하게 안내
  const canGoNext = () => {
    if (step === 1) return hasResult; // 추출 결과 있어야 다음
    if (step === 2) return hasResult;
    if (step === 3) return !isEmpty;
    return false;
  };
  const goNext = () => {
    if (step < 4) setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  };
  const goBack = () => {
    if (step > 1) setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
  };

  // 디자인 변경 — paper ↔ wanted
  const toggleTheme = () => {
    setDesignTheme((t) => (t === 'paper' ? 'wanted' : 'paper'));
  };

  const swapToDesktop = () => {
    try {
      window.localStorage.setItem('conti-view', 'desktop');
    } catch {}
    window.location.assign('/');
  };

  // SSR + hydration 깜빡임 방지 — introSeen이 결정되기 전까진 빈 화면
  if (introSeen === null) {
    return <div className="m-app" />;
  }

  // 첫 진입(또는 사용자가 명시적으로 인트로 다시 보기) → IntroScreen
  if (introSeen === false) {
    return (
      <IntroScreen
        theme={designTheme}
        onChangeTheme={setDesignTheme}
        onStart={dismissIntro}
        onGoogleSignIn={handleSignIn}
        authBusy={authBusy}
        authUser={authUser}
        supabaseEnabled={isSupabaseConfigured()}
      />
    );
  }

  return (
    <div className="m-app">
      {/* ===== Top Bar — 미니 헤더 ===== */}
      <header className="m-header">
        {/* 브랜드 클릭 → 인트로 화면으로 돌아감 (localStorage는 그대로 두고 introSeen만 false로).
            "시작하기" 다시 눌러도 어차피 dismissIntro가 동일 값으로 setItem해서 무해. */}
        <button
          type="button"
          className="m-brand m-brand-button"
          onClick={() => setIntroSeen(false)}
          aria-label="초기화면으로 돌아가기"
          title="콘티노트 인트로로"
        >
          <BrandMark size={28} />
          <span className="m-brand-name">콘티노트</span>
        </button>
        <div className="m-header-actions">
          <button
            type="button"
            className="m-icon-btn"
            onClick={toggleTheme}
            aria-label="디자인 변경"
            title={`현재: ${designTheme === 'paper' ? '종이톤' : 'Wanted'}`}
          >
            ✦
          </button>
          {isSupabaseConfigured() &&
            (authUser ? (
              <button
                type="button"
                className="m-icon-btn"
                onClick={handleSignOut}
                disabled={authBusy}
                aria-label="로그아웃"
                title={authUser.email ?? '로그아웃'}
              >
                {(authUser.email ?? '?')[0].toUpperCase()}
              </button>
            ) : (
              <button
                type="button"
                className="m-login-btn"
                onClick={handleSignIn}
                disabled={authBusy}
              >
                <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.96 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.32C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                로그인
              </button>
            ))}
          <button
            type="button"
            className="m-icon-btn m-desktop-swap"
            onClick={swapToDesktop}
            aria-label="데스크탑 화면으로"
            title="데스크탑 화면으로"
          >
            ⊞
          </button>
        </div>
      </header>

      {/* ===== Step indicator — 1/2/3/4 ===== */}
      <div className="m-steps">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            className={`m-step-pill ${step === n ? 'is-active' : ''} ${step > n ? 'is-done' : ''}`}
            onClick={() => setStep(n as 1 | 2 | 3 | 4)}
            aria-current={step === n ? 'step' : undefined}
          >
            <span className="m-step-num">{n}</span>
            <span className="m-step-label">
              {n === 1 ? '업로드' : n === 2 ? '곡 확인' : n === 3 ? '콘티' : 'PPT'}
            </span>
          </button>
        ))}
      </div>

      {/* ===== 현재 단계 본문 ===== */}
      <main className="m-main">
        {step === 1 && (
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
        )}
        {step === 2 && (
          <ExtractedSection
            songs={songs}
            text={text}
            extracting={extracting}
            onUpdateSong={updateSong}
            onRemoveSong={removeSong}
            onAddEmptySong={addEmptySong}
          />
        )}
        {step === 3 && (
          <EditorSection
            text={text}
            setText={setText}
            onClear={() => {
              if (confirm('콘티를 모두 비울까요?')) setText('');
            }}
            onCopy={handleCopy}
            onDownloadTxt={handleSaveTxt}
            onDownloadDocx={handleSaveDocx}
          />
        )}
        {step === 4 && (
          <PptSection
            slideCount={slideCount}
            pptFont={pptFont}
            setPptFont={setPptFont}
            pptTheme={pptTheme}
            setPptTheme={setPptTheme}
            includeCopyright={includeCopyright}
            setIncludeCopyright={setIncludeCopyright}
            onOpenPreview={() => setPreviewOpen(true)}
            onDownloadPptx={handleSavePptx}
            onCopyShareLink={handleCopyShareLink}
            onDownloadOpenSong={handleSaveOpenSong}
            onDownloadPlainSlides={handleSavePlainSlides}
          />
        )}
      </main>

      {/* ===== 하단 단계 이동 바 ===== */}
      <nav className="m-nav">
        {step > 1 && (
          <button type="button" className="btn btn-ghost m-nav-back" onClick={goBack}>
            ← 이전
          </button>
        )}
        {step < 4 && (
          <button
            type="button"
            className="btn btn-primary m-nav-next"
            onClick={goNext}
            disabled={!canGoNext()}
          >
            다음 →
          </button>
        )}
      </nav>

      {/* PPT 전체 미리보기 */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        text={text}
        pptTheme={pptTheme}
        pptFont={pptFont}
      />

      {/* 토스트 */}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
