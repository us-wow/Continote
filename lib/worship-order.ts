// 예배 순서 빌더 — 블록 정의·기본 골격·PPT 텍스트 변환.
//
// 근거: docs/worship-order-research.md (12개 교회 주보 실태 조사, 2026-06-12)
//   - 블록 기본 이름 = 12교회 최빈 표기 (단, 이름은 반드시 수정 가능)
//   - 기본 템플릿 = 12교회 합산 최빈 순서(공통 골격)
//   - 교독문·성경 본문은 저작권 때문에 자동 내장 금지 → 사용자가 붙여넣기
//   - 사도신경·주기도문은 교단 공동 번역 고정문이라 내장 가능
//
// 데이터 모델: 블록 하나 = { 이름, 부제(담당자·장수 등 한 줄), 본문(빈 줄 = 슬라이드 구분) }
// → 기존 콘티 텍스트 모델(text-doc.ts)로 변환해서 PPT 엔진(pptx.ts)을 그대로 재사용한다.

// ───────── 타입 ─────────

export type WorshipBlock = {
  id: string; // 화면 키·재정렬용 (crypto.randomUUID)
  presetKey: string; // 어떤 프리셋에서 나왔는지 ('custom'이면 직접 만든 블록)
  name: string; // 블록 이름 — 제목 슬라이드의 큰 글씨. 교회마다 표기가 달라 수정 자유.
  subtitle: string; // 부제 한 줄 — 담당자·찬송가 장수 등 (제목 슬라이드 작은 글씨)
  body: string; // 본문 — 빈 줄이 슬라이드 구분 (성경 본문·교독문·광고 등 붙여넣기)
};

export type BlockPreset = {
  key: string;
  name: string; // 최빈 표기 (기본값)
  hint: string; // 추가 메뉴에서 보여줄 짧은 설명
  subtitlePlaceholder?: string;
  bodyPlaceholder?: string;
  fixedBody?: string; // 사도신경·주기도문처럼 본문을 미리 채워주는 고정문
};

// ───────── 고정문 (교단 공동 번역 — 자유 사용 가능) ─────────

// 새번역 사도신경 — 빈 줄로 끊어 슬라이드 3장이 되게 미리 나눠둔다.
const APOSTLES_CREED = `나는 전능하신 아버지 하나님,
천지의 창조주를 믿습니다.
나는 그의 유일하신 아들,
우리 주 예수 그리스도를 믿습니다.

그는 성령으로 잉태되어 동정녀 마리아에게서 나시고,
본디오 빌라도에게 고난을 받아
십자가에 못 박혀 죽으시고,
장사된 지 사흘 만에
죽은 자 가운데서 다시 살아나셨으며,

하늘에 오르시어 전능하신 아버지 하나님
우편에 앉아 계시다가,
거기로부터 살아 있는 자와
죽은 자를 심판하러 오십니다.

나는 성령을 믿으며,
거룩한 공교회와 성도의 교제와
죄를 용서받는 것과
몸의 부활과 영생을 믿습니다. 아멘.`;

// 새번역 주기도문 — 슬라이드 2장
const LORDS_PRAYER = `하늘에 계신 우리 아버지,
아버지의 이름을 거룩하게 하시며
아버지의 나라가 오게 하시며,
아버지의 뜻이 하늘에서와 같이
땅에서도 이루어지게 하소서.

오늘 우리에게 일용할 양식을 주시고,
우리가 우리에게 잘못한 사람을 용서하여 준 것같이
우리 죄를 용서하여 주시고,
우리를 시험에 빠지지 않게 하시고
악에서 구하소서.
나라와 권능과 영광이
영원히 아버지의 것입니다. 아멘.`;

// ───────── 블록 프리셋 17종 + 성찬식 + 직접 만들기 ─────────

