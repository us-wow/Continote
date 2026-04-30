// 콘티 상태(doc, songs)를 URL hash에 직렬화/역직렬화하는 유틸.
// 공유 링크 만들 때: 사용자가 "공유 링크 복사" → 현재 상태가 hash에 인코딩된 URL이 클립보드로
// 페이지 진입 시: hash가 있으면 자동 복원
//
// 직렬화 흐름: state → JSON → btoa(encodeURIComponent) → URL hash
// 너무 길면 가독성을 위해 truncate 안 하고 그대로 (사용자가 길다 느끼면 피드백 달라고 안내)

export function encodeStateToHash<T>(state: T): string {
  try {
    const json = JSON.stringify(state);
    // 한국어 안전하게 base64 처리 — 먼저 encodeURIComponent로 ASCII화
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64;
  } catch {
    return '';
  }
}

export function decodeHashToState<T>(hash: string): T | null {
  try {
    const json = decodeURIComponent(escape(atob(hash)));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
