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

export interface Song {
  title: string;
  sections: Section[];
  // 나누기 확정 여부. false면 "나누기 모드"(가사 편집창에서 빈 줄로 묶음 나누기),
  // true/undefined면 "칩 모드"(나뉜 묶음을 칩으로 눌러 콘티에 추가).
  // 새로 추출/추가한 곡은 false로 시작해 사용자가 직접 나눈 뒤 확정한다.
  // 라이브러리/저장본에서 온 곡은 undefined → 바로 칩 모드.
  confirmed?: boolean;
}
