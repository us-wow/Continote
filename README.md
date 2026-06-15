# 콘티노트 (ContiNote)

찬양 악보를 올리면 **AI가 가사를 뽑고 → 슬라이드 단위로 콘티를 만들고 → 배경 입힌 예배용 PPT(.pptx)**까지 한 번에. 처음 쓰는 사람도 따라 할 수 있게 단순함을 최우선으로 만들었습니다.

라이브: https://contionote.vercel.app

**Stack**: Next.js 16 · TypeScript · Gemini 2.5 Flash(가사 추출) · pptxgenjs(PPT 생성) · Supabase(Google 로그인 + 클라우드 저장) · Vercel

---

## 무엇을 하나요

- **악보 → 가사**: 사진·PDF 악보를 올리면 AI가 가사만 자동으로 추출(분류는 하지 않음 — OCR에 집중).
- **슬라이드 스튜디오**: 가사 편집과 배경 고르기가 한 화면에서. 실제 슬라이드 위에 바로 글자를 쓰고 지우며 만든다.
  - 빈 줄(엔터 두 번) = 슬라이드 나눔, `# `=제목 슬라이드, `> `=메모 슬라이드.
  - **가사 붙여넣기** — 이미 가진 가사를 통째로 붙여넣으면 빈 줄 기준으로 자동 분할(악보 없이도 PPT 제작 가능).
- **배경**: 무료 7종(단색·실사) + 프리미엄 수십 종(절기·자연·빛·묵상 사진 + 움직이는 배경). 이름은 숨기고 검색으로 찾는다. 즐겨찾기·곡별 배경·내 교회 배경 등록은 프리미엄.
- **출력**: .pptx 다운로드(글꼴 임베드 지원), 공유 링크, Plain Slides·OpenSong 등 텍스트 형식.
- **예배 순서 빌더**(`/worship`): 운영자 전용. 예배 순서를 짜고 콘티/곡과 연동.

---

## 로컬 실행

### 1. 사전 준비
- Node.js 18 이상 (`node -v`로 확인)
- **Gemini API 키**(필수, 무료) — https://aistudio.google.com/apikey 에서 발급. `AIza...` 형식만 사용(AQ.~ 키는 동작 안 함). 선불 충전식이라 잔액이 0이면 429.
- **Supabase 프로젝트**(선택) — 없으면 로그인·클라우드 저장 없이 localStorage로만 동작.

### 2. 설치 & 환경변수
```bash
npm install
cp .env.local.example .env.local
```
`.env.local`:
```
GEMINI_API_KEY=AIza...                       # 필수
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co   # 선택(로그인·저장 쓸 때)
NEXT_PUBLIC_SUPABASE_ANON_KEY=...                   # 선택
```
> `.env.local`은 절대 커밋하지 마세요(`.gitignore`에 등록됨).

### 3. 개발 서버
```bash
npm run dev          # http://localhost:3000
npm run build        # 배포 전 항상 (tsc + next build)
```

---

## 배포 (Vercel)

GitHub에 올린 뒤 Vercel에서 Import → **Environment Variables**에 위 키들을 등록 → Deploy.
`main` 브랜치에 push하면 자동 배포됩니다. 작업은 `live-preview-workspace`에서 하고 build 통과 후 main에 머지하는 흐름.

Supabase를 쓰면 Google OAuth 동의화면에 **테스트 사용자 등록**을 잊지 마세요. 콜백 경로는 `window.location.origin/auth/callback`(도메인 무관).

---

## 폴더 구조 (핵심)

- `app/page.tsx` (데스크탑) · `app/m/page.tsx` (모바일) · `app/worship/page.tsx` (예배 순서 빌더)
- `app/api/analyze` (가사 추출) · `app/api/verify-lyrics` (오타 검토)
- `components/SlideStudio.tsx` — 핵심. 콘티 편집 + 배경 + PPT를 통합한 슬라이드 스튜디오
- `components/LivePreview.tsx` — 슬라이드 카드 렌더(미리보기 = 실제 PPT 출력의 거울)
- `lib/bg-catalog.ts` — **배경 단일 진실원(BACKGROUNDS)**. 배경의 모든 속성을 여기 한 줄에 담고 나머지 맵은 파생. 새 배경 추가 = 여기에 한 줄.
- `lib/pptx.ts` — 실제 .pptx 생성(테마·스크림·글꼴 임베드·움직이는 배경)
- `lib/slide-visual.ts` — 미리보기 시각(THEME_BG/FG/OVERLAY, 파생)
- `lib/text-doc.ts` — 콘티 텍스트 모델(빈 줄=슬라이드, `#`/`>` 접두사)

자세한 작업 맥락은 `HANDOFF.md` 참고.

---

## 문제 해결

- **"GEMINI_API_KEY가 설정되지 않았습니다"** — `.env.local`(로컬) 또는 Vercel 환경변수 확인 후 재시작/재배포.
- **가사가 빠지거나 틀려요** — '정확도 우선'을 켜고 다시 추출하거나, 묶음의 ✎로 직접 수정, 또는 슬라이드에서 직접 입력.
- **PPT 글꼴이 달라 보여요** — 그 PC에 같은 글꼴이 없을 때. 나눔고딕·본명조를 고르고 '글꼴 포함'을 켜면 PPT에 글꼴이 임베드됩니다.
- **로그인·저장이 안 돼요** — Supabase 무료 플랜은 일정 기간 미사용 시 일시중지될 수 있어요. 대시보드에서 프로젝트 상태 확인.

---

## 라이선스

비공개 프로젝트.
