'use client';

// 곡별 배경 선택 (유료 기능)
//
// PPT 한 개에 배경 1장이던 것을, "1번 곡=새벽, 2번 곡=십자가"처럼 곡마다 다르게 까는 컨트롤.
// 곡 경계는 콘티의 `# 곡제목`(title 슬라이드)으로 자동으로 잡힌다 — lib/pptx.ts의 곡 순번과 동일.
// 곡 순번(0번부터)별로 테마를 고르며, 안 고르면(=기본) 위쪽 PptSection에서 정한 기본 테마를 따른다.
//
// 잠금: 무료 사용자에겐 통째로 어둡게 표시되고, 누르면 onLockedPremium(요금제 안내)만 뜬다.

import { PPT_THEME_LABELS, type PptTheme } from '@/lib/pptx';

type SongThemePickerProps = {
  // 현재 콘티의 곡 제목들 (buildSlidesFromText로 뽑은 title 슬라이드 순서 = 곡 순번).
  songTitles: string[];
  // 위 PptSection에서 정한 기본 테마 — "기본 테마 따름"을 고를 때 실제로 적용되는 값.
  baseTheme: PptTheme;
  // 곡 순번별 테마(없으면 기본). 엔진(exportToPptx)의 songThemes 인자와 같은 형태로 그대로 넘긴다.
  songThemes: (PptTheme | undefined)[];
  setSongThemes: (next: (PptTheme | undefined)[]) => void;
  // 유료 잠금 — false면 어둡게 표시 + 클릭 시 안내만.
  premiumUnlocked: boolean;
  onLockedPremium: () => void;
};

// 선택 목록에 쓸 테마 키 — custom(직접 등록 이미지 1장)은 곡별 제외.
// 사유: custom은 사용자가 올린 이미지 1장이라 곡마다 다른 이미지를 줄 수 없다.
const SELECTABLE_THEMES = (Object.keys(PPT_THEME_LABELS) as PptTheme[]).filter((t) => t !== 'custom');

// 그룹 옆에 붙는 작은 왕관 — PptSection의 유료 표시와 통일(노란 선, 각진 모양).
function CrownMark() {
  return (
    <svg
      width={16}
      height={Math.round(16 * (21 / 24))}
      viewBox="0 0 24 21"
      fill="none"
      aria-label="유료 기능"
      style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 6 }}
    >
      <path d="M3 18 L3 6 L8.5 10.5 L12 3 L15.5 10.5 L21 6 L21 18 Z" stroke="#F2C14E" strokeWidth="2.2" strokeLinejoin="miter" fill="none" />
    </svg>
  );
}

export default function SongThemePicker({
  songTitles,
  baseTheme,
  songThemes,
  setSongThemes,
  premiumUnlocked,
  onLockedPremium,
}: SongThemePickerProps) {
  // 곡이 없으면 보여줄 게 없다 (콘티에 # 제목이 하나도 없는 상태).
  if (songTitles.length === 0) return null;

  // 한 곡의 테마를 바꾼다 — 곡 순번 위치만 교체한 새 배열로.
  // (불변성 유지: 기존 배열을 직접 수정하지 않고 복사해서 바꾼다)
  const changeSong = (songIndex: number, value: PptTheme | undefined) => {
    if (!premiumUnlocked) {
      onLockedPremium();
      return;
    }
    const next = [...songThemes];
    // 곡 수보다 배열이 짧을 수 있으니 빈 칸을 undefined로 채운 뒤 해당 위치를 바꾼다.
    while (next.length <= songIndex) next.push(undefined);
    next[songIndex] = value;
    setSongThemes(next);
  };

  return (
    <section
      className="song-theme-picker"
      // 잠금 상태면 전체를 어둡게 + 클릭 시 안내. (개별 select에도 가드가 있지만 영역 클릭도 막아 UX 통일)
      style={{ opacity: premiumUnlocked ? 1 : 0.55 }}
      onClick={premiumUnlocked ? undefined : (e) => { e.preventDefault(); onLockedPremium(); }}
    >
      <h4 style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 14, margin: '14px 0 4px' }}>
        <CrownMark />
        곡별 배경
      </h4>
      <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '0 0 10px', wordBreak: 'keep-all' }}>
        곡마다 배경을 다르게 깔 수 있어요. 안 고른 곡은 위에서 정한 기본 배경을 그대로 씁니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {songTitles.map((title, songIndex) => (
          <label
            key={`${songIndex}-${title}`}
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}
          >
            <span
              style={{
                flex: '1 1 0',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                wordBreak: 'keep-all',
              }}
              title={title}
            >
              {songIndex + 1}. {title || '(제목 없음)'}
            </span>
            <select
              value={songThemes[songIndex] ?? ''}
              disabled={!premiumUnlocked}
              onChange={(e) =>
                changeSong(songIndex, e.target.value === '' ? undefined : (e.target.value as PptTheme))
              }
              style={{ flex: '0 0 auto', maxWidth: 180, padding: '4px 8px', fontSize: 13 }}
            >
              {/* 빈 값 = 기본 테마 따름 */}
              <option value="">기본 배경 ({PPT_THEME_LABELS[baseTheme].split(' ')[0]})</option>
              {SELECTABLE_THEMES.map((t) => (
                <option key={t} value={t}>
                  {PPT_THEME_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </section>
  );
}
