'use client';

// 예배 순서 빌더 (/worship) — 유료 예정 기능. 현재는 운영자/프리미엄 계정에서만 열림.
//
// 흐름: 블록 조립(추가·이름수정·↑↓·삭제) → 템플릿 저장/불러오기 → 전체 예배 PPT 다운로드
// PPT는 블록을 콘티 텍스트 모델로 변환(orderToText)한 뒤 기존 엔진(exportToPptx)을 그대로 사용.
//
// proxy.ts는 '/'와 '/m'만 매칭하므로 이 페이지는 모바일 리다이렉트를 안 탄다 → 반응형 한 벌로 처리.

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase';
import { canUseCustomBg, checkPremiumAccess } from '@/lib/custom-bg';
import {
  BLOCK_PRESETS,
  createBlock,
  createDefaultOrder,
  orderToText,
  type WorshipBlock,
} from '@/lib/worship-order';
import {
  listWorshipOrders,
  saveWorshipOrder,
  updateWorshipOrder,
  removeWorshipOrder,
  type SavedWorshipOrder,
} from '@/lib/worship-order-cloud';
import { buildSlidesFromText } from '@/lib/text-doc';
import { exportToPptx, type PptFont, type PptTheme } from '@/lib/pptx';

// 빌더에서 고를 PPT 옵션 — 1단계는 단순하게 단색 테마 3종 + 폰트 2종만.
// (실사·홀리·커스텀 배경은 콘티(찬양) 쪽 기능과 결제 도입 시 합류)
const THEME_OPTIONS: { value: PptTheme; label: string }[] = [
  { value: 'black', label: '검정' },
  { value: 'white', label: '흰색' },
  { value: 'paper', label: '종이' },
];
const FONT_OPTIONS: { value: PptFont; label: string }[] = [
  { value: 'nanum-gothic', label: '나눔고딕' },
  { value: 'noto-serif-kr', label: '본명조' },
];

type Gate = 'loading' | 'locked' | 'open';

