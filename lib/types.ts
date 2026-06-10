// ending: 곡 마지막에만 부르는 종결구. 보통 후렴의 마지막 줄을 반복·변형
// (예: "가득해 가득해 가득해 가득해" — Korean CCM에서 흔한 패턴)
// intro: 도입부 — 가사 없이 연주만 하는 구간 또는 짧은 외침. 사용자가 직접 추가하는 용도(Gemini는 사용 X).
export type SectionType = 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'ending' | 'intro';

export interface Section {
  type: SectionType;
  label: string;
  verseNum: number | null;
  text: string;
}

// 가사 대조 검토 결과 — 추출 직후 같은 제목의 "확정본"과 줄 단위로 비교한 것.
// 세션 한정 정보라 라이브러리/콘티 저장에는 안 들어간다 (저장 코드가 title/sections만 골라 저장).
export type RefCheck = {
  matchPct: number;     // 확정본과의 줄 일치율 (0~100)
  totalLines: number;
  matchedLines: number;
  // "거의 같은데 살짝 다른 줄" 교정 제안 (최대 5개)
  diffs: { mine: string; suggestion: string }[];
};

export interface Song {
  title: string;
  sections: Section[];
  // 나누기 확정 여부. false면 "나누기 모드"(가사 편집창에서 빈 줄로 묶음 나누기),
  // true/undefined면 "칩 모드"(나뉜 묶음을 칩으로 눌러 콘티에 추가).
  // 새로 추출/추가한 곡은 false로 시작해 사용자가 직접 나눈 뒤 확정한다.
  // 라이브러리/저장본에서 온 곡은 undefined → 바로 칩 모드.
  confirmed?: boolean;
  // 가사 대조 검토 결과 — 있으면 곡 카드 상단에 배너로 표시.
  refCheck?: RefCheck;
}
