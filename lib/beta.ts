// 베타테스트 기간 — 유료(왕관) 기능을 전부 무료로 개방한다.
// 트래픽·피드백을 모으는 단계라 과금 없이 모든 기능을 열어둔다.
// 정식 결제(사업자 등록 후 토스페이먼츠) 도입 시 false로 바꾸면 원래 잠금으로 복귀.
export const BETA_ALL_FREE = true;

// 예배 순서 빌더(/worship) — 아직 개발 중이라 UI 진입점을 숨긴다.
// (라우트 자체는 살아 있어 운영자가 직접 URL로 테스트 가능.) 완성되면 true로.
export const SHOW_WORSHIP_BUILDER = false;

// 베타 심화 설문(Tally 등) 링크. 비워두면 피드백 카드에서 "자세한 의견" 링크가 숨겨진다.
// Tally 폼 만든 뒤 여기에 URL만 붙이면 바로 노출됨.
export const FEEDBACK_SURVEY_URL = 'https://tally.so/r/RG2K5j';