export default function WorshipBuilderPage() {
  const [gate, setGate] = useState<Gate>('loading');
  const [authEmail, setAuthEmail] = useState<string | null>(null);

  // 빌더 상태
  const [blocks, setBlocks] = useState<WorshipBlock[]>([]);
  const [openBodyId, setOpenBodyId] = useState<string | null>(null); // 본문 펼친 블록
  const [showPicker, setShowPicker] = useState(false);

  // 템플릿 상태 — currentId가 있으면 "덮어쓰기", 없으면 "새로 저장"
  const [saved, setSaved] = useState<SavedWorshipOrder[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('주일 낮예배');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  // PPT 옵션
  const [theme, setTheme] = useState<PptTheme>('black');
  const [font, setFont] = useState<PptFont>('nanum-gothic');
  const [includeSummary, setIncludeSummary] = useState(true);

  // ── 게이트: 로그인 → 운영자 목록 또는 premium_access 테이블 확인 ──
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb || !isSupabaseConfigured()) {
      setGate('locked');
      return;
    }
    sb.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email ?? null;
      setAuthEmail(email);
      if (canUseCustomBg(email)) {
        setGate('open');
        return;
      }
      // 운영자 목록에 없으면 프리미엄 허용 명단(테이블) 한 번 더 확인
      const premium = await checkPremiumAccess(email);
      setGate(premium ? 'open' : 'locked');
    });
  }, []);

  // 열린 뒤: 저장된 템플릿 목록 로드. 없으면 기본 골격(12교회 최빈 순서)으로 시작.
  useEffect(() => {
    if (gate !== 'open') return;
    listWorshipOrders().then((orders) => {
      setSaved(orders);
      if (orders.length > 0) {
        // 가장 최근 템플릿 자동 로드 — 매주 같은 템플릿으로 시작하는 흐름
        setBlocks(orders[0].blocks);
        setCurrentId(orders[0].id);
        setTemplateName(orders[0].name);
      } else {
        setBlocks(createDefaultOrder());
      }
    });
  }, [gate]);

  // ── 블록 조작 ──
  const patchBlock = (id: string, patch: Partial<WorshipBlock>) =>
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const moveBlock = (id: string, dir: -1 | 1) =>
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const removeBlock = (id: string) => setBlocks((prev) => prev.filter((b) => b.id !== id));

  const addBlock = (presetKey: string) => {
    const block = createBlock(presetKey);
    setBlocks((prev) => [...prev, block]);
    setShowPicker(false);
    // 본문이 있는 프리셋(성경봉독 등)은 바로 펼쳐서 붙여넣기 유도
    const preset = BLOCK_PRESETS.find((p) => p.key === presetKey);
    if (preset?.bodyPlaceholder || preset?.fixedBody) setOpenBodyId(block.id);
  };

  // ── 템플릿 저장/불러오기 ──
  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2500);
  };

  const handleSave = async (asNew: boolean) => {
    if (blocks.length === 0) return;
    setBusy(true);
    try {
      if (!asNew && currentId) {
        await updateWorshipOrder(currentId, templateName, blocks);
        flash('템플릿을 덮어썼어요');
      } else {
        const row = await saveWorshipOrder(templateName, blocks);
        setCurrentId(row.id);
        flash('새 템플릿으로 저장했어요');
      }
      setSaved(await listWorshipOrders());
    } catch (e: any) {
      flash(e?.message ?? '저장 실패');
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = (order: SavedWorshipOrder) => {
    setBlocks(order.blocks);
    setCurrentId(order.id);
    setTemplateName(order.name);
    setOpenBodyId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 템플릿을 삭제할까요?')) return;
    await removeWorshipOrder(id);
    if (currentId === id) setCurrentId(null);
    setSaved(await listWorshipOrders());
  };

  // ── PPT ──
  const slideCount = useMemo(
    () => buildSlidesFromText(orderToText(blocks, includeSummary)).length,
    [blocks, includeSummary]
  );

  const handleDownload = async () => {
    const slides = buildSlidesFromText(orderToText(blocks, includeSummary));
    if (slides.length === 0) return;
    setBusy(true);
    try {
      await exportToPptx(slides, font, `${templateName || '예배순서'}.pptx`, theme);
    } finally {
      setBusy(false);
    }
  };

  // ── 화면 ──
  if (gate === 'loading') {
    return (
      <main style={pageWrap}>
        <p style={{ color: 'var(--ink-2)', padding: 40, textAlign: 'center' }}>확인 중…</p>
      </main>
    );
  }

  if (gate === 'locked') {
    return (
      <main style={pageWrap}>
        <TopBar />
        <div style={{ maxWidth: 520, margin: '80px auto', textAlign: 'center', padding: '0 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👑</div>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 24, color: 'var(--ink)', marginBottom: 10 }}>
            예배 순서 빌더는 준비 중이에요
          </h1>
          <p style={{ color: 'var(--ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            예배 순서 전체(찬송·성경봉독·광고까지)를 블록으로 조립해서
            <br />
            주일 PPT 한 벌을 한 번에 만드는 기능입니다.
            <br />
            지금은 운영자 계정에서만 열리는 미리보기 단계예요.
          </p>
          {!authEmail && (
            <p style={{ marginTop: 18, fontSize: 13, color: 'var(--ink-3, var(--ink-2))' }}>
              로그인하면 이용 대상 여부를 확인할 수 있어요.
            </p>
          )}
          <a href="/" style={{ display: 'inline-block', marginTop: 24, color: 'var(--accent, #0f766e)', fontWeight: 600 }}>
            ← 콘티노트로 돌아가기
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={pageWrap}>
      <TopBar />

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 80px' }}>
        {/* 제목 + 템플릿 이름 */}
        <header style={{ marginBottom: 18 }}>
          <h1 style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', marginBottom: 4 }}>
            예배 순서 빌더 <span style={{ fontSize: 12, color: '#b45309', verticalAlign: 'middle' }}>👑 미리보기</span>
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            블록을 조립해 예배 전체 PPT를 한 번에 만들어요. 블록 이름은 우리 교회 표기대로 고쳐 쓰세요.
          </p>
        </header>

        {/* 템플릿 줄 — 이름 / 저장 / 불러오기 */}
        <section style={card}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="템플릿 이름 (예: 주일 낮예배)"
              style={{ ...inputStyle, flex: '1 1 180px' }}
            />
            <button onClick={() => handleSave(false)} disabled={busy || blocks.length === 0} style={btnPrimary}>
              {currentId ? '저장(덮어쓰기)' : '저장'}
            </button>
            {currentId && (
              <button onClick={() => handleSave(true)} disabled={busy} style={btnGhost}>
                새 이름으로
              </button>
            )}
          </div>
          {saved.length > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {saved.map((o) => (
                <span
                  key={o.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    padding: '4px 8px',
                    borderRadius: 999,
                    border: `1px solid ${o.id === currentId ? 'var(--accent, #0f766e)' : 'var(--rule)'}`,
                    color: o.id === currentId ? 'var(--accent, #0f766e)' : 'var(--ink-2)',
                    background: 'var(--paper)',
                  }}
                >
                  <button onClick={() => handleLoad(o)} style={chipBtn}>{o.name}</button>
                  <button onClick={() => handleDelete(o.id)} aria-label="삭제" style={{ ...chipBtn, opacity: 0.6 }}>✕</button>
                </span>
              ))}
            </div>
          )}
          {notice && <p style={{ marginTop: 8, fontSize: 12, color: 'var(--accent, #0f766e)' }}>{notice}</p>}
        </section>

        {/* 블록 목록 */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {blocks.map((b, i) => {
            const preset = BLOCK_PRESETS.find((p) => p.key === b.presetKey);
            const open = openBodyId === b.id;
            return (
              <div key={b.id} style={card}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--ink-2)', width: 22, textAlign: 'right' }}>{i + 1}</span>
                  <input
                    value={b.name}
                    onChange={(e) => patchBlock(b.id, { name: e.target.value })}
                    style={{ ...inputStyle, fontWeight: 600, flex: '1 1 120px' }}
                    aria-label="블록 이름"
                  />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => moveBlock(b.id, -1)} disabled={i === 0} style={iconBtn} aria-label="위로">↑</button>
                    <button onClick={() => moveBlock(b.id, 1)} disabled={i === blocks.length - 1} style={iconBtn} aria-label="아래로">↓</button>
                    <button onClick={() => setOpenBodyId(open ? null : b.id)} style={{ ...iconBtn, width: 'auto', padding: '0 8px' }}>
                      {open ? '접기' : '내용'}{b.body.trim() ? ' ●' : ''}
                    </button>
                    <button onClick={() => removeBlock(b.id)} style={{ ...iconBtn, color: '#b91c1c' }} aria-label="삭제">✕</button>
                  </div>
                </div>
                <input
                  value={b.subtitle}
                  onChange={(e) => patchBlock(b.id, { subtitle: e.target.value })}
                  placeholder={preset?.subtitlePlaceholder ?? '부제 (담당자·장수 등, 비워도 돼요)'}
                  style={{ ...inputStyle, marginTop: 6, marginLeft: 30, width: 'calc(100% - 30px)', fontSize: 13 }}
                  aria-label="부제"
                />
                {open && (
                  <textarea
                    value={b.body}
                    onChange={(e) => patchBlock(b.id, { body: e.target.value })}
                    placeholder={preset?.bodyPlaceholder ?? '본문 (빈 줄 = 슬라이드 구분, 비우면 제목 슬라이드만)'}
                    rows={Math.min(14, Math.max(5, b.body.split('\n').length + 1))}
                    style={{ ...inputStyle, marginTop: 8, marginLeft: 30, width: 'calc(100% - 30px)', fontSize: 13, lineHeight: 1.6, resize: 'vertical' }}
                  />
                )}
              </div>
            );
          })}

          {/* 블록 추가 */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowPicker((v) => !v)} style={{ ...btnGhost, width: '100%', padding: '10px 0' }}>
              ＋ 블록 추가
            </button>
            {showPicker && (
              <div style={pickerStyle}>
                {BLOCK_PRESETS.map((p) => (
                  <button key={p.key} onClick={() => addBlock(p.key)} style={pickerItem}>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--ink-2)' }}>{p.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* PPT 다운로드 */}
        <section style={{ ...card, marginTop: 20 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={selLabel}>
              테마
              <select value={theme} onChange={(e) => setTheme(e.target.value as PptTheme)} style={selectStyle}>
                {THEME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </label>
            <label style={selLabel}>
              글꼴
              <select value={font} onChange={(e) => setFont(e.target.value as PptFont)} style={selectStyle}>
                {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label style={{ ...selLabel, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={includeSummary} onChange={(e) => setIncludeSummary(e.target.checked)} />
              순서 요약 슬라이드
            </label>
            <span style={{ fontSize: 12, color: 'var(--ink-2)', marginLeft: 'auto' }}>총 {slideCount}장</span>
          </div>
          <button
            onClick={handleDownload}
            disabled={busy || slideCount === 0}
            style={{ ...btnPrimary, width: '100%', marginTop: 12, padding: '12px 0', fontSize: 15 }}
          >
            {busy ? '만드는 중…' : '예배 PPT 다운로드'}
          </button>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)' }}>
            찬양(가사) 슬라이드는 콘티노트 메인에서 만든 PPT를 이어서 쓰세요 — 합치기는 다음 단계에서 들어갑니다.
          </p>
        </section>
      </div>
    </main>
  );
}

// ───────── 작은 공용 UI ─────────

function TopBar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--paper)',
      }}
    >
      <a href="/" style={{ fontSize: 13, color: 'var(--ink-2)', textDecoration: 'none' }}>← 콘티노트</a>
      <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, color: 'var(--ink)' }}>예배 순서 빌더</span>
    </div>
  );
}

// 페이지 스타일 — 메인과 같은 CSS 변수(--paper/--ink/--rule) 사용
const pageWrap: React.CSSProperties = { minHeight: '100vh', background: 'var(--bg, var(--paper))' };
const card: React.CSSProperties = {
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 12,
  padding: 14,
};
const inputStyle: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: 14,
  color: 'var(--ink)',
  background: 'var(--paper)',
  fontFamily: 'inherit',
};
const btnPrimary: React.CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '8px 16px',
  background: 'var(--accent, #0f766e)',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
};
const btnGhost: React.CSSProperties = {
  border: '1px dashed var(--rule)',
  borderRadius: 8,
  padding: '8px 14px',
  background: 'transparent',
  color: 'var(--ink-2)',
  fontSize: 13,
  cursor: 'pointer',
};
const iconBtn: React.CSSProperties = {
  width: 30,
  height: 30,
  border: '1px solid var(--rule)',
  borderRadius: 8,
  background: 'var(--paper)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontSize: 13,
};
const chipBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  padding: 0,
};
const pickerStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '110%',
  left: 0,
  right: 0,
  maxHeight: 320,
  overflowY: 'auto',
  background: 'var(--paper)',
  border: '1px solid var(--rule)',
  borderRadius: 12,
  boxShadow: '0 12px 32px -8px rgba(0,0,0,0.18)',
  zIndex: 30,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
  gap: 2,
  padding: 8,
};
const pickerItem: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  borderRadius: 8,
  cursor: 'pointer',
  textAlign: 'left',
};
const selLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: 'var(--ink-2)',
};
const selectStyle: React.CSSProperties = {
  border: '1px solid var(--rule)',
  borderRadius: 8,
  padding: '6px 8px',
  fontSize: 13,
  background: 'var(--paper)',
  color: 'var(--ink)',
};
