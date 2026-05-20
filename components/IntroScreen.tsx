'use client';

// 모바일 첫 진입 인트로 화면 (intro-spec.md 디자인 핸드오프 기반)
//
// 한 화면(스크롤 X)에서 사용자에게:
//  ① TOP    — 브랜드 + 헤드라인 ("주일 찬양 콘티 PPT, 가장 쉽게 만드는 방법")
//  ② MID    — How it works: 4-step 타임라인 + 미니 플로우 데모(악보→가사→슬라이드)
//  ③ BOTTOM — Trust strip · 시작하기 CTA · Skip · Google 로그인 + 안내
//
// 두 톤(paper/wanted)은 같은 마크업, [data-theme]으로 토큰 전환.
// 한 번 본 사용자는 localStorage('intro-seen' = '1')로 다시 안 보게 처리.

import type { User } from '@supabase/supabase-js';

const INTRO_SUB = '찬양팀 PPT 도우미';
const INTRO_HEAD_1 = '주일 찬양 콘티 PPT,';
const INTRO_HEAD_2 = '가장 쉽게 만드는 방법';
const INTRO_HEAD_EM = '가장 쉽게'; // 두 번째 줄에서 강조될 부분 — 형광펜 효과
const INTRO_BODY =
  '악보 사진·PDF만 올리면 가사를 자동으로 뽑아 PPT까지 클릭 몇 번으로 만듭니다. 무료로.';
const INTRO_SKIP = '이미 써본 적 있어요 → 바로 1단계로';
const INTRO_GOOGLE_NOTE = 'Google 로그인하면 다른 기기에서도 콘티가 그대로 보여요. (선택)';

const INTRO_STEPS = [
  { num: '01', label: '악보 업로드', hint: '사진·PDF 12장까지', icon: 'upload' as const },
  { num: '02', label: '곡 확인', hint: 'AI 가사 확인·수정', icon: 'music' as const },
  { num: '03', label: '콘티 편집', hint: '빈 줄로 슬라이드', icon: 'edit' as const },
  { num: '04', label: 'PPT 만들기', hint: '테마·폰트 선택', icon: 'layers' as const },
];

type IntroScreenProps = {
  // 디자인 시스템 토글 — paper / wanted
  theme: 'paper' | 'wanted';
  // 인트로에서 미리 톤을 바꿔두면 뒤 wizard도 같은 톤으로 이어진다 (designTheme localStorage 공유).
  onChangeTheme: (next: 'paper' | 'wanted') => void;
  // 시작하기 / Skip 클릭 시 호출 — 부모가 localStorage 기록 + step 1 으로 전환
  onStart: () => void;
  // Google 로그인 — 선택 사항. 비로그인도 모든 기능 동작.
  onGoogleSignIn: () => void;
  authBusy: boolean;
  authUser: User | null;
  // supabase 미설정 환경에서는 Google 버튼 자체 숨김
  supabaseEnabled: boolean;
};

