'use client';

// 슬라이드 스튜디오 — 파워포인트식 단일 워크스페이스 (03 + 04를 한 화면으로 통합).
//
// 배치(데스크탑): [02 추출된 곡 | 슬라이드 목록 | 편집 캔버스 | 배경 패널]  (02는 page.tsx가 좌측에 둠)
//   - 목록: 슬라이드 썸네일. 위/아래 이동·삭제·추가·한꺼번에 붙여넣기.
//   - 캔버스: 선택한 슬라이드를 실제 배경 위에 크게. "그 자리에서" 바로 지우고 쓴다(인플레이스).
//   - 배경 패널: 무료 배경 세로 나열 + 움직이는(유료) 드롭다운 + 맨 밑 커스텀 추가(유료 잠금).
//   - 상단 액션바: 글씨체 변경 · 복사/TXT · 전체 미리보기 · PPT 다운로드 · ⚙ 더보기(정렬/임베드/곡별배경/다른형식).
//
// 데이터 SSOT는 부모 text(빈 줄=슬라이드). 로컬 working copy(blocks)로 빈 슬라이드 편집 지원.
// 04 PptSection의 기능(테마/글씨체/정렬/임베드/커스텀배경/곡별배경/내보내기/다운로드)을 전부 흡수했다.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { buildSlidesFromText, splitTextIntoBlocks, type Slide } from '@/lib/text-doc';
import {
  computeUniformLyricSizes,
  isEmbeddableFont,
  PPT_FONT_LABELS,
  PPT_THEME_LABELS,
  PPT_VALIGN_LABELS,
  type PptFont,
  type PptTheme,
  type PptVAlign,
} from '@/lib/pptx';
import { themeVisual, vAlignToFlex, FONT_FAMILY_PREVIEW, ptToCqw, THEME_BG } from '@/lib/slide-visual';
import { fileToDataUrl, CUSTOM_BG_MAX_BYTES, type CustomBg } from '@/lib/custom-bg';
import { videoFileToGif } from '@/lib/video-to-gif';
import type { SavedBg } from '@/lib/custom-bg-cloud';
import { SlidePreview } from '@/components/LivePreview';
import SongThemePicker from '@/components/SongThemePicker';

// 배경 — PptSection THEME_GROUPS와 동일한 무료/유료(움직이는) 구분.
const FREE_THEMES: PptTheme[] = ['black', 'white', 'paper', 'bible', 'meadow', 'cross', 'sunrise', 'milkyway', 'godrays', 'wheat', 'sea', 'flowers'];
const PREMIUM_THEMES: PptTheme[] = ['light', 'dawn', 'serene', 'green', 'gold', 'pink', 'violet', 'wave', 'mist', 'candle', 'grace', 'aurora', 'crosslight'];

type SlideType = 'lyric' | 'title' | 'memo';

function parseBlock(raw: string): { type: SlideType; content: string } {
  const lines = raw.split('\n');
  const first = lines[0] ?? '';
  if (first.startsWith('# ')) return { type: 'title', content: [first.slice(2), ...lines.slice(1)].join('\n') };
  if (first.startsWith('> ')) return { type: 'memo', content: [first.slice(2), ...lines.slice(1)].join('\n') };
  return { type: 'lyric', content: raw };
}
function toRaw(type: SlideType, content: string): string {
  if (type === 'title') return `# ${content}`;
  if (type === 'memo') return `> ${content}`;
  return content;
}
function slideForBlock(raw: string): Slide {
  return buildSlidesFromText(raw)[0] ?? ({ kind: 'lyric', lines: [''] } as Slide);
}

