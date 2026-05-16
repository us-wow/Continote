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
}
