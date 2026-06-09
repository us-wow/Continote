# 콘티노트(ContiNote) — Handoff

> 마지막 정리: 2026-06-10 · 라이브: https://contionote.vercel.app · Repo: github.com/us-wow/Continote

## 1. 한 줄 소개
찬양팀이 **악보 사진/PDF를 올리면 AI가 가사를 뽑고 → 묶음으로 나눠 콘티를 만들고 → 예배용 PPT(.pptx)로 내려받는** 도구. 비전공자(특히 한국어 약한 새터민 청소년도)도 쓸 수 있게 단순함을 최우선으로 한다.

## 2. 기술 스택
- **Next.js 16** (webpack 모드, 미들웨어는 `proxy.ts` — Next 16 컨벤션)
- **TypeScript** (tsconfig `strict: false`, `noUnusedLocals` 없음 → 미사용 import/var는 빌드 에러 아님)
- **Supabase** — Google OAuth 로그인 + per-user RLS(`auth.uid() = user_id`). 익명 쿼리 0행 검증됨
- **pptxgenjs** — PPT 생성(클라이언트, 다운로드 시 동적 import)
- **pptx-embed-fonts** — PPT에 글꼴 임베드
- **sharp** — 홀리 배경 SVG→JPEG (`scripts/gen-holy-bg.mjs`)
- **Gemini 2.5 Flash** (`@google/generative-ai`) — 가사 추출(`app/api/analyze/route.ts`)
- 배포: Vercel(자동, main push 시)

## 3. 화면 구조
- **데스크톱**: `app/page.tsx` — 2단 그리드에 4개 패널(01 업로드 / 02 추출된 곡 / 03 콘티 편집 / 04 PPT)
- **모바일**: `app/m/page.tsx` — **단일 스크롤**(데스크톱식). 4개 패널을 한 화면에 다 표시 + 상단 sticky '빠른 이동 칩'. (예전 단계 위저드·"데스크탑으로 보기"는 제거됨)
- `proxy.ts`가 UA로 `/`(데스크톱) ↔ `/m`(모바일) 라우팅
- 공용 컴포넌트: `UploadSection` `ExtractedSection` `EditorSection` `PptSection` `PreviewModal` `Header` `BrandMark`

## 4. 핵심 동작
- **추출 모델**(`lib/text-doc.ts`): 텍스트 기반 — 빈 줄=슬라이드 경계, `# `=제목 슬라이드, `> `=메모 슬라이드. AI는 분류(Verse/후렴) 안 하고 가사만 OCR → 사용자가 빈 줄로 '묶음' 나눔 → 칩 눌러 콘티에 추가(후렴은 여러 번).
- **저장 = 로그인**: 비로그인은 에페메럴(새로고침 사라짐). 로그인 시 곡·콘티가 per-user 클라우드 저장. 첫 로그인 때 기존 localStorage를 클라우드로 1회 병합.
- **곡 라이브러리**: 로그인 시 추출 곡 자동 누적, 제목/가사 검색·재사용·제목 수정.
- **온보딩**: `OnboardingGuide`(5장 그림 캐러셀) — 첫 방문 자동(localStorage `contino-guide-seen.v1`) + 헤더 "사용법" 버튼. 하단 "더 자세한 사용법" → `DetailedManual`(전체 설명서).
- **PPT 글꼴 임베드**: `PptSection` "글꼴 포함" 토글(기본 ON). 본명조(noto-serif-kr)일 때만 `public/fonts/noto-serif-kr-kr.otf`(상용 한글 2,350자 서브셋 ~1MB)를 PPT에 심음. 결과 pptx ~0.5MB. 파워포인트/한컴/LibreOffice는 인식, **구글 슬라이드는 무시**.

