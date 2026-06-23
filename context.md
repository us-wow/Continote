# 콘티노트 — 아키텍처 결정 기록

> 이 파일은 코드만 봐서는 "왜" 알 수 없는 결정을 모은 곳이다.
> 폰트/테마/모바일 레이아웃 같은 사양은 `PRD.md`에 있으니 여기 중복으로 적지 말 것.

## 1. 악보 분석 규칙은 외부 md 파일로 분리

- 파일: `lib/prompts/score-analysis-rules.md`
- 주입 위치: `app/api/analyze/route.ts`에서 `fs.readFileSync`로 빌드 시점에 읽어 Gemini system prompt로 전달
- 규칙을 코드 안에 박지 않는 이유: 분류 품질 개선이 잦으므로 md만 고치고 푸시하면 즉시 반영되도록
- Vercel 안전망: `next.config.js`의 `experimental.outputFileTracingIncludes`에 `lib/prompts/**/*.md` 명시 (정적 분석이 못 잡는 경로 보강)

## 2. PptSlide 타입은 text-doc.ts의 Slide와 일원화

- `lib/pptx.ts`의 `PptSlide`는 `lib/text-doc.ts`의 `Slide` union(`title | memo | lyric`) 그대로 재사용
- 이전엔 `{ lines: string[] }`로 평탄화하다가 title의 kind 정보가 날아가 PPT bold 누락 회귀가 났음
- 새로 타입 추가하지 말 것. 슬라이드 종류가 늘면 `text-doc.ts`의 union에 추가하고 `pptx.ts`가 따라감

## 3. 폰트 매핑 — 미리보기↔PPT 일치의 단일 진실

- 미리보기: `components/PreviewModal.tsx`의 `FONT_FAMILY_PREVIEW`
- PPT 출력: `lib/pptx.ts`의 `FONT_FACE_MAP`
- 4종(나눔명조 / 본명조 Pro / 나눔스퀘어 / 본고딕) 모두 두 곳에서 정확히 매핑돼야 함
- `app/layout.tsx`가 4종 모두 웹폰트로 로드. 폰트 추가 시 세 곳(layout.tsx / FONT_FAMILY_PREVIEW / FONT_FACE_MAP) 동시 갱신

## 4. 모바일 UX 분리 원칙

- **Step 2**: 곡 추출 + 인라인 편집(제목/섹션/+추가/삭제) 가능 — `components/ExtractedSection.tsx`
- **Step 3**: 칩만 누를 수 있는 sticky 읽기전용 picker — `components/MobileSongPicker.tsx`
- 수정이 필요하면 Step 2로 돌아가서 한다. Step 3에서 편집 기능을 다시 넣지 말 것 (사용자 명시 의도)
- 칩 클릭 → `window.dispatchEvent('conti:append')` → `EditorSection`이 받아 콘티 텍스트에 누적

## 5. EditorSection `autoResize` prop (모바일 전용)

- 데스크톱: 기본 `false`. textarea 자체 스크롤 + `onScroll`→`transform translateY`로 거터 동기화
- 모바일: `true`. textarea가 컨텐츠 높이만큼 자연 늘어나 페이지 스크롤로 통일. 거터 transform 무력화
- 모바일에서 textarea는 자체 스크롤이 잘 안 일어나서 transform 동기화가 깨지는 게 회귀 원인이었음. 이 분기는 유지할 것

## 6. 거터 정밀 위치 — mirror div 기반 측정

- 한국어 가사가 좁은 폭에서 wrap되면 newline 기준 `startLine × LINE_HEIGHT` 계산이 어긋남
- 해결: invisible mirror `<div>` (textarea와 동일 폰트/패딩/wrap CSS) 안에 paragraph 시작 마커 삽입 → `marker.offsetTop`을 거터 번호 위치로 사용
- mirror가 깨지면 폴백으로 기존 `LINE_HEIGHT` 계산으로 자동 떨어짐 (`paragraphTops[N] ?? fallback`)

## 7. CCLI 입력은 데스크톱·모바일 이중 경로

- 데스크톱: `ChurchTemplateModal`에서 일괄 입력 (교회 단위 템플릿 저장)
- 모바일: `PptSection`에 optional prop 4개(`ccliNumber/setCcliNumber/licenseLabel/setLicenseLabel`)로 인라인 입력
- 데스크톱은 PptSection에 prop을 안 넘기면 인라인 폼이 안 뜸 → 두 UX가 한 컴포넌트로 공존
- 같은 패턴(optional 4-prop)은 다른 공용 컴포넌트 분기에도 재사용 가능

## 8. reference_lyrics — 저작권-안전 가사 대조 (⚠️ RLS 정책 0개 = 의도)

- `lib/reference-lyrics.ts` + `docs/reference-lyrics.sql`. 확정 가사를 제목 키로 Supabase에 쌓고, 추출 직후 줄 단위로 대조해 오탈자 교정 제안.
- **⚠️ 테이블 RLS는 켜고 정책을 하나도 안 만든다 = 직접 SELECT 전면 차단.** 접근은 `SECURITY DEFINER` 함수 둘(submit/compare)로만. `compare`는 levenshtein 30% 이내 "이미 거의 맞은 줄"의 오탈자만 반환 → 가사 통째 유출 불가. **이 테이블에 RLS 정책 추가 금지(가사 유출 위험).**
- 갱신 트리거는 **'나누기 확정' 한 곳에서만**(`ExtractedSection` SplitMode onConfirm). 인라인 카드 수정·수동 라이브러리 저장은 대조본을 안 건드림.
- `ocr-learning`(localStorage)은 같은 브라우저 한정 약한 힌트 — reference_lyrics와 별개 레이어. 악보 이미지는 DB에 저장 안 함(가사 텍스트만).

## 9. PPT 생성 성능 — 정적 자산 캐시 + 병렬화 (`lib/pptx.ts`)

- `fontBufCache`/`imageB64Cache` 모듈 스코프 Map — 글꼴 서브셋(744KB~1MB)·배경 base64를 탭 수명 동안 캐시(두 번째 export부터 재다운로드·재변환 생략). 캐시 원본 보존 위해 글꼴은 `fontBuf.slice(0)` 사본을 addFont에 넘김.
- `bgReady` IIFE로 배경 로드를 글꼴 임베드와 **병렬** 진행 후 슬라이드 루프 전 `await`. 독립 작업이라 대기가 순차로 안 쌓임.
- 글꼴 임베드는 **유지**(폰트 없는 교회 PC 대비). 캐시로 반복 비용만 제거.

## 10. 비동기 버튼 UX — exporting 가드 + 스켈레톤

- PPT 다운로드/공유: `exporting` state(부모) + try/finally, `SlideStudio`에 `exporting` prop → 버튼 `disabled` + '만드는 중…'. 다운로드·공유를 한 state로 묶음(둘 다 pptx 생성 호출 → 동시 2회 방지). `setExporting(true)` 직후 `await new Promise(r=>setTimeout(r,0))`로 한 프레임 양보(버튼 리페인트 후 무거운 작업 시작).
- 스켈레톤: **곡 라이브러리 모달만**(`SongLibraryModal` + globals.css `.skelBar`/`@keyframes skelShimmer`). 200ms 넘을 때만 노출(`showSkel`, 지연 표시). AI 추출(staged progress)·PPT 다운로드(파일)·미리보기(안 느림)는 의도적 제외 — 스켈레톤은 "들어올 모양을 아는 목록"에서만 유효.