export default function IntroScreen({
  theme,
  onChangeTheme,
  onStart,
  onGoogleSignIn,
  authBusy,
  authUser,
  supabaseEnabled,
}: IntroScreenProps) {
  // 인트로 우상단 토글 — 누르면 반대 톤으로 즉시 전환. 사용자가 고른 톤은 wizard에도 그대로 이어짐.
  const nextTheme: 'paper' | 'wanted' = theme === 'paper' ? 'wanted' : 'paper';
  return (
    <div className="intro3" data-theme={theme}>
      <div className="intro3-statusbar-pad" />

      {/* 우상단 떠다니는 디자인 토글 — 인트로 흐름을 방해하지 않는 위치에. */}
      <button
        type="button"
        className="intro3-theme-toggle"
        onClick={() => onChangeTheme(nextTheme)}
        aria-label="디자인 변경"
        title={`디자인 변경 (현재: ${theme === 'paper' ? '종이톤' : 'Wanted'})`}
      >
        <svg width={14} height={14} viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"
            fill="currentColor"
          />
        </svg>
        <span>{theme === 'paper' ? '종이톤' : 'Wanted'}</span>
      </button>

      <div className="intro3-body">
        {/* ── ① TOP — 브랜드 + 약속 ── */}
        <div className="intro3-top">
          <div className="intro3-brand">
            <BrandMarkInline size={36} />
            <div className="intro3-brand-text">
              <div className="intro3-brand-name">콘티노트</div>
              <div className="intro3-brand-sub">{INTRO_SUB}</div>
            </div>
          </div>

          <div className="intro3-headline">
            <h1>
              <span>{INTRO_HEAD_1}</span>
              <HeadlineLine2 />
            </h1>
            <p>{INTRO_BODY}</p>
          </div>
        </div>

        {/* ── ② MID — How it works ── */}
        <div className="intro3-mid">
          {/* 4-step horizontal timeline */}
          <div className="intro3-steps">
            <div className="intro3-track" aria-hidden="true" />
            {INTRO_STEPS.map((s) => (
              <div key={s.num} className="intro3-step">
                <div className="intro3-step-node">
                  <StepIcon name={s.icon} />
                </div>
                <div className="intro3-step-num mono">{s.num}</div>
                <div className="intro3-step-label">{s.label}</div>
                <div className="intro3-step-hint">{s.hint}</div>
              </div>
            ))}
          </div>

          {/* 미니 플로우 데모 — 악보 → 가사 → 슬라이드 */}
          <div className="intro3-demo" aria-hidden="true">
            <div className="intro3-demo-row">
              <DemoSheetCard />
              <DemoArrow />
              <DemoLyricsCard />
              <DemoArrow />
              <DemoSlideCard />
            </div>
            <div className="intro3-demo-caption">
              평균 <b>30초</b>, 클릭 몇 번이면 다음 주일 콘티가 완성됩니다.
            </div>
          </div>
        </div>

        {/* ── ③ BOTTOM — Trust + CTA + Footer ── */}
        <div className="intro3-bottom">
          <div className="intro3-trust" aria-label="benefits">
            <span>
              <CheckMini /> 완전 무료
            </span>
            <span>
              <CheckMini /> 회원가입 없이 시작
            </span>
            <span>
              <CheckMini /> 30초면 완료
            </span>
          </div>

          <div className="intro3-cta-block">
            <button type="button" className="intro3-cta" onClick={onStart}>
              시작하기
              <ArrowRight />
            </button>
            <button type="button" className="intro3-skip" onClick={onStart}>
              {INTRO_SKIP}
            </button>
          </div>

          {/* Google 로그인 — Supabase 설정된 경우만 노출. 이미 로그인 됐으면 숨김. */}
          {supabaseEnabled && !authUser && (
            <div className="intro3-foot">
              <button
                type="button"
                className="intro3-google"
                onClick={onGoogleSignIn}
                disabled={authBusy}
              >
                <GoogleG /> {authBusy ? '연결 중…' : 'Google로 로그인'}
              </button>
              <div className="intro3-google-note">{INTRO_GOOGLE_NOTE}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 헬퍼 컴포넌트들
// ────────────────────────────────────────────────────────────────────────

// 헤드라인 두 번째 줄 — "가장 쉽게" 만 <em>로 감싸 형광펜 효과 적용
function HeadlineLine2() {
  const idx = INTRO_HEAD_2.indexOf(INTRO_HEAD_EM);
  if (idx < 0) return <span>{INTRO_HEAD_2}</span>;
  return (
    <span>
      {INTRO_HEAD_2.slice(0, idx)}
      <em>{INTRO_HEAD_EM}</em>
      {INTRO_HEAD_2.slice(idx + INTRO_HEAD_EM.length)}
    </span>
  );
}

// 브랜드 마크 인라인 SVG — components/BrandMark.tsx 와 동일
function BrandMarkInline({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="2" width="30" height="30" rx="7" fill="var(--accent)" />
      <path
        d="M9 9 L20 9 L25 14 L25 25 L9 25 Z"
        fill="rgba(255,255,255,0.18)"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M20 9 L20 14 L25 14"
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="20" r="1.6" fill="#fff" />
      <path
        d="M15.5 20 L15.5 14.5 L20 13.5 L20 18.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18.5" cy="18.5" r="1.6" fill="#fff" />
    </svg>
  );
}

// Step 노드 안에 들어가는 stroke 아이콘 (lucide 스타일)
function StepIcon({ name }: { name: 'upload' | 'music' | 'edit' | 'layers' }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'upload':
      return (
        <svg {...common}>
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'music':
      return (
        <svg {...common}>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...common}>
          <path d="M17 3l4 4L8 20H4v-4z" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...common}>
          <path d="M12 3l9 5-9 5-9-5z" />
          <path d="M3 13l9 5 9-5" />
        </svg>
      );
  }
}

function CheckMini() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12l5 5L20 6" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width={16} height={16} viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.95v2.33A8.99 8.99 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.29-1.71V4.96H.95A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.95 4.04l3.02-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.99 8.99 0 0 0 9 0 8.99 8.99 0 0 0 .95 4.96l3.02 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// ── 미니 데모 카드 3종 ─────────────────────────────────────────────────

function DemoArrow() {
  return (
    <div className="intro3-demo-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" width={22} height={22}>
        <path
          d="M5 12 H17 M13 8 L17 12 L13 16"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// 카드 1: 살짝 기울어진 종이 위에 오선·음표·가사 라인
function DemoSheetCard() {
  return (
    <div className="intro3-demo-card intro3-demo-sheet">
      <svg viewBox="0 0 80 56" preserveAspectRatio="xMidYMid meet">
        <g transform="translate(8 6) rotate(-3 32 22)">
          <rect
            x="0"
            y="0"
            width="64"
            height="44"
            rx="2"
            fill="#fdfcf8"
            stroke="rgba(0,0,0,0.10)"
            strokeWidth="0.6"
          />
          <g stroke="rgba(0,0,0,0.45)" strokeWidth="0.4">
            <line x1="6" y1="10" x2="58" y2="10" />
            <line x1="6" y1="13" x2="58" y2="13" />
            <line x1="6" y1="16" x2="58" y2="16" />
            <line x1="6" y1="19" x2="58" y2="19" />
            <line x1="6" y1="22" x2="58" y2="22" />
          </g>
          <g fill="rgba(0,0,0,0.78)">
            <ellipse cx="14" cy="18" rx="2" ry="1.4" transform="rotate(-18 14 18)" />
            <rect x="15.3" y="10" width="0.7" height="8" />
            <ellipse cx="24" cy="15" rx="2" ry="1.4" transform="rotate(-18 24 15)" />
            <rect x="25.3" y="7" width="0.7" height="8" />
            <ellipse cx="34" cy="17" rx="2" ry="1.4" transform="rotate(-18 34 17)" />
            <rect x="35.3" y="9" width="0.7" height="8" />
            <ellipse cx="44" cy="19" rx="2" ry="1.4" transform="rotate(-18 44 19)" />
            <rect x="45.3" y="11" width="0.7" height="8" />
          </g>
          <g fill="rgba(0,0,0,0.35)">
            <rect x="6" y="28" width="8" height="1.6" rx="0.8" />
            <rect x="16" y="28" width="6" height="1.6" rx="0.8" />
            <rect x="24" y="28" width="10" height="1.6" rx="0.8" />
            <rect x="36" y="28" width="7" height="1.6" rx="0.8" />
            <rect x="6" y="34" width="14" height="1.6" rx="0.8" />
            <rect x="22" y="34" width="9" height="1.6" rx="0.8" />
          </g>
          <path d="M58 0 L64 6 L58 6 Z" fill="rgba(0,0,0,0.06)" />
        </g>
      </svg>
      <div className="intro3-demo-label">악보 사진</div>
    </div>
  );
}

// 카드 2: AI 칩 + 가사 줄 + 체크 아이콘
function DemoLyricsCard() {
  return (
    <div className="intro3-demo-card intro3-demo-lyrics">
      <svg viewBox="0 0 80 56" preserveAspectRatio="xMidYMid meet">
        <rect
          x="8"
          y="6"
          width="64"
          height="44"
          rx="3"
          fill="var(--surface)"
          stroke="var(--rule)"
          strokeWidth="0.6"
        />
        <rect x="12" y="10" width="11" height="5" rx="2.5" fill="var(--accent)" />
        <text
          x="14"
          y="13.8"
          fill="#fff"
          style={{
            font: "600 3.4px 'JetBrains Mono', monospace",
            letterSpacing: '0.04em',
          }}
        >
          AI
        </text>
        <g fill="var(--ink)" opacity="0.85">
          <rect x="12" y="20" width="40" height="2.2" rx="1.1" />
          <rect x="12" y="26" width="48" height="2.2" rx="1.1" />
          <rect x="12" y="32" width="36" height="2.2" rx="1.1" />
          <rect x="12" y="38" width="44" height="2.2" rx="1.1" />
        </g>
        <g transform="translate(60 9)">
          <circle cx="4" cy="4" r="4" fill="var(--accent)" opacity="0.16" />
          <path
            d="M2.2 4.2 L3.6 5.5 L6 3"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="0.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
      <div className="intro3-demo-label">가사 추출</div>
    </div>
  );
}

// 카드 3: 어두운 PPT 슬라이드 + accent glow + 가운데 가사
function DemoSlideCard() {
  return (
    <div className="intro3-demo-card intro3-demo-slide">
      <svg viewBox="0 0 80 56" preserveAspectRatio="xMidYMid meet">
        <rect x="8" y="6" width="64" height="44" rx="3" fill="var(--ink)" />
        <circle cx="68" cy="10" r="10" fill="var(--accent)" opacity="0.28" />
        <rect x="12" y="11" width="9" height="1.6" rx="0.8" fill="rgba(255,255,255,0.4)" />
        <g fill="#fff">
          <rect x="20" y="24" width="40" height="2.4" rx="1.2" />
          <rect x="24" y="30" width="32" height="2.4" rx="1.2" />
        </g>
        <rect
          x="50"
          y="42"
          width="18"
          height="1.4"
          rx="0.7"
          fill="rgba(255,255,255,0.35)"
        />
      </svg>
      <div className="intro3-demo-label">PPT 슬라이드</div>
    </div>
  );
}
