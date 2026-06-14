# 콘티노트(ContiNote) — Handoff

> 마지막 정리: 2026-06-14 · 라이브: https://contionote.vercel.app · Repo: github.com/us-wow/Continote
> 현재 작업 브랜치: `live-preview-workspace` (main에 계속 머지됨, main = 라이브). 최신 main 커밋 `8ecec15`.

## 1. 한 줄 소개
찬양팀이 **악보 사진/PDF를 올리면 AI가 가사를 뽑고 → 슬라이드 단위로 콘티를 만들고 → 배경 입힌 예배 PPT(.pptx)로 내려받는** 도구. 비전공자(한국어 약한 새터민 청소년 포함)도 쓰게 단순함 최우선.

## 2. 기술 스택
- **Next.js 16**(webpack, 미들웨어=`proxy.ts`), **TypeScript**(strict:false, noUnusedLocals 없음 → 미사용 import는 빌드 에러 아님)
- **Supabase** — Google OAuth + per-user RLS. **pptxgenjs**(클라 PPT 생성) + **pptx-embed-fonts**(글꼴 임베드). **Gemini 2.5 Flash**(가사 추출 `app/api/analyze/route.ts`). 배포 Vercel(main push 자동).

## 3. ⭐ 화면 구조 (2026-06 대개편 — 예전과 많이 다름)
- **데스크탑** `app/page.tsx`: 히어로(마스코트 살림) → 01 업로드(UploadSection) → **`.studio-outer`(02 가사편집 | 슬라이드 스튜디오)**.
- **모바일** `app/m/page.tsx`: 단일 스크롤. 01 업로드 → 02 가사편집(ExtractedSection) → **SlideStudio**(반응형, 좁으면 캔버스 중심 모바일 레이아웃). 헤더 = 구글로그인 → 디자인 → 메뉴.
- **`components/SlideStudio.tsx` = 핵심.** 03(콘티 편집) + 04(PPT 만들기)를 하나로 통합한 "슬라이드 스튜디오".
  - 데스크탑: [슬라이드 목록 | 인플레이스 편집 캔버스 | 배경 패널] 3분할 + 상단 액션바(글씨체·정렬 / 복사·TXT·전체슬라이드확인·PPT다운로드).
  - 모바일(`isNarrow`, matchMedia ≤760): 가로 필름스트립 + 큰 캔버스 + ◀ n/N ▶ + 종류토글 + [🎨 배경·글씨체] 바텀시트 + 전체보기/PPT.
  - 캔버스 = 실제 배경 위 투명 textarea(그 자리 편집). 엔터 두 번=슬라이드 나뉨(마지막 조각 포커스).
- **공용 부품**: `LivePreview.tsx`(슬라이드 카드 single/strip/grid 렌더, `PreviewModal`이 grid로 사용), `Header`, `BrandMark`, `SongLibraryModal`, `PricingModal`, `OnboardingGuide`.

## 4. ⭐ 배경 시스템 (카탈로그 기반)
- **`lib/bg-catalog.ts`** = 배경 메타 SSOT: `{key, categories[], tier:'free'|'paid', animated}`. 검색·무료/유료·움직임 배지·정렬을 여기로 구동.
- **`lib/slide-visual.ts`** = 미리보기 시각 SSOT: THEME_BG/THEME_FG/THEME_OVERLAY + themeVisual/vAlignToFlex/ptToCqw. (실제 PPT 출력 `lib/pptx.ts`를 화면으로 베낀 거울 — 어긋나면 안 됨)
- **무료** = 단색 3(검정/흰색/종이) + 실사 3(십자가/성경책/초원). **나머지 전부 유료**(정지 실사 + 움직이는). 유료엔 왕관 SVG, 움직이는 배경엔 ▶움직임 배지.
- **배경 정렬 고정**: 무료 → 유료 정지(그림) → 유료 움직이는 (SlideStudio `visibleBgs` sort. 카탈로그 어디 추가하든 이 순서).
- **곡별 배경(유료)**: 배경 패널 [전체 | 이 곡만 👑] 토글. '이 곡만'=선택 슬라이드가 속한 곡에만 `songThemes` 적용(비프리미엄은 요금제).
- ⚠️ **배경 1개 추가 = 코드 5곳 수정**: ① `pptx.ts`(PptTheme union + THEME_CONFIG + PPT_THEME_LABELS) ② `slide-visual.ts`(THEME_BG/FG/OVERLAY) ③ `PptSection.tsx`(THEME_SWATCH_BG/FG + OVERLAY_THEMES — **데드코드지만 Record<PptTheme>라 tsc 위해 키 필요**) ④ `bg-catalog.ts`. **대량 추가하려면 병목 → PptTheme를 string 기반 데이터드리븐으로 리팩터하면 1곳(catalog)만 고치면 됨**(다음 후보).
- **소싱 파이프라인(검증됨)**: 이미지 `curl "https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&w=1600"` → mime/크기 검증, 깨진 ID 폐기. 영상 `videos.pexels.com/video-files/...mp4` → `ffmpeg -t 4 -i v.mp4 -vf "fps=10,scale=900:-1,palettegen…paletteuse" -loop 0 out.gif`(6MB 이하). Pexels=상업무료·출처표기 불요. **검증된 Pexels 후보 ID 40+/영상 URL**은 워크플로우 결과 `w3q9x0g6f`에 있음. 파일 정리는 `trash`(강제삭제 명령은 훅 차단).

