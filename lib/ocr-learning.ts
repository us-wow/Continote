// 사용자의 가사 수정 이력을 localStorage에 누적해 다음 추출 prompt에 예시로 활용.
// 완전한 학습이 아니라 "이전에 이렇게 수정했음 — 참고하라"는 약한 힌트 수준.

export type Correction = {
  ts: number;       // 시각 ms
  before: string;   // AI가 추출한 원래 텍스트
  after: string;    // 사용자가 수정한 텍스트
};

const STORAGE_KEY = 'contionote-corrections';
const MAX_KEEP = 30; // 최근 30개만 유지 (오래된 패턴은 흐려짐)

export function loadCorrections(): Correction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Correction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordCorrection(before: string, after: string): void {
  if (typeof window === 'undefined') return;
  // 의미 없는 변경(공백/단일 문자)은 무시
  const b = before.trim();
  const a = after.trim();
  if (!b || !a || b === a) return;
  // 너무 긴 텍스트는 잘라서 저장 (prompt 토큰 절약)
  const trim = (s: string) => (s.length > 200 ? s.slice(0, 200) : s);
  const next: Correction = { ts: Date.now(), before: trim(b), after: trim(a) };
  const all = [next, ...loadCorrections()].slice(0, MAX_KEEP);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

// 추출 시 user prompt 끝에 붙일 힌트 텍스트.
// 너무 많이 넣으면 prompt가 무거워지므로 최대 5개.
export function buildCorrectionHint(maxItems = 5): string {
  const items = loadCorrections().slice(0, maxItems);
  if (items.length === 0) return '';
  const lines = items.map((c) => `"${c.before}" → "${c.after}"`).join('\n');
  return `\n\n# 사용자 이전 수정 패턴 (참고)\n다음은 같은 사용자가 이전 추출 결과에서 직접 수정한 내용입니다. 이런 패턴이 보이면 처음부터 정확하게 추출해 주세요.\n${lines}`;
}