export const BLOCK_PRESETS: BlockPreset[] = [
  { key: 'entrance', name: '입례송', hint: '예배 시작 — 입례찬송·전주·묵상기도 등으로 표기 바꿔 쓰세요' },
  { key: 'call', name: '예배의 부름', hint: '교회마다 표기가 제일 다양한 블록 (예배선언 등)', bodyPlaceholder: '인도자 멘트나 시편 구절을 붙여넣으세요 (빈 줄 = 슬라이드 구분)' },
  { key: 'doxology', name: '송영', hint: '신앙고백·봉헌 뒤에 주로 들어감' },
  { key: 'hymn', name: '찬송', hint: '회중 찬송 — 여러 번 추가 가능', subtitlePlaceholder: '예: 찬송가 8장 · 다 같이' },
  { key: 'creed', name: '신앙고백(사도신경)', hint: '새번역 사도신경 본문이 미리 들어 있어요', fixedBody: APOSTLES_CREED },
  { key: 'responsive', name: '성시교독', hint: '감리교는 "교독문" — 본문은 저작권 때문에 직접 붙여넣기', subtitlePlaceholder: '예: 교독문 1번 (시편 1편)', bodyPlaceholder: '교독문 본문을 붙여넣으세요 (빈 줄 = 슬라이드 구분)' },
  { key: 'prayer', name: '기도', hint: '대표기도·목회기도·공중기도', subtitlePlaceholder: '예: ○○○ 장로' },
  { key: 'fellowship', name: '성도의 교제', hint: '인사·환영 — 위치는 교회마다 앞/뒤 자유' },
  { key: 'scripture', name: '성경봉독', hint: '본문은 성경 앱에서 복사해 붙여넣기 (빈 줄 = 슬라이드 구분)', subtitlePlaceholder: '예: 로마서 12:1-2', bodyPlaceholder: '성경 본문을 붙여넣으세요.\n\n빈 줄을 넣으면 그 자리에서 슬라이드가 나뉩니다.' },
  { key: 'choir', name: '찬양', hint: '찬양대(성가대) 찬양', subtitlePlaceholder: '예: 할렐루야 찬양대' },
  // 콘티노트 본체와의 연결 고리 — 메인에서 만든 콘티(찬양 묶음)를 통째로 이 자리에 끼운다.
  // 콘티 텍스트는 이미 "# 곡제목 + 가사" 형식이라 body에 그대로 넣으면 슬라이드로 풀린다.
  { key: 'conti', name: '찬양과 경배', hint: '콘티노트에서 만든 찬양 묶음(콘티)을 통째로 가져와 끼우기 — 곡 제목·가사 슬라이드로 풀립니다', bodyPlaceholder: '아래 "콘티 가져오기"로 저장된 콘티나 방금 작업하던 콘티를 불러오세요' },
  { key: 'sermon', name: '설교', hint: '말씀·말씀선포·말씀증거 등으로 표기 바꿔 쓰세요', subtitlePlaceholder: '예: "다시 일어서는 믿음" · ○○○ 목사' },
  { key: 'offering', name: '봉헌', hint: '헌금 — 장로교·감리교 모두 봉헌/헌금 혼용', subtitlePlaceholder: '예: 다 같이' },
  { key: 'offeringPrayer', name: '봉헌기도', hint: '봉헌 뒤 기도' },
  { key: 'news', name: '교회소식', hint: '광고 — 항목별로 빈 줄을 넣으면 슬라이드가 나뉘어요', bodyPlaceholder: '광고 내용을 적으세요 (빈 줄 = 슬라이드 구분)' },
  { key: 'lordsPrayer', name: '주기도문', hint: '새번역 주기도문 본문이 미리 들어 있어요', fixedBody: LORDS_PRAYER },
  { key: 'repentance', name: '참회기도', hint: '회개기도·고백의 기도' },
  { key: 'benediction', name: '축도', hint: '예배 마침', subtitlePlaceholder: '예: ○○○ 목사' },
  { key: 'communion', name: '성찬식', hint: '월 1회·절기 옵션 블록' },
  { key: 'custom', name: '새 블록', hint: '이름부터 직접 만드는 빈 블록' },
];

// 프리셋에서 실제 블록 인스턴스 생성
export function createBlock(presetKey: string): WorshipBlock {
  const preset = BLOCK_PRESETS.find((p) => p.key === presetKey) ?? BLOCK_PRESETS[BLOCK_PRESETS.length - 1];
  return {
    id: crypto.randomUUID(),
    presetKey: preset.key,
    name: preset.name,
    subtitle: '',
    body: preset.fixedBody ?? '',
  };
}

// 기본 템플릿 — 12교회 합산 최빈 순서 (공통 골격)
// 'conti'(찬양과 경배)를 예배의 부름 뒤에 기본 슬롯으로 넣어, 빌더를 열면 "내 콘티가 들어갈 자리"가
// 바로 보이게 한다. (이 슬롯은 아래 worship 페이지에서 "방금 작업하던 콘티"로 자동 채워진다.)
const DEFAULT_ORDER_KEYS = [
  'entrance', 'call', 'hymn', 'creed', 'conti',
  'responsive', 'hymn', 'prayer', 'scripture', 'choir',
  'sermon', 'hymn', 'offering', 'news', 'hymn', 'benediction',
];

export function createDefaultOrder(): WorshipBlock[] {
  return DEFAULT_ORDER_KEYS.map((k) => createBlock(k));
}

// ───────── 블록 → 콘티 텍스트 변환 ─────────
// 변환 결과를 buildSlidesFromText()에 넣으면 기존 PPT 엔진을 그대로 쓸 수 있다.
//   블록 하나 → "# 이름\n부제" 제목 슬라이드 + 본문 paragraph들(빈 줄 = 슬라이드)

// 순서 요약 — "# 예배 순서" 제목 슬라이드 + 번호 목록 슬라이드 2장.
// (제목 paragraph에 목록을 같이 넣으면 부제 규칙(" · " join) 때문에 한 줄로 뭉개져서 분리)
export function summaryToText(blocks: WorshipBlock[]): string {
  // 이름 없는 블록은 본문 변환에서도 건너뛰므로 요약에서도 빼서 번호를 맞춘다
  const named = blocks.filter((b) => b.name.trim());
  const lines = named.map((b, i) => `${i + 1}. ${b.name}${b.subtitle ? ` — ${b.subtitle}` : ''}`);
  return `# 예배 순서\n\n${lines.join('\n')}`;
}

export function orderToText(blocks: WorshipBlock[], includeSummary: boolean): string {
  const parts: string[] = [];

  // 순서 요약 슬라이드 — 예배 전 화면에 띄워두는 "오늘의 예배 순서"
  if (includeSummary && blocks.length > 0) parts.push(summaryToText(blocks));

  for (const b of blocks) {
    if (!b.name.trim()) continue;
    // 제목 슬라이드: 첫 줄 "# 이름", 둘째 줄부터는 부제로 합쳐짐(text-doc 규칙)
    parts.push(b.subtitle.trim() ? `# ${b.name.trim()}\n${b.subtitle.trim()}` : `# ${b.name.trim()}`);
    // 본문: 사용자가 넣은 빈 줄 그대로 paragraph 분리 → 슬라이드 분리
    if (b.body.trim()) parts.push(b.body.replace(/\n{3,}/g, '\n\n').trim());
  }
  return parts.join('\n\n');
}