## 5. 핵심 동작
- **추출 모델**(`lib/text-doc.ts`): 빈 줄=슬라이드 경계, `# `=제목, `> `=메모. AI는 가사 OCR만, 분류 X. `buildSlidesFromText`·`splitTextIntoBlocks`·`slideIndexAtOffset`(커서→슬라이드 인덱스).
- **저장=로그인**: 비로그인 에페메럴, 로그인 시 per-user 클라우드 + 첫 로그인 localStorage 1회 병합. **곡 라이브러리**(헤더/메뉴) 자동 누적·검색.
- **02 칩 → conti:append 이벤트** → SlideStudio가 수신해 슬라이드로 추가(후렴 반복 가능). 칩 탭 시 "✓ N번 추가" 피드백.
- **PPT 글꼴 임베드**: 본명조/나눔고딕만 서브셋 임베드(기본 ON). 구글 슬라이드는 임베드 무시.
- ⚠️ `validateSlide`는 **항상 ok:true** → `overflowSlideIndices`는 사실상 비어있음(4줄 경고 휴면).

## 6. ⚠️ 주의사항 / 함정
- **Gemini 키**: `AIza...` 형식만(AQ.키 ❌). 선불 충전식(잔액 0 → 429). Vercel 환경변수.
- **Supabase 무료 일시중지** 가능 → 로그인/저장 실패 시 대시보드 확인.
- **데드코드(이번에 발생)**: `PptSection.tsx`·`EditorSection.tsx`·`PreviewDock.tsx`·`SongThemePicker.tsx`·`MobileSongPicker.tsx` 전부 **미사용**(다 SlideStudio로 통합). `WorkspacePane.tsx`는 삭제됨. **PptSection은 지우거나, 안 지우면 배경 추가 때 그 안 swatch 맵도 같이 갱신 필요**(tsc 깨짐 방지). 정리 추천.
- **OAuth**: 구글 동의화면 로고 등록 보류, 테스트 사용자 등록 필수. 콜백 `window.location.origin/auth/callback`(도메인 무관 — 커스텀 도메인 붙이면 OAuth 리디렉트 URL만 추가).
- **iOS**: 입력칸 16px 미만이면 포커스 시 자동 확대. hover로만 보이는 요소는 첫 탭이 hover로 먹힘 → `@media (hover: none)`로 항상 노출(02 칩 적용 완료).
- **어두운 절기 배경(빈무덤/별밤/구유)**: 흰 스크림+검정글자로 통일했는데 너무 연해 보이면 그 3개만 다시 흰글자(overlay:false)로 되돌릴 수 있음 — 사용자 피드백 대기.

## 7. 실행 / 배포
```bash
npm run build    # 배포 전 항상 (tsc + next build)
npx tsc --noEmit # 타입만
git push origin main   # → Vercel 자동 배포(라이브)
```
- 작업은 `live-preview-workspace`에서 → build 통과 → `git checkout main && git merge live-preview-workspace --no-edit && git push` 패턴으로 라이브.
- 프리뷰 URL(`contionote-xxxx-….vercel.app`)은 커밋별·로그인 필요 → 공유는 항상 `contionote.vercel.app`.
- 첫 외부 사용자: 강하은.

## 8. 사업/수익화 결정 (이번 세션 정리)
- **시장**: 한국 교회 5만~6만 + 캠퍼스 찬양팀. 단 무료가 기본값·저객단가·지불의향 낮음. **CCC·장신대 = 매출처가 아니라 "씨앗 배포 루트"**(reach + 미래 목회자 LTV). 순서: 머지/안정화 → 친한 2~3명 → 그룹. 공유는 라이브 주소·무료 프레이밍·피드백 요청.
- **가격**: 개인 4,900원/월 적정(+연결제 49,000 할인). 유료 핵심 = 절기 컬렉션·움직이는 배경·곡별 배경·커스텀 배경·(향후) 팀 협업.
- **사업자**: 국내 KRW 결제 = 개인사업자(홈택스 무료·당일)+간이과세+토스페이먼츠 필요. **하나의 사업자로 콘티노트·북크루·합독·앱 다 커버**. 통신판매업은 간이과세 소규모면 보통 면제. 등록은 사용자가 집에서 "같이 하자" 요청 예정.

## 9. 다음 후보 (우선순위 순)
1. **배경 데이터드리븐 리팩터** — PptTheme를 catalog 파생 string key로 → 배경 추가가 1곳(bg-catalog)만 고치면 되게. 그 후 검증된 Pexels 후보(w3q9x0g6f)로 절기/컨셉 대량 채우기.
2. **데드코드 정리** — PptSection/EditorSection/PreviewDock/SongThemePicker/MobileSongPicker 삭제.
3. **모바일 터치 마감** — 필름스트립/시트 손맛, 어두운 절기 배경 스크림 미세조정.
4. **사업자 등록 동행** — 사용자 요청 시 개인사업자→토스 단계별, 토스 결제 연동 코드.
5. 파킹: 중앙 저장·글로벌 공유 곡집(저작권 ❌ 영역 주의), 이미지 굽기(구글 슬라이드 대응), 팀/교회 상위 티어.