## 5. ⚠️ 주의사항 / 함정
- **Gemini API 키**: `AIza...` 형식이어야 함. `AQ.` 키는 계정 제한이라 generativelanguage 엔드포인트와 호환 안 됨. **선불 충전식**(요금 폭탄 없음, 잔액 떨어지면 429). Vercel 환경변수.
- **Supabase 일시중지**: 무료 플랜은 비활동 시 일시중지될 수 있음 → 로그인/저장 실패 시 대시보드 확인.
- **RLS**: per-user 사용자 격리 정상. 곡/콘티/템플릿 테이블 `user_id` + `auth.uid()` 정책.
- **아이콘 캐시**: 파비콘/PWA 아이콘은 브라우저·기기가 강하게 캐시 → 교체 후 강력 새로고침/홈화면 재추가 필요.
- **OAuth**: Google 동의 화면에 로고 등록 시 브랜드 검수 걸림 → 당분간 로고 등록 X. 테스트 사용자 등록 빠뜨리지 말 것.
- **글꼴 서브셋**: 상용 외 희귀 글자는 보는 PC 기본 글꼴로 대체(찬양 가사엔 거의 없음). 재생성은 `scripts/gen-subset-font.py`(fonttools 필요).
- **데드코드**: `lib/conti-cloud.ts`·`lib/template-cloud.ts`의 `listSets/saveSet/listTemplates` 등은 현재 미사용이나 향후 '중앙 저장' 위해 유지. `components/MobileSongPicker.tsx`도 미사용(단일 스크롤 전환으로). `pptx.ts`의 `copyright`/`PptCopyrightInfo`는 미사용(저작권 슬라이드 제거됨).

## 6. 파킹된 것 / 다음 후보
- **중앙 저장(가)**: 사용자들이 '나누기 확정'한 묶음을 컨트롤타워(유선우)에 모으기. 미구현.
- **글로벌 공유 곡집(나)**: 모든 사용자 공유 — 나중에 유료. (저작권: 도구·서비스 유료화 ✅ / 가사 DB 판매·중앙 공유 ❌ — "누가 쓰느냐"가 기준)
- **움직이는 홀리 배경**: 유료 기능. 다운로드 PPT 영상 배경은 무거움 → "웹 진행자 모드"(브라우저 투사)가 정석.
- **이미지 굽기(C안)**: 슬라이드를 그림으로 구워 어디서나 동일(구글 슬라이드 포함). 글꼴 임베드의 한계(본명조 1종·구글슬라이드 미인식) 보완용. 미구현.
- **다른 3폰트 임베드**: 현재 본명조만. 나눔명조/나눔스퀘어/본고딕도 서브셋 임베드 가능.
- **② 라이브러리 재사용**: 추출 시 제목 매칭으로 기존 곡 자동 제안. 미구현.

## 7. 실행 / 배포
```bash
npm run dev      # 로컬 (포트 충돌 시 기존 종료)
npm run build    # 빌드 검증 (배포 전 항상)
git push origin main   # → Vercel 자동 배포
```
- 환경변수(Vercel): Supabase URL/anon key(공개), Supabase service(민감), Gemini API key.
- 첫 외부 사용자: 강하은.

## 8. 이번 정리 세션 주요 변경(2026-06-09~10)
추출 단순화·실시간 미리보기 · 슬라이드 거터 ↑↓ · 로그인=저장 컷 · 메뉴 단순화 · 곡 제목 인라인 수정 · CCLI/저작권 슬라이드 제거 · 직접 가사 붙여넣기 제거 · **온보딩 캐러셀+전체 설명서** · **새 ContiNote 로고**(병아리→C+N 심볼, 파비콘/PWA 포함) · 카피 윤문 2회 · **데드코드 ~900줄 제거** · **모바일 단일 스크롤(데스크톱식)** · 단계 패널 색 구분(01파랑/02앰버/03틸/04보라) · **PPT 글꼴 임베드(본명조 서브셋)** · 강조색 틸 통일 · 폰트 옵션 라벨 실제 폰트·박스 균일 · "본명조 Pro"→"본명조". (마스코트 병아리는 히어로/빈상태에 유지)
