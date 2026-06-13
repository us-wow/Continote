// 콘티 텍스트 모델 — 단일 string으로 콘티를 표현한다.
//
// 사용자가 채팅에서 명시한 의도: "빈 줄이 슬라이드 구분, 백스페이스로 합치기"
// → textarea 안에서 paragraph(빈 줄 사이 텍스트 덩어리)가 슬라이드 하나가 된다.
//
// 접두사 규칙:
//   "# 제목"   → 제목 슬라이드 (그 다음 줄들은 부제, " · " 로 join)
//   "> 메모"   → 메모 슬라이드 (광고/기도제목/축도자 같은 자유 텍스트)
//   plain      → 가사 슬라이드 (한 줄 = 화면 한 줄)
//
// 이전 모델(Block[])과의 차이:
//   - title/section/spacer/slidebreak/memo 5종 객체 → 단일 텍스트 + 접두사
//   - "+ 슬라이드 구분" 같은 명시적 분리자는 빈 줄 한 줄로 충분
//   - 사용자 편집은 textarea에서 자유롭게 (이전: 블록 단위 ↑↓✎✕)

import type { Song, Section } from './types';

// 빌드된 슬라이드 유닛 — PPT 생성기와 미리보기에서 사용
export type Slide =
  | { kind: 'title'; title: string; subtitle: string }
  | { kind: 'memo'; text: string }
  | { kind: 'lyric'; lines: string[] };

// 텍스트를 슬라이드 배열로 변환. 빈 줄 기준 paragraph 분리.
export function buildSlidesFromText(text: string): Slide[] {
  if (!text || !text.trim()) return [];

  // \n[ \t]*\n+ → 한 줄 이상의 빈 줄(공백만 있는 줄 포함)을 paragraph 경계로
  const paragraphs = text
    .split(/\n[ \t]*\n+/)
    .map((p) => p.replace(/^\n+|\n+$/g, ''))
    .filter((p) => p.length > 0);

  const slides: Slide[] = [];
  for (const p of paragraphs) {
    const lines = p.split('\n').map((l) => l.replace(/\s+$/, ''));
    const nonEmpty = lines.filter((l) => l.trim().length > 0);
    if (nonEmpty.length === 0) continue;

    if (nonEmpty[0].startsWith('# ')) {
      // 제목 슬라이드 — 첫 줄에서 "# " 떼고, 나머지 줄들은 부제로 합침
      slides.push({
        kind: 'title',
        title: nonEmpty[0].slice(2).trim(),
        subtitle: nonEmpty.slice(1).join(' · ').trim(),
      });
    } else if (nonEmpty[0].startsWith('> ')) {
      // 메모 슬라이드 — 모든 줄에서 "> " 떼고 공백으로 합쳐 한 문장처럼
      slides.push({
        kind: 'memo',
        text: nonEmpty.map((l) => l.replace(/^>\s?/, '')).join(' '),
      });
    } else {
      // 가사 슬라이드 — 줄 그대로
      slides.push({ kind: 'lyric', lines: nonEmpty });
    }
  }
  return slides;
}

// 텍스트를 "슬라이드 한 장 = 글 한 덩어리(원문 그대로)"로 쪼갠다.
// buildSlidesFromText와 같은 빈 줄 분리 규칙을 쓰되, 파싱하지 않고 원문 문자열을 그대로 돌려준다.
// → 슬라이드 스튜디오에서 슬라이드 단위로 편집/이동/삭제할 때 쓴다(buildSlidesFromText 결과와 1:1 대응).
export function splitTextIntoBlocks(text: string): string[] {
  if (!text || !text.trim()) return [];
  return text
    .split(/\n[ \t]*\n+/)
    .map((b) => b.replace(/^\n+|\n+$/g, '').replace(/[ \t]+$/gm, ''))
    .filter((b) => b.trim().length > 0);
}

// 커서 위치(글자 offset) → 그 위치가 속한 슬라이드 인덱스(0-base).
// 실시간 미리보기가 "커서 있는 슬라이드"를 따라가게 하는 데 쓴다.
// 원리: 커서 앞쪽 텍스트만 잘라 슬라이드로 변환하면, 그 개수-1 = 커서가 있는(또는 직전) 슬라이드.
// buildSlidesFromText와 같은 분리 규칙을 쓰므로 미리보기 곡 순번과도 정확히 맞는다.
export function slideIndexAtOffset(text: string, caretOffset: number): number {
  if (!text) return 0;
  const before = text.slice(0, Math.max(0, caretOffset));
  const count = buildSlidesFromText(before).length;
  return Math.max(0, count - 1);
}

