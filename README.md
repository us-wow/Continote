# 콘티노트 (ContiNote)

악보를 콘티 가사로, 클릭 한 번에. 찬양팀·음악·방송 자막을 위한 AI 콘티 메이커.

**Stack**: Next.js 14 · Gemini 1.5 Flash (무료) · PDF.js · Vercel

---

## 0단계 · 사전 준비 (5분)

### 0-1. Node.js 설치 확인
터미널에서:
```bash
node -v
```
v18 이상이 떠야 합니다. 없으면 https://nodejs.org 에서 LTS 버전 설치.

### 0-2. Gemini API 키 발급 (무료)
1. https://aistudio.google.com/apikey 접속 (구글 로그인)
2. **"Create API key"** 클릭
3. 새 프로젝트 또는 기존 프로젝트 선택 → 키 복사
4. 이 키를 다음 단계에서 사용

> 💰 비용: gemini-1.5-flash는 **하루 1,500건 요청 무료**. 일반 사용엔 사실상 무제한.

---

## 1단계 · 로컬 실행 (Mac/Windows 동일)

### 1-1. 의존성 설치
프로젝트 폴더에서:
```bash
npm install
```

### 1-2. 환경변수 파일 생성
`.env.local.example`을 복사해서 `.env.local`로 만들고, 발급받은 API 키 입력:
```bash
cp .env.local.example .env.local
```

`.env.local` 내용:
```
GEMINI_API_KEY=AIza...여기에_키_붙여넣기
```

### 1-3. 개발 서버 실행
```bash
npm run dev
```
브라우저에서 http://localhost:3000 열기 → 콘티노트 화면이 뜨면 성공.

---

## 2단계 · Vercel 배포 (10분, 영구 무료)

### 2-1. GitHub에 코드 올리기
GitHub에서 새 repository 만든 뒤:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/사용자명/contionote.git
git push -u origin main
```

> ⚠️ **`.env.local`은 절대 커밋하지 마세요!** `.gitignore`에 이미 등록되어 있어요.

### 2-2. Vercel 가입 및 프로젝트 import
1. https://vercel.com 접속 → GitHub 계정으로 가입 (무료)
2. **Add New → Project**
3. 방금 만든 GitHub repository 선택 → **Import**
4. **Environment Variables** 섹션에서:
   - Name: `GEMINI_API_KEY`
   - Value: 발급받은 API 키 붙여넣기
5. **Deploy** 클릭 → 1~2분 후 배포 완료

배포된 URL은 `https://contionote-xxx.vercel.app` 형태로 발급됩니다.

### 2-3. 커스텀 도메인 (선택)
Vercel 대시보드 → 프로젝트 → Settings → Domains 에서 직접 도메인 연결 가능.

---

## 사용 방법

1. **악보 업로드** — 이미지(PNG/JPG) 또는 PDF, 여러 장 가능
2. **가사 추출하기** 버튼 클릭 — AI가 가사를 추출하고 Verse/Pre-Chorus/Chorus/Bridge로 분류
3. **섹션 카드 클릭** — 편집창에 자동 입력 (`[Verse 1]` 라벨 포함)
4. **편집창에서 수정** — 가사 바꿔 부르는 부분 자유롭게 편집
5. **저장** — `.txt`, `.docx` 다운로드 또는 클립보드 복사

### 악보 인식이 어려울 때
악보 텍스트를 직접 가사 입력란에 붙여넣어도 AI가 섹션별로 분류해줍니다.

---

## 문제 해결

### "GEMINI_API_KEY가 설정되지 않았습니다"
- 로컬: `.env.local` 파일이 프로젝트 루트에 있는지, 키가 정확한지 확인 후 `npm run dev` 재시작
- Vercel: Settings → Environment Variables 에서 `GEMINI_API_KEY` 확인 후 재배포

### PDF가 안 열려요
- PDF는 클라이언트(브라우저)에서 이미지로 변환됩니다. 첫 변환 때 PDF.js worker 다운로드로 잠깐 멈출 수 있어요.
- 100MB 이상의 큰 PDF는 페이지 수를 줄여서 시도해주세요.

### 분석 결과가 비어있어요
- 악보 이미지가 흐리거나 해상도가 낮으면 AI가 가사를 못 읽을 수 있어요.
- "또는 직접 가사 붙여넣기" 영역에 가사 텍스트를 붙여넣고 분석해보세요.

---

## 다음 개발 아이디어

- [ ] 프로젝트 저장(localStorage) — 자주 쓰는 곡 즐겨찾기
- [ ] 콘티 미리보기 모드 (예배용 큰 글씨)
- [ ] 곡 순서 드래그로 재정렬
- [ ] 코드 함께 표시 옵션
- [ ] 여러 콘티 비교 (이번주 vs 지난주)
- [ ] 팀원과 공유 링크 (로그인 추가 시)

---

## 라이선스

MIT
