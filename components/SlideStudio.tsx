'use client';

// 슬라이드 스튜디오 — 파워포인트식 콘티 편집기 (데스크탑 03 영역 교체).
//
// 왼쪽: 슬라이드 목록(썸네일). 위/아래 이동·삭제·추가.
// 오른쪽: 선택한 슬라이드를 실제 배경 위에 크게 보여주고, 아래 입력칸으로 내용을 바로 고친다.
// 위쪽 도구바: 전체 배경 스와치 + 글씨체 — 고르면 화면에 즉시 적용(04 PptSection과 같은 state).
//
// 데이터 모델은 그대로 '콘티 텍스트(text)' 한 덩어리다. "슬라이드 한 장 = 빈 줄로 구분된 글 한 토막".
// 편집 편의를 위해 로컬 working copy(blocks)를 두되, 부모의 text(SSOT)와 항상 맞춘다.
//   - 빈 슬라이드(새로 추가했지만 아직 안 쓴 칸)는 text에선 빠지지만 로컬 목록엔 살아 있어 편집 가능.
//   - 외부에서 text가 바뀌면(되돌리기/라이브러리/추출) 로컬 목록을 다시 맞춘다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSlidesFromText, splitTextIntoBlocks, type Slide } from '@/lib/text-doc';
import {
  computeUniformLyricSizes,
  PPT_FONT_LABELS,
  PPT_THEME_LABELS,
  type PptFont,
  type PptTheme,
  type PptVAlign,
} from '@/lib/pptx';
import { themeVisual, vAlignToFlex, FONT_FAMILY_PREVIEW, THEME_BG } from '@/lib/slide-visual';
import { SlidePreview } from '@/components/LivePreview';

// 배경 스와치 목록 — PptSection THEME_GROUPS와 동일하게 무료/유료(움직이는) 구분.
const FREE_THEMES: PptTheme[] = ['black', 'white', 'paper', 'bible', 'meadow', 'cross', 'sunrise', 'milkyway', 'godrays', 'wheat', 'sea', 'flowers'];
const PREMIUM_THEMES: PptTheme[] = ['light', 'dawn', 'serene', 'green', 'gold', 'pink', 'violet', 'wave', 'mist', 'candle', 'grace', 'aurora', 'crosslight'];

type SlideType = 'lyric' | 'title' | 'memo';

// 원문 블록 → {종류, 내용(접두사 없는 보이는 글)} 으로 분해.
function parseBlock(raw: string): { type: SlideType; content: string } {
  const lines = raw.split('\n');
  const first = lines[0] ?? '';
  if (first.startsWith('# ')) return { type: 'title', content: [first.slice(2), ...lines.slice(1)].join('\n') };
  if (first.startsWith('> ')) return { type: 'memo', content: [first.slice(2), ...lines.slice(1)].join('\n') };
  return { type: 'lyric', content: raw };
}

// {종류, 내용} → 원문 블록. (제목/메모는 첫 줄에만 접두사 — buildSlidesFromText 규칙과 일치)
function toRaw(type: SlideType, content: string): string {
  if (type === 'title') return `# ${content}`;
  if (type === 'memo') return `> ${content}`;
  return content;
}

// 원문 블록 한 토막 → 미리보기용 Slide (빈 칸은 빈 가사 슬라이드로).
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
  songThemes?: (PptTheme | undefined)[];
  pptVAlign: PptVAlign;
  customBg: { src: string; kind: 'image' | 'gif' } | null;
  premiumUnlocked: boolean;
  onLockedPremium: () => void;
  overflowSlideIndices?: number[];
  onClear: () => void;
  onCopy: () => void;
  onDownloadTxt: () => void;
  onDownloadDocx: () => void;
  onOpenPreview: () => void;
};

