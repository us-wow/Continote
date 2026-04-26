'use client';

import type { SectionType } from '@/lib/types';

// 섹션 라벨 칩 — Verse / Pre-Chorus / 후렴 / Bridge 등
// 본문 텍스트에 [Verse 1] 같은 글자를 박지 않고, 시각적으로 분리된 둥근 라벨로 표시
// 이전 디자인의 핵심 UX 개선 포인트 중 하나

// 디자인 시안에서 정의한 칩 타입(prechorus → 'pre' 약식 표기 사용)
// 우리 API는 'prechorus'로 반환하므로 그대로 키로 사용
type ChipType = SectionType | 'intro' | 'outro' | 'tag';

// 섹션 종류별 색상 — 절제된 톤으로 본문과 구분
// 후렴(chorus)만 테라코타 액센트로 강조해서 노래의 중심임을 시각화
const CHIP_STYLES: Record<ChipType, { bg: string; fg: string; border: string }> = {
  verse: {
    bg: 'color-mix(in oklab, var(--ink) 12%, var(--paper))',
    fg: 'var(--ink)',
    border: 'color-mix(in oklab, var(--ink) 22%, transparent)',
  },
  prechorus: {
    bg: 'color-mix(in oklab, #D4A24C 18%, var(--paper))',
    fg: '#7A5A14',
    border: 'color-mix(in oklab, #D4A24C 38%, transparent)',
  },
  chorus: {
    bg: 'var(--accent)',
    fg: '#fff',
    border: 'var(--accent)',
  },
  bridge: {
    bg: 'color-mix(in oklab, #7A8C5C 22%, var(--paper))',
    fg: '#3F4F2A',
    border: 'color-mix(in oklab, #7A8C5C 42%, transparent)',
  },
  // ending: 곡 마지막 종결구 — 더스티 퍼플 (chorus/bridge와 시각적 구분)
  ending: {
    bg: 'color-mix(in oklab, #6B5B8E 22%, var(--paper))',
    fg: '#3F3360',
    border: 'color-mix(in oklab, #6B5B8E 42%, transparent)',
  },
  intro: {
    bg: 'color-mix(in oklab, var(--ink) 8%, var(--paper))',
    fg: 'var(--ink-2)',
    border: 'color-mix(in oklab, var(--ink) 18%, transparent)',
  },
  outro: {
    bg: 'color-mix(in oklab, var(--ink) 8%, var(--paper))',
    fg: 'var(--ink-2)',
    border: 'color-mix(in oklab, var(--ink) 18%, transparent)',
  },
  tag: {
    bg: 'color-mix(in oklab, var(--ink) 8%, var(--paper))',
    fg: 'var(--ink-2)',
    border: 'color-mix(in oklab, var(--ink) 18%, transparent)',
  },
};

// 라벨이 비어있을 때 type 이름으로 폴백
// (인라인 편집 폼에서 라벨 입력 제거 → 라벨 빈 칩이 많아짐)
const TYPE_DEFAULT_LABEL: Record<ChipType, string> = {
  verse: 'Verse',
  prechorus: 'Pre-Chorus',
  chorus: 'Chorus',
  bridge: 'Bridge',
  ending: 'Ending',
  intro: 'Intro',
  outro: 'Outro',
  tag: 'Tag',
};

interface SectionChipProps {
  type: ChipType;
  label: string;
  size?: 'sm' | 'lg';
}

export default function SectionChip({ type, label, size = 'sm' }: SectionChipProps) {
  // 매핑 없는 타입이 들어와도 verse 스타일로 폴백 — 안전망
  const s = CHIP_STYLES[type] || CHIP_STYLES.verse;
  // 라벨이 비어있으면 type 기본값으로 표시
  const displayLabel = label?.trim() || TYPE_DEFAULT_LABEL[type] || type;
  const padY = size === 'lg' ? '5px' : '4px';
  const padX = size === 'lg' ? '12px' : '10px';
  const fz = size === 'lg' ? 12.5 : 11.5;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: `${padY} ${padX}`,
        fontSize: fz,
        fontFamily: 'var(--sans)',
        fontWeight: 600,
        letterSpacing: '0.04em',
        color: s.fg,
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 99,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      {displayLabel}
    </span>
  );
}
