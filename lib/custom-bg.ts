// 내 교회 PPT(커스텀 배경) — 유료 예정 기능.
//
// ⚠️ 현재는 잠금 없이 전체 공개(왕관 배지로 "유료 예정"만 표시) — 이 파일의 판별 함수는
// 나중에 실제 유료 전환 시 다시 잠글 때 쓰려고 남겨둔 것이다(지금은 fileToDataUrl만 사용).
//
// 해제 조건 둘 중 하나:
//   1) 로그인 이메일이 아래 운영자 목록에 있음 — 계정 추가는 배열에 이메일만 넣으면 됨.
//   2) 브라우저 localStorage에 테스트 스위치가 켜져 있음 —
//      개발자도구 콘솔에서 localStorage.setItem('cn-custom-unlock', '1') 입력(끄기는 removeItem).

export const CUSTOM_BG_ADMIN_EMAILS = ['sdj07044@gmail.com'];

// 커스텀 배경 한 개 — src는 dataURL(방금 올린 것) 또는 https URL(클라우드에 저장된 것).
// kind가 'gif'면 PPT에서 움직이는 배경 경로(전면 이미지+흰 글자)로 출력된다.
export type CustomBgKind = 'image' | 'gif';
export type CustomBg = { src: string; kind: CustomBgKind };

// 업로드 파일 하드캡 — GIF·변환 결과 공통 (PPT에 통째로 들어가는 용량이라 제한 필수)
export const CUSTOM_BG_MAX_BYTES = 10 * 1024 * 1024;

export function canUseCustomBg(email: string | null | undefined): boolean {
  if (email && CUSTOM_BG_ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  if (typeof window !== 'undefined' && window.localStorage.getItem('cn-custom-unlock') === '1') {
    return true;
  }
  return false;
}

// 업로드된 이미지 파일을 dataURL로 — 미리보기(css url)와 PPT(customBgData) 양쪽에 그대로 쓴다.
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