export default function SlideStudio({
  text,
  setText,
  pptTheme,
  setPptTheme,
  pptFont,
  setPptFont,
  songThemes,
  pptVAlign,
  customBg,
  premiumUnlocked,
  onLockedPremium,
  overflowSlideIndices = [],
  onClear,
  onCopy,
  onDownloadTxt,
  onDownloadDocx,
  onOpenPreview,
}: SlideStudioProps) {
  // 로컬 working copy — 슬라이드(블록) 원문 배열. 빈 칸도 보관 가능.
  const [blocks, setBlocks] = useState<string[]>(() => splitTextIntoBlocks(text));
  const [selected, setSelected] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);
  // 우리가 마지막으로 text에 써넣은 값 — 외부 변경과 우리 변경을 구분해 불필요한 재동기화를 막는다.
  const lastSerializedRef = useRef(text);
  // 최신 blocks를 이벤트 리스너(한 번만 구독)에서 읽기 위한 ref — 매 렌더 갱신.
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // 외부에서 text가 바뀌면(되돌리기/추출/라이브러리) 로컬 목록을 다시 맞춘다.
  useEffect(() => {
    if (text !== lastSerializedRef.current) {
      setBlocks(splitTextIntoBlocks(text));
      lastSerializedRef.current = text;
      setSelected((s) => Math.max(0, Math.min(s, splitTextIntoBlocks(text).length - 1)));
    }
  }, [text]);

  // 로컬 목록을 부모 text(SSOT)에 반영 — 빈 칸은 text에선 빼고, 로컬엔 그대로 둔다.
  const commit = (next: string[], nextSelected?: number) => {
    setBlocks(next);
    if (nextSelected !== undefined) setSelected(nextSelected);
    const serialized = next.filter((b) => b.trim().length > 0).join('\n\n');
    lastSerializedRef.current = serialized;
    setText(serialized);
  };

  // 02 추출된 곡 칩 → conti:append 이벤트 수신: 새 슬라이드들로 이어붙이고 마지막 것 선택.
  useEffect(() => {
    const onAppend = (e: Event) => {
      const chunk = (e as CustomEvent<{ chunk: string }>).detail?.chunk;
      if (!chunk) return;
      const add = splitTextIntoBlocks(chunk);
      if (!add.length) return;
      // 최신 blocks는 ref에서 읽고, 상태 변경은 commit으로 한 번에(updater 안 side effect 금지).
      const next = [...blocksRef.current, ...add];
      commit(next, next.length - 1);
    };
    window.addEventListener('conti:append', onAppend as EventListener);
    return () => window.removeEventListener('conti:append', onAppend as EventListener);
  }, [setText]);

  // 안전 인덱스 — 삭제 등으로 selected가 범위를 벗어나도 가둔다.
  const safeSelected = blocks.length > 0 ? Math.min(selected, blocks.length - 1) : 0;

  // 실제 슬라이드 수(빈 칸 제외) — 푸터 표시용. text 바뀔 때만 재계산.
  const realSlideCount = useMemo(() => buildSlidesFromText(text).length, [text]);

  // 미리보기 시각 계산 — 썸네일·캔버스 공통.
  const slidesForBlocks = useMemo(() => blocks.map(slideForBlock), [blocks]);
  const lyricSizes = useMemo(() => computeUniformLyricSizes(slidesForBlocks), [slidesForBlocks]);
  const perSlideTheme = useMemo(() => {
    let songIndex = -1;
    return slidesForBlocks.map((s) => {
      if (s.kind === 'title') songIndex++;
      return (songIndex >= 0 && songThemes?.[songIndex]) || pptTheme;
    });
  }, [slidesForBlocks, songThemes, pptTheme]);

  const customBgUrl = customBg?.src ?? null;
  const customBgIsGif = customBg?.kind === 'gif';
  // 캔버스·썸네일이 선택한 글씨체·세로정렬을 그대로 반영하도록(실제 PPT와 같게).
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
  const remove = (i: number) => {
    const next = blocks.filter((_, k) => k !== i);
    commit(next, Math.max(0, Math.min(i, next.length - 1)));
  };
  const addAfter = (i: number) => {
    const next = [...blocks];
    next.splice(i + 1, 0, ''); // 빈 슬라이드
    commit(next, i + 1);
    // 다음 프레임에 새 입력칸으로 포커스.
    requestAnimationFrame(() => editRef.current?.focus());
  };
  // 선택한 슬라이드 내용 편집 — 빈 줄(엔터 두 번)이 들어오면 그 자리에서 슬라이드가 나뉜다.
  const editContent = (value: string) => {
    const cur = parseBlock(blocks[safeSelected] ?? '');
    const raw = toRaw(cur.type, value);
    // 빈 줄(엔터 두 번)이 실제로 들어왔을 때만 그 자리에서 슬라이드를 나눈다.
    // 평소 타이핑에선 통째로 한 블록을 유지해야 줄 끝 공백/캐럿이 안 깨진다(띄어쓰기 보존).
    if (/\n[ \t]*\n/.test(raw)) {
      const pieces = splitTextIntoBlocks(raw);
      const replacement = pieces.length > 0 ? pieces : [''];
      const next = [...blocks.slice(0, safeSelected), ...replacement, ...blocks.slice(safeSelected + 1)];
      commit(next, safeSelected);
    } else {
      const next = [...blocks];
      next[safeSelected] = raw; // 공백·캐럿 보존
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

  const sel = parseBlock(blocks[safeSelected] ?? '');
  const isEmpty = blocks.length === 0;

  // 배경 스와치 한 칸.
  const Swatch = ({ theme, locked }: { theme: PptTheme; locked: boolean }) => (
    <button
      type="button"
      onClick={() => (locked ? onLockedPremium() : setPptTheme(theme))}
      title={PPT_THEME_LABELS[theme] + (locked ? ' (유료)' : '')}
      aria-label={PPT_THEME_LABELS[theme]}
      aria-pressed={pptTheme === theme}
      style={{
        position: 'relative',
        width: 40,
        height: 26,
        borderRadius: 6,
        background: THEME_BG[theme],
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        border: pptTheme === theme ? '2px solid var(--accent, #0f766e)' : '1px solid var(--rule)',
        cursor: 'pointer',
        opacity: locked ? 0.5 : 1,
        flex: '0 0 auto',
      }}
    >
      {locked && (
        <span style={{ position: 'absolute', top: -6, right: -4, fontSize: 9 }} aria-hidden="true">👑</span>
      )}
    </button>
  );

  return (
    <section className="panel" aria-label="슬라이드 스튜디오" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14 }}>
      {/* ── 도구바: 전체 배경 스와치 + 글씨체 (고르면 즉시 적용) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>
        <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>배경</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {FREE_THEMES.map((t) => <Swatch key={t} theme={t} locked={false} />)}
          {PREMIUM_THEMES.map((t) => <Swatch key={t} theme={t} locked={!premiumUnlocked} />)}
        </div>
        <span style={{ width: 1, height: 20, background: 'var(--rule)', margin: '0 2px' }} aria-hidden="true" />
        <span style={{ fontSize: 12, color: 'var(--ink-2)', fontWeight: 600 }}>글씨체</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {(Object.keys(PPT_FONT_LABELS) as PptFont[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setPptFont(f)}
              aria-pressed={pptFont === f}
              style={{
                padding: '4px 9px',
                fontSize: 12,
                borderRadius: 14,
                border: pptFont === f ? '1.5px solid var(--accent, #0f766e)' : '1px solid var(--rule)',
                background: pptFont === f ? 'color-mix(in oklab, var(--accent, #0f766e) 12%, transparent)' : 'var(--paper)',
                color: 'var(--ink)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {PPT_FONT_LABELS[f]}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>커스텀 배경은 04에서</span>
      </div>

      {/* ── 본문: 좌 슬라이드 목록 | 우 선택 슬라이드 편집 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(190px, 1fr) 2fr', gap: 14, alignItems: 'start' }}>
        {/* 왼쪽 — 슬라이드 목록 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '62vh', overflowY: 'auto', paddingRight: 4 }}>
          {isEmpty && (
            <p style={{ fontSize: 13, color: 'var(--ink-3)', padding: '12px 4px' }}>
              슬라이드가 없어요. 아래 [+ 슬라이드 추가]나 [한꺼번에 붙여넣기]로 시작하세요.
            </p>
          )}
          {blocks.map((raw, i) => {
            const v = themeVisual(perSlideTheme[i], customBgUrl, customBgIsGif);
            const active = i === safeSelected;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 6,
                  alignItems: 'center',
                  borderRadius: 8,
                  padding: 4,
                  background: active ? 'color-mix(in oklab, var(--accent, #0f766e) 10%, transparent)' : 'transparent',
                  outline: active ? '2px solid var(--accent, #0f766e)' : '1px solid transparent',
                }}
              >
                {/* 순서 이동 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="위로" style={miniBtn}>↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="아래로" style={miniBtn}>↓</button>
                </div>
                {/* 썸네일 (클릭 → 선택) */}
                <button
                  type="button"
                  onClick={() => setSelected(i)}
                  style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                  aria-label={`${i + 1}번 슬라이드 선택`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', width: 16, textAlign: 'right' }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <SlidePreview
                        slide={slidesForBlocks[i]}
                        index={i + 1}
                        isOverflow={overflowSlideIndices.includes(i)}
                        themeBg={v.bg}
                        themeFg={v.fg}
                        overlay={v.overlay}
                        lyricFontPt={lyricSizes[i]}
                        fontFamily={previewFont}
                        vAlignItems={previewVAlign}
                      />
                    </div>
                  </div>
                </button>
                {/* 삭제 */}
                <button type="button" onClick={() => remove(i)} aria-label={`${i + 1}번 슬라이드 삭제`} style={{ ...miniBtn, color: 'var(--danger)' }}>🗑</button>
              </div>
            );
          })}

          {/* 추가 버튼들 */}
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <button type="button" onClick={() => addAfter(blocks.length - 1)} style={addBtn}>+ 슬라이드 추가</button>
            <button type="button" onClick={() => setBulkOpen((o) => !o)} style={{ ...addBtn, flex: '0 0 auto' }}>한꺼번에 붙여넣기</button>
          </div>

          {bulkOpen && (
            <div style={{ marginTop: 6, border: '1px solid var(--rule)', borderRadius: 8, padding: 8 }}>
              <p style={{ fontSize: 11, color: 'var(--ink-3)', margin: '0 0 6px' }}>
                여러 곡/가사를 붙여넣으세요. 빈 줄로 슬라이드가 나뉘고, 맨 앞 # 는 제목, &gt; 는 메모예요.
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={6}
                placeholder={'# 곡 제목\n\n가사 첫 줄\n가사 둘째 줄'}
                style={{ width: '100%', fontSize: 13, fontFamily: 'var(--font-sans)', padding: 8, borderRadius: 6, border: '1px solid var(--rule)', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                <button type="button" onClick={() => { setBulkOpen(false); setBulkText(''); }} style={addBtn}>취소</button>
                <button type="button" onClick={doBulkAppend} disabled={!bulkText.trim()} style={{ ...addBtn, fontWeight: 700 }}>추가</button>
              </div>
            </div>
          )}
        </div>

        {/* 오른쪽 — 선택한 슬라이드 크게 + 편집 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12 }}>
          {isEmpty ? (
            <div style={{ aspectRatio: '16 / 9', border: '1px dashed var(--rule)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', fontSize: 13 }}>
              왼쪽에서 슬라이드를 추가하면 여기에 크게 보여요.
            </div>
          ) : (
            <>
              {/* 실제 배경으로 크게 — 아래 입력칸을 고치면 즉시 반영 */}
              {(() => {
                const v = themeVisual(perSlideTheme[safeSelected], customBgUrl, customBgIsGif);
                return (
                  <SlidePreview
                    slide={slidesForBlocks[safeSelected]}
                    index={safeSelected + 1}
                    isOverflow={overflowSlideIndices.includes(safeSelected)}
                    themeBg={v.bg}
                    themeFg={v.fg}
                    overlay={v.overlay}
                    lyricFontPt={lyricSizes[safeSelected]}
                    fontFamily={previewFont}
                    vAlignItems={previewVAlign}
                  />
                );
              })()}

              {/* 종류 토글 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>종류</span>
                {(['lyric', 'title', 'memo'] as SlideType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    aria-pressed={sel.type === t}
                    style={{
                      padding: '4px 12px',
                      fontSize: 12,
                      borderRadius: 14,
                      border: sel.type === t ? '1.5px solid var(--accent, #0f766e)' : '1px solid var(--rule)',
                      background: sel.type === t ? 'color-mix(in oklab, var(--accent, #0f766e) 12%, transparent)' : 'var(--paper)',
                      color: 'var(--ink)',
                      cursor: 'pointer',
                    }}
                  >
                    {t === 'lyric' ? '가사' : t === 'title' ? '제목' : '메모'}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: 'var(--ink-3)', marginLeft: 'auto' }}>엔터 두 번 = 슬라이드 나뉨</span>
              </div>

              {/* 내용 입력 — 이 슬라이드 한 장의 글 */}
              <textarea
                ref={editRef}
                value={sel.content}
                onChange={(e) => editContent(e.target.value)}
                rows={5}
                placeholder={sel.type === 'title' ? '곡/순서 제목 (다음 줄은 부제)' : sel.type === 'memo' ? '광고·기도제목 등 메모' : '가사를 입력하세요'}
                spellCheck={false}
                style={{ width: '100%', fontSize: 15, lineHeight: 1.5, fontFamily: 'var(--font-sans)', padding: 10, borderRadius: 8, border: '1px solid var(--rule)', resize: 'vertical' }}
              />
            </>
          )}

          {/* 푸터 — 슬라이드 수 + 텍스트 출구 + 전체 미리보기 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {realSlideCount}장 슬라이드
              {overflowSlideIndices.length > 0 && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>⚠ {overflowSlideIndices.map((i) => i + 1).join(', ')}번 4줄 초과</span>}
            </span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-text btn-sm" onClick={onOpenPreview} disabled={isEmpty}>👁 전체 미리보기</button>
              <button type="button" className="btn btn-text btn-sm" onClick={onCopy} disabled={isEmpty}>📋 복사</button>
              <button type="button" className="btn btn-text btn-sm" onClick={onDownloadTxt} disabled={isEmpty}>📄 TXT</button>
              <button type="button" className="btn btn-text btn-sm" onClick={onDownloadDocx} disabled={isEmpty}>📝 DOCX</button>
              <button type="button" className="btn btn-text btn-sm" onClick={onClear} disabled={isEmpty}>전체 비우기</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const miniBtn: React.CSSProperties = {
  width: 22,
  height: 20,
  fontSize: 11,
  lineHeight: 1,
  border: '1px solid var(--rule)',
  borderRadius: 5,
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  padding: 0,
};

const addBtn: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  fontSize: 12.5,
  border: '1px dashed var(--rule)',
  borderRadius: 8,
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
};