type SlideStudioProps = {
  text: string;
  setText: (next: string) => void;
  pptTheme: PptTheme;
  setPptTheme: (t: PptTheme) => void;
  pptFont: PptFont;
  setPptFont: (f: PptFont) => void;
  pptVAlign: PptVAlign;
  setPptVAlign: (v: PptVAlign) => void;
  embedFont: boolean;
  setEmbedFont: (v: boolean) => void;
  songThemes?: (PptTheme | undefined)[];
  setSongThemes: (next: (PptTheme | undefined)[]) => void;
  customBg: CustomBg | null;
  savedBgs: SavedBg[];
  onCustomBgChange: (bg: CustomBg, note?: string) => void;
  onCustomNotice: (msg: string) => void;
  onSelectSaved: (bg: SavedBg) => void;
  onDeleteSaved: (bg: SavedBg) => void;
  premiumUnlocked: boolean;
  onLockedPremium: () => void;
  overflowSlideIndices?: number[];
  onClear: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadDocx: () => void;
  onOpenPreview: () => void;
  onDownloadPptx: () => void;
  onCopyShareLink: () => void;
  onDownloadOpenSong: () => void;
  onDownloadPlainSlides: () => void;
};

export default function SlideStudio(props: SlideStudioProps) {
  const {
    text, setText, pptTheme, setPptTheme, pptFont, setPptFont, pptVAlign, setPptVAlign,
    embedFont, setEmbedFont, songThemes, setSongThemes, customBg, savedBgs,
    onCustomBgChange, onCustomNotice, onSelectSaved, onDeleteSaved,
    premiumUnlocked, onLockedPremium, overflowSlideIndices = [],
    onClear, onCopy, onDownloadTxt, onDownloadDocx, onOpenPreview,
    onDownloadPptx, onCopyShareLink, onDownloadOpenSong, onDownloadPlainSlides,
  } = props;

  const [blocks, setBlocks] = useState<string[]>(() => splitTextIntoBlocks(text));
  const [selected, setSelected] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [converting, setConverting] = useState<{ pct: number; label: string } | null>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSerializedRef = useRef(text);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // 외부에서 text가 바뀌면(되돌리기/추출/라이브러리/비우기) 로컬 목록 재동기화.
  useEffect(() => {
    if (text !== lastSerializedRef.current) {
      const fresh = splitTextIntoBlocks(text);
      setBlocks(fresh);
      lastSerializedRef.current = text;
      setSelected((s) => Math.max(0, Math.min(s, fresh.length - 1)));
    }
  }, [text]);

  // 로컬 목록 → 부모 text(빈 칸 제외). lastSerializedRef로 우리 변경/외부 변경 구분.
  const commit = (next: string[], nextSelected?: number) => {
    setBlocks(next);
    if (nextSelected !== undefined) setSelected(nextSelected);
    const serialized = next.filter((b) => b.trim().length > 0).join('\n\n');
    lastSerializedRef.current = serialized;
    setText(serialized);
  };

  // 02 추출 칩 → conti:append: 새 슬라이드로 이어붙이고 마지막 선택. (updater 안 side effect 금지)
  useEffect(() => {
    const onAppend = (e: Event) => {
      const chunk = (e as CustomEvent<{ chunk: string }>).detail?.chunk;
      if (!chunk) return;
      const add = splitTextIntoBlocks(chunk);
      if (!add.length) return;
      const next = [...blocksRef.current, ...add];
      commit(next, next.length - 1);
    };
    window.addEventListener('conti:append', onAppend as EventListener);
    return () => window.removeEventListener('conti:append', onAppend as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setText]);

  const safeSelected = blocks.length > 0 ? Math.min(selected, blocks.length - 1) : 0;
  const slidesForBlocks = useMemo(() => blocks.map(slideForBlock), [blocks]);
  const lyricSizes = useMemo(() => computeUniformLyricSizes(slidesForBlocks), [slidesForBlocks]);
  const perSlideTheme = useMemo(() => {
    let songIndex = -1;
    return slidesForBlocks.map((s) => {
      if (s.kind === 'title') songIndex++;
      return (songIndex >= 0 && songThemes?.[songIndex]) || pptTheme;
    });
  }, [slidesForBlocks, songThemes, pptTheme]);
  const realSlideCount = useMemo(() => buildSlidesFromText(text).length, [text]);
  const songTitles = useMemo(
    () => buildSlidesFromText(text).filter((s) => s.kind === 'title').map((s) => (s.kind === 'title' ? s.title : '')),
    [text]
  );

  const customBgUrl = customBg?.src ?? null;
  const customBgIsGif = customBg?.kind === 'gif';
  const previewFont = FONT_FAMILY_PREVIEW[pptFont];
  const previewVAlign = vAlignToFlex(pptVAlign);

  // ── 슬라이드 조작 ──
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next, j);
  };
  const removeSlide = (i: number) => {
    const next = blocks.filter((_, k) => k !== i);
    commit(next, Math.max(0, Math.min(i, next.length - 1)));
  };
  const addAfter = (i: number) => {
    const next = [...blocks];
    next.splice(i + 1, 0, '');
    commit(next, i + 1);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  // 인플레이스 편집 — 빈 줄(엔터 두 번)이 실제로 들어오면 그 자리에서 슬라이드를 나눈다.
  // 평소 타이핑은 통째 한 블록 유지(줄 끝 공백·캐럿 보존).
  const editContent = (value: string) => {
    const cur = parseBlock(blocks[safeSelected] ?? '');
    const raw = toRaw(cur.type, value);
    if (/\n[ \t]*\n/.test(raw)) {
      const pieces = splitTextIntoBlocks(raw);
      // 끝에서 엔터 두 번 → 빈 새 슬라이드를 만들어 거기서 이어 쓰게 한다.
      const trailingBlank = /\n[ \t]*\n[ \t]*$/.test(raw);
      const replacement = pieces.length > 0 ? [...pieces, ...(trailingBlank ? [''] : [])] : [''];
      const next = [...blocks.slice(0, safeSelected), ...replacement, ...blocks.slice(safeSelected + 1)];
      // 방금 친(=마지막) 조각으로 선택·포커스 이동 → 캐럿이 첫 슬라이드로 튀지 않는다.
      const newSel = safeSelected + replacement.length - 1;
      commit(next, newSel);
      requestAnimationFrame(() => editRef.current?.focus());
    } else {
      const next = [...blocks];
      next[safeSelected] = raw;
      commit(next, safeSelected);
    }
  };
  const setType = (type: SlideType) => {
    const cur = parseBlock(blocks[safeSelected] ?? '');
    const next = [...blocks];
    next[safeSelected] = toRaw(type, cur.content);
    commit(next, safeSelected);
  };
  const doBulkAppend = () => {
    const add = splitTextIntoBlocks(bulkText);
    if (add.length) commit([...blocks, ...add], blocks.length);
    setBulkText('');
    setBulkOpen(false);
  };

  // ── 커스텀 배경 업로드 (유료) — PptSection과 동일 로직 ──
  const onPickCustom = () => {
    if (!premiumUnlocked) { onLockedPremium(); return; }
    if (converting) return;
    fileRef.current?.click();
  };
  const handleCustomFile = async (file: File) => {
    try {
      if (file.type.startsWith('video/')) {
        setConverting({ pct: 0, label: '변환 준비' });
        const res = await videoFileToGif(file, (pct, label) => setConverting({ pct, label }));
        if (res.bytes > CUSTOM_BG_MAX_BYTES) { onCustomNotice('변환해도 10MB가 넘어요 — 더 짧은 영상으로 해주세요'); return; }
        onCustomBgChange({ src: res.dataUrl, kind: 'gif' }, res.trimmed ? '영상이 길어서 앞 10초만 사용했어요' : undefined);
      } else if (file.type === 'image/gif') {
        if (file.size > CUSTOM_BG_MAX_BYTES) { onCustomNotice('GIF가 10MB를 넘어요 — 더 작은 파일로 해주세요'); return; }
        onCustomBgChange({ src: await fileToDataUrl(file), kind: 'gif' });
      } else if (/^image\/(png|jpe?g|webp)$/.test(file.type)) {
        onCustomBgChange({ src: await fileToDataUrl(file), kind: 'image' });
      } else {
        onCustomNotice('이미지(JPG·PNG)·GIF·짧은 영상(MP4)만 올릴 수 있어요');
      }
    } catch (err) {
      console.warn('[custom-bg] 처리 실패:', err);
      onCustomNotice('파일을 처리하지 못했어요 — 다른 파일로 해보세요');
    } finally {
      setConverting(null);
    }
  };
  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleCustomFile(file);
  };

  const sel = parseBlock(blocks[safeSelected] ?? '');
  const isEmpty = blocks.length === 0;
  // 캔버스 글씨 크기 — 가사는 곡 단위 통일, 제목/메모는 고정.
  const canvasFontPt = sel.type === 'title' ? 60 : sel.type === 'memo' ? 36 : lyricSizes[safeSelected] ?? 40;
  const canvasVisual = themeVisual(perSlideTheme[safeSelected] ?? pptTheme, customBgUrl, customBgIsGif);

  // 캔버스 입력칸 높이를 내용에 맞춰(세로 중앙정렬 유지). 폭/내용/글씨 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    const ta = editRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [sel.content, safeSelected, canvasFontPt, pptFont, blocks.length]);
  useEffect(() => {
    const onResize = () => {
      const ta = editRef.current;
      if (!ta) return;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 배경 스와치 한 칸 (세로 패널용 — 가로로 넓게).
  const Swatch = ({ theme, locked }: { theme: PptTheme; locked: boolean }) => (
    <button
      type="button"
      onClick={() => (locked ? onLockedPremium() : setPptTheme(theme))}
      title={PPT_THEME_LABELS[theme] + (locked ? ' (유료)' : '')}
      aria-pressed={pptTheme === theme}
      style={{
        position: 'relative', width: '100%', height: 34, borderRadius: 6,
        background: THEME_BG[theme], backgroundSize: 'cover', backgroundPosition: 'center',
        border: pptTheme === theme ? '2px solid var(--accent, #0f766e)' : '1px solid var(--rule)',
        cursor: 'pointer', opacity: locked ? 0.55 : 1, flex: '0 0 auto',
      }}
    >
      <span style={{ position: 'absolute', left: 5, bottom: 2, fontSize: 9, color: THEME_BG[theme] === '#000000' || /,\s*#0/.test(THEME_BG[theme]) ? '#fff' : '#1F1B16', textShadow: '0 1px 2px rgba(0,0,0,0.4)', fontWeight: 600 }}>
        {PPT_THEME_LABELS[theme].split(' ')[0]}
      </span>
      {locked && <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 10 }} aria-hidden="true">👑</span>}
    </button>
  );

  const miniBtn: React.CSSProperties = { width: 22, height: 18, fontSize: 11, lineHeight: 1, border: '1px solid var(--rule)', borderRadius: 5, background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer', padding: 0 };
  const addBtn: React.CSSProperties = { flex: 1, padding: '7px 8px', fontSize: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer' };

  return (
    <section className="ss-root panel" aria-label="슬라이드 스튜디오" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}>
      {/* ── 상단 액션바 ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--rule)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
          글씨체
          <select value={pptFont} onChange={(e) => setPptFont(e.target.value as PptFont)} style={{ fontSize: 13, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--rule)' }}>
            {(Object.keys(PPT_FONT_LABELS) as PptFont[]).map((f) => (
              <option key={f} value={f}>{PPT_FONT_LABELS[f]}</option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-text btn-sm" onClick={onCopy} disabled={isEmpty}>📋 복사</button>
          <button type="button" className="btn btn-text btn-sm" onClick={onDownloadTxt} disabled={isEmpty}>📄 TXT</button>
          <button type="button" className="btn btn-text btn-sm" onClick={onOpenPreview} disabled={isEmpty}>👁 미리보기</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onDownloadPptx} disabled={isEmpty}>⬇ PPT 다운로드</button>
          <button type="button" className="btn btn-text btn-sm" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}>⚙ 더보기</button>
        </div>
      </div>

      {/* ── ⚙ 더보기: 04에서 흡수한 보조 설정 ── */}
      {moreOpen && (
        <div style={{ border: '1px solid var(--rule)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 12, background: 'color-mix(in oklab, var(--ink) 3%, transparent)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>세로 정렬</span>
              {(Object.keys(PPT_VALIGN_LABELS) as PptVAlign[]).map((v) => (
                <button key={v} type="button" onClick={() => setPptVAlign(v)} aria-pressed={pptVAlign === v}
                  style={{ padding: '4px 10px', fontSize: 12, borderRadius: 12, cursor: 'pointer', border: pptVAlign === v ? '1.5px solid var(--accent, #0f766e)' : '1px solid var(--rule)', background: pptVAlign === v ? 'color-mix(in oklab, var(--accent, #0f766e) 12%, transparent)' : 'var(--paper)', color: 'var(--ink)' }}>
                  {PPT_VALIGN_LABELS[v]}
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)', opacity: isEmbeddableFont(pptFont) ? 1 : 0.5 }}>
              <input type="checkbox" checked={embedFont && isEmbeddableFont(pptFont)} disabled={!isEmbeddableFont(pptFont)} onChange={(e) => setEmbedFont(e.target.checked)} />
              글꼴 포함{!isEmbeddableFont(pptFont) && ' (본명조·나눔고딕만)'}
            </label>
          </div>
          {/* 다른 형식 내보내기 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>내보내기</span>
            <button type="button" className="btn btn-text btn-sm" onClick={onDownloadDocx} disabled={isEmpty}>📝 DOCX</button>
            <button type="button" className="btn btn-text btn-sm" onClick={onCopyShareLink} disabled={isEmpty}>🔗 공유 링크</button>
            <button type="button" className="btn btn-text btn-sm" onClick={onDownloadPlainSlides} disabled={isEmpty}>📄 Plain Slides</button>
            <button type="button" className="btn btn-text btn-sm" onClick={onDownloadOpenSong} disabled={isEmpty}>🎵 OpenSong</button>
            <button type="button" className="btn btn-text btn-sm" onClick={onClear} disabled={isEmpty} style={{ marginLeft: 'auto', color: 'var(--danger)' }}>전체 비우기</button>
          </div>
          {/* 곡별 배경(유료) */}
          <SongThemePicker songTitles={songTitles} baseTheme={pptTheme} songThemes={songThemes ?? []} setSongThemes={setSongThemes} premiumUnlocked={premiumUnlocked} onLockedPremium={onLockedPremium} />
        </div>
      )}

      {/* ── 본문 3분할: 목록 | 캔버스 | 배경 ── */}
      <div className="ss-grid" style={{ display: 'grid', gridTemplateColumns: '15fr 40fr 11fr', gap: 12, alignItems: 'start' }}>
        {/* 슬라이드 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '64vh', overflowY: 'auto', paddingRight: 2 }}>
          {isEmpty && <p style={{ fontSize: 12, color: 'var(--ink-3)', padding: '8px 2px' }}>아래 [+ 슬라이드]·[한꺼번에 붙여넣기]로 시작하세요.</p>}
          {blocks.map((raw, i) => {
            const v = themeVisual(perSlideTheme[i], customBgUrl, customBgIsGif);
            const active = i === safeSelected;
            return (
              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', borderRadius: 7, padding: 3, outline: active ? '2px solid var(--accent, #0f766e)' : '1px solid transparent', background: active ? 'color-mix(in oklab, var(--accent, #0f766e) 8%, transparent)' : 'transparent' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" style={miniBtn}>↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="아래로" style={miniBtn}>↓</button>
                </div>
                <button type="button" onClick={() => setSelected(i)} aria-label={`${i + 1}번 슬라이드 선택`} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', width: 14, textAlign: 'right' }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <SlidePreview slide={slidesForBlocks[i]} index={i + 1} isOverflow={overflowSlideIndices.includes(i)} themeBg={v.bg} themeFg={v.fg} overlay={v.overlay} lyricFontPt={lyricSizes[i]} fontFamily={previewFont} vAlignItems={previewVAlign} />
                  </div>
                </button>
                <button type="button" onClick={() => removeSlide(i)} aria-label={`${i + 1}번 삭제`} style={{ ...miniBtn, height: 38, color: 'var(--danger)' }}>🗑</button>
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
            <button type="button" onClick={() => addAfter(blocks.length - 1)} style={addBtn}>+ 슬라이드</button>
            <button type="button" onClick={() => setBulkOpen((o) => !o)} style={addBtn}>한꺼번에</button>
          </div>
          {bulkOpen && (
            <div style={{ marginTop: 4, border: '1px solid var(--rule)', borderRadius: 8, padding: 8 }}>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '0 0 6px' }}>빈 줄로 슬라이드가 나뉘고, # =제목 · &gt; =메모.</p>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={6} placeholder={'# 곡 제목\n\n가사 첫 줄\n가사 둘째 줄'} style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-sans)', padding: 8, borderRadius: 6, border: '1px solid var(--rule)', resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                <button type="button" onClick={() => { setBulkOpen(false); setBulkText(''); }} style={addBtn}>취소</button>
                <button type="button" onClick={doBulkAppend} disabled={!bulkText.trim()} style={{ ...addBtn, fontWeight: 700 }}>추가</button>
              </div>
            </div>
          )}
        </div>

        {/* 편집 캔버스 — 실제 배경 위에서 그 자리에서 지우고 쓰기 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'sticky', top: 10 }}>
          {isEmpty ? (
            <div style={{ aspectRatio: '16 / 9', border: '1px dashed var(--rule)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              왼쪽에서 슬라이드를 추가하면 여기서 바로 편집해요.
            </div>
          ) : (
            <>
              <div style={{ position: 'relative', aspectRatio: '16 / 9', background: canvasVisual.bg, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: 8, overflow: 'hidden', border: overflowSlideIndices.includes(safeSelected) ? '2px solid var(--danger)' : '1px solid var(--rule)', containerType: 'inline-size', display: 'flex', alignItems: previewVAlign, justifyContent: 'center' }}>
                {canvasVisual.overlay && <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: canvasVisual.overlay }} />}
                <textarea
                  ref={editRef}
                  value={sel.content}
                  onChange={(e) => editContent(e.target.value)}
                  placeholder={sel.type === 'title' ? '제목 (다음 줄은 부제)' : sel.type === 'memo' ? '광고·기도제목 메모' : '가사를 입력하세요'}
                  spellCheck={false}
                  rows={1}
                  style={{
                    position: 'relative', zIndex: 1, width: '92%', background: 'transparent', border: 'none', outline: 'none', resize: 'none', overflow: 'hidden',
                    textAlign: 'center', color: canvasVisual.fg, fontFamily: previewFont,
                    fontSize: ptToCqw(canvasFontPt), lineHeight: 1.4,
                    fontWeight: sel.type === 'title' ? 700 : 400, fontStyle: sel.type === 'memo' ? 'italic' : 'normal',
                  }}
                />
              </div>
              {/* 종류 토글 + 안내 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>종류</span>
                {(['lyric', 'title', 'memo'] as SlideType[]).map((t) => (
                  <button key={t} type="button" onClick={() => setType(t)} aria-pressed={sel.type === t}
                    style={{ padding: '4px 12px', fontSize: 12, borderRadius: 12, cursor: 'pointer', border: sel.type === t ? '1.5px solid var(--accent, #0f766e)' : '1px solid var(--rule)', background: sel.type === t ? 'color-mix(in oklab, var(--accent, #0f766e) 12%, transparent)' : 'var(--paper)', color: 'var(--ink)' }}>
                    {t === 'lyric' ? '가사' : t === 'title' ? '제목' : '메모'}
                  </button>
                ))}
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>
                  {safeSelected + 1} / {blocks.length} · 총 {realSlideCount}장
                  {overflowSlideIndices.includes(safeSelected) && <span style={{ color: 'var(--danger)' }}> · 4줄 초과</span>}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: 0 }}>엔터 한 번=줄바꿈, 엔터 두 번=다음 슬라이드로 나뉨.</p>
            </>
          )}
        </div>

        {/* 배경 패널 — 세로 나열 + 유료 드롭다운 + 커스텀 추가 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '64vh', overflowY: 'auto' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>배경</span>
          {FREE_THEMES.map((t) => <Swatch key={t} theme={t} locked={false} />)}

          {/* 저장된 내 배경 (있으면) */}
          {savedBgs.map((bg) => (
            <div key={bg.id} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              <button type="button" onClick={() => onSelectSaved(bg)} title={bg.name} style={{ flex: 1, height: 34, borderRadius: 6, background: `url('${bg.url}') center/cover`, border: customBg?.src === bg.url ? '2px solid var(--accent, #0f766e)' : '1px solid var(--rule)', cursor: 'pointer' }} />
              <button type="button" onClick={() => onDeleteSaved(bg)} aria-label="배경 삭제" style={{ ...miniBtn, color: 'var(--danger)' }}>🗑</button>
            </div>
          ))}

          {/* 방금 올렸지만 저장은 안 한 커스텀 배경 — 다른 테마 갔다가 다시 돌아올 수 있게 */}
          {customBg?.src?.startsWith('data:') && (
            <button type="button" onClick={() => setPptTheme('custom')} aria-pressed={pptTheme === 'custom'} title="방금 올린 배경"
              style={{ position: 'relative', width: '100%', height: 34, borderRadius: 6, background: `url('${customBg.src}') center/cover`, border: pptTheme === 'custom' ? '2px solid var(--accent, #0f766e)' : '1px solid var(--rule)', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', left: 5, bottom: 2, fontSize: 9, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', fontWeight: 600 }}>내 배경</span>
            </button>
          )}

          {/* 움직이는 배경(유료) — 드롭다운 기본 형태 */}
          <label style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>움직이는 배경 👑</label>
          <select
            value={PREMIUM_THEMES.includes(pptTheme) ? pptTheme : ''}
            onChange={(e) => {
              const v = e.target.value as PptTheme;
              if (!v) return;
              if (!premiumUnlocked) { onLockedPremium(); return; }
              setPptTheme(v);
            }}
            style={{ fontSize: 12, padding: '5px 6px', borderRadius: 6, border: '1px solid var(--rule)' }}
          >
            <option value="">선택…</option>
            {PREMIUM_THEMES.map((t) => <option key={t} value={t}>{PPT_THEME_LABELS[t]}</option>)}
          </select>

          {/* 커스텀 배경 추가 (유료) */}
          <button type="button" onClick={onPickCustom} style={{ marginTop: 4, padding: '8px', fontSize: 12, borderRadius: 8, border: '1px dashed var(--rule)', background: customBg && pptTheme === 'custom' ? 'color-mix(in oklab, var(--accent, #0f766e) 10%, transparent)' : 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer', opacity: premiumUnlocked ? 1 : 0.6 }}>
            {converting ? `변환 중 ${converting.pct}%` : '＋ 커스텀 배경'}{!premiumUnlocked && ' 👑'}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime" onChange={onFileInput} style={{ display: 'none' }} />
        </div>
      </div>
    </section>
  );
}