// 곡 전체를 편집기 텍스트로 변환 (제목 + 2줄씩 그룹핑된 가사)
// 기존 page.tsx의 groupLinesByTwo 동작을 텍스트 모델에 그대로 적용한다.
export function songToText(song: Song): string {
  let out = `# ${song.title || 'Untitled'}\n\n`;
  for (const sec of song.sections) {
    const lines = (sec.text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i += 2) {
      out += lines.slice(i, i + 2).join('\n') + '\n\n';
    }
  }
  return out.replace(/\n+$/, '');
}

// 단일 섹션 → 텍스트 (옵션: 제목 헤딩 포함)
// 사용자가 곡 카드에서 처음 섹션을 추가할 땐 includeTitle=true 로 제목도 같이 넣어준다.
export function sectionToText(song: Song, section: Section, includeTitle: boolean): string {
  let out = '';
  if (includeTitle) {
    out += `# ${song.title || 'Untitled'}\n\n`;
  }
  const lines = (section.text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i += 2) {
    out += lines.slice(i, i + 2).join('\n') + '\n\n';
  }
  return out.replace(/\n+$/, '');
}

// 기존 텍스트에 새 chunk 이어붙이기 — 빈 줄 한 칸으로 paragraph 분리
export function appendText(existing: string, chunk: string): string {
  if (!existing || !existing.trim()) return chunk;
  return existing.replace(/\n+$/, '') + '\n\n' + chunk;
}

// 텍스트 안에 곡 제목이 이미 있는지 — 같은 곡 두 번 추가 방지용
export function docHasSongTitle(text: string, title: string): boolean {
  return text.includes(`# ${title}`);
}

// 메모 슬라이드 텍스트 헬퍼 — 사용자 입력을 "> ..." 형태로 감싸서 prepend
export function memoToText(body: string): string {
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `> ${l}`)
    .join('\n');
}

// 슬라이드 분리자 추가 (기존 "+ 슬라이드 구분" 버튼 대응)
// 빈 paragraph 하나만 더 끼우면 같은 효과.
export function appendBreak(existing: string): string {
  if (!existing) return existing;
  return existing.replace(/\n+$/, '') + '\n\n';
}

// ───────── 마이그레이션: 기존 Block[] → text 변환 ─────────
// Phase 3에서 데이터 모델을 바꾸면서 기존 사용자가 저장해둔 Block[] 콘티가 안 깨지게 변환한다.
// conti-cloud.ts의 rowToSavedSet 과 localStorage 읽기 시점에서 자동 호출.

type LegacyBlock =
  | { kind: 'title'; text: string }
  | {
      kind: 'section';
      sectionId?: string;
      type?: string;
      label?: string;
      verseNum?: number | null;
      body: string;
    }
  | { kind: 'spacer' }
  | { kind: 'slidebreak' }
  | { kind: 'memo'; body: string };

export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const parts: string[] = [];
  for (const raw of blocks as LegacyBlock[]) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.kind === 'title' && 'text' in raw && raw.text) {
      parts.push(`# ${raw.text}`);
    } else if (raw.kind === 'section' && 'body' in raw && typeof raw.body === 'string') {
      // 기존 섹션 body는 이미 빈 줄로 슬라이드 분리되어 있을 수 있고,
      // 그대로 paragraph로 들어가면 자동으로 슬라이드 단위가 맞춰진다.
      if (raw.body.trim()) parts.push(raw.body);
    } else if (raw.kind === 'memo' && 'body' in raw && typeof raw.body === 'string') {
      const memoLines = raw.body
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `> ${l}`)
        .join('\n');
      if (memoLines) parts.push(memoLines);
    } else if (raw.kind === 'slidebreak') {
      // 빈 paragraph로 분리만 하면 됨 — join에서 \n\n 들어감
      parts.push('');
    }
    // spacer는 시각적 여백이라 텍스트 모델에서 무시
  }
  // 빈 paragraph가 끼면 \n\n + '' + \n\n = \n\n\n\n 되는데 split 시 빈 paragraph로 무시되어 안전
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '');
}

// 이미 text(string)인지 Block[]인지 판별해서 적절히 변환.
// 새 저장은 항상 string으로, 옛 저장은 변환 후 반환.
export function ensureText(doc: unknown): string {
  if (typeof doc === 'string') return doc;
  if (Array.isArray(doc)) return blocksToText(doc);
  return '';
}
