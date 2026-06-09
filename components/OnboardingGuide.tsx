'use client';

// 사용법 단계 가이드 — "한 장씩 넘겨 보는" 비주얼 캐러셀.
//
// 구성: ① 전체 소개 1장 + ② 실제 흐름 4단계 = 총 5장.
//   소개   — 악보 넣으면 콘티·PPT까지 (앱이 뭘 하는지 한눈에)
//   STEP 1 — 악보 올리기
//   STEP 2 — AI가 가사 자동 추출 + 틀린 글자 수정
//   STEP 3 — 묶음(칩) 눌러서 콘티 만들기 (후렴처럼 반복되는 건 여러 번)
//   STEP 4 — PPT로 내려받기
//
// 어디서 쓰나:
//   ① 헤더/메뉴의 "사용법" 버튼 → 언제든 다시 열기
//   ② 데스크톱 첫 방문 → 자동으로 한 번 (localStorage 'onboarding-seen')
//
// 왜 캐러셀인가: 긴 글 목록은 초보자가 안 읽는다. 한 장에 "그림 1 + 한 줄"만.
//   (찬양팀 로테이션 앱의 단계별 온보딩 방식을 콘티노트에 맞춰 차용)

import { useEffect, useState } from 'react';

// 한 장(슬라이드) = 소개(intro) 또는 단계(step).
// step일 때만 num이 있어 "STEP 2 / 4"처럼 보여준다.
type GuideSlide = {
  kind: 'intro' | 'step';
  num?: number;
  title: string;
  desc: string;
  illust: React.ReactNode;
};

// 소개 1장을 뺀 "단계" 개수 — "STEP n / 4" 표기에 쓴다.
const STEP_COUNT = 4;

export default function OnboardingGuide({ onClose }: { onClose: () => void }) {
  // 지금 보여줄 장 (0 = 소개). 점 인디케이터/다음 버튼으로 이동.
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;
  const current = SLIDES[step];

  // ESC 키로 닫기 — 다른 모달과 동일한 약속.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="콘티노트 사용법"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(31, 27, 22, 0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      {/* 카드 — 배경 클릭은 닫힘이지만 카드 안 클릭은 막는다(stopPropagation). */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          width: '100%',
          maxWidth: 420,
          borderRadius: 14,
          padding: '20px 22px 18px',
          position: 'relative',
          border: '1px solid var(--rule)',
          boxShadow: '0 20px 60px -10px rgba(0,0,0,0.3)',
        }}
      >
        {/* 상단 줄: 건너뛰기(왼) · 닫기 ✕(오) */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 4,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--ink-3)',
              cursor: 'pointer',
              fontSize: 13,
              padding: 4,
            }}
          >
            건너뛰기
          </button>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              border: '1px solid var(--rule)',
              background: 'var(--paper)',
              color: 'var(--ink-2)',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {/* 그림 + 글 영역 — step이 바뀌면 React가 내용만 교체한다. */}
        <div style={{ textAlign: 'center', paddingTop: 4 }}>
          <div
            style={{
              height: 150,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 4,
            }}
          >
            {current.illust}
          </div>
          {/* 소개 장은 "콘티노트 사용법", 단계 장은 "STEP n / 4" */}
          <div
            className="mono"
            style={{ color: 'var(--accent)', fontSize: 12, letterSpacing: '0.06em' }}
          >
            {current.kind === 'step' ? `STEP ${current.num} / ${STEP_COUNT}` : '콘티노트 사용법'}
          </div>
          <h3 style={{ margin: '6px 0 8px', fontSize: 20, lineHeight: 1.3, wordBreak: 'keep-all' }}>
            {current.title}
          </h3>
          {/* minHeight: 장마다 설명 길이가 달라도 카드 높이가 안 흔들리게 고정. */}
          <p
            style={{
              color: 'var(--ink-2)',
              fontSize: 14,
              lineHeight: 1.65,
              margin: 0,
              minHeight: 70,
              wordBreak: 'keep-all',
            }}
          >
            {current.desc}
          </p>
        </div>

        {/* 점 인디케이터 — 현재 장은 길쭉한 막대로. 누르면 그 장으로 점프. */}
        <div
          style={{
            display: 'flex',
            gap: 7,
            justifyContent: 'center',
            margin: '16px 0',
          }}
        >
          {SLIDES.map((s, i) => (
            <button
              key={i}
              aria-label={`${i + 1}번째 화면 보기`}
              onClick={() => setStep(i)}
              style={{
                width: i === step ? 22 : 8,
                height: 8,
                borderRadius: 4,
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                background: i === step ? 'var(--accent)' : 'var(--rule)',
                transition: 'all 160ms',
              }}
            />
          ))}
        </div>

        {/* 이전 / 다음(마지막 장에서는 시작하기) */}
        <div style={{ display: 'flex', gap: 10 }}>
          {step > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep(step - 1)}
              style={{ flex: '0 0 auto' }}
            >
              이전
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (isLast ? onClose() : setStep(step + 1))}
            style={{ flex: 1 }}
          >
            {isLast ? '시작하기' : '다음'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// 슬라이드 내용 + 그림
//   - 글은 음악 용어 없이, 처음 쓰는 사람이 바로 이해할 말로.
//   - 그림은 단순 SVG (외부 이미지 X → 빠르고 가볍다).
// ────────────────────────────────────────────────────────────────────────

const CARD = { width: 210, height: 130 };

// 소개 — 악보 → 가사 → PPT 한 줄 흐름 (앱이 뭘 하는지 한눈에)
function IllustOverview() {
  return (
    <svg viewBox="0 0 210 130" width={CARD.width} height={CARD.height} aria-hidden="true">
      {/* 1) 악보 카드 */}
      <g transform="translate(6 42)">
        <rect width="46" height="50" rx="5" fill="#fdfcf8" stroke="var(--rule)" strokeWidth="1" />
        <g stroke="rgba(0,0,0,0.4)" strokeWidth="0.5">
          <line x1="7" y1="12" x2="39" y2="12" />
          <line x1="7" y1="17" x2="39" y2="17" />
          <line x1="7" y1="22" x2="39" y2="22" />
        </g>
        <g fill="rgba(0,0,0,0.7)">
          <circle cx="13" cy="20" r="2" />
          <circle cx="23" cy="17" r="2" />
          <circle cx="33" cy="21" r="2" />
        </g>
        <g fill="rgba(0,0,0,0.3)">
          <rect x="7" y="32" width="22" height="3" rx="1.5" />
          <rect x="7" y="39" width="30" height="3" rx="1.5" />
        </g>
      </g>
      {/* 화살표 */}
      <g stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M56 67 H70" />
        <path d="M65 62 L70 67 L65 72" />
      </g>
      {/* 2) 가사 목록 카드 (AI) */}
      <g transform="translate(76 42)">
        <rect width="46" height="50" rx="5" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1" />
        <rect x="7" y="8" width="16" height="9" rx="4.5" fill="var(--accent)" />
        <text x="15" y="14.5" textAnchor="middle" fill="#fff" style={{ font: "700 6px 'JetBrains Mono', monospace" }}>
          AI
        </text>
        <g fill="var(--ink)" opacity="0.75">
          <rect x="7" y="24" width="32" height="3" rx="1.5" />
          <rect x="7" y="31" width="26" height="3" rx="1.5" />
          <rect x="7" y="38" width="30" height="3" rx="1.5" />
        </g>
      </g>
      {/* 화살표 */}
      <g stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M126 67 H140" />
        <path d="M135 62 L140 67 L135 72" />
      </g>
      {/* 3) PPT 슬라이드 카드 */}
      <g transform="translate(146 42)">
        <rect width="50" height="50" rx="5" fill="var(--ink)" />
        <circle cx="44" cy="8" r="9" fill="var(--accent)" opacity="0.3" />
        <g fill="#fff">
          <rect x="11" y="24" width="28" height="4" rx="2" />
          <rect x="15" y="32" width="20" height="4" rx="2" />
        </g>
      </g>
    </svg>
  );
}

// STEP 1 — 악보 올리기
function IllustUpload() {
  return (
    <svg viewBox="0 0 200 130" width={200} height={CARD.height} aria-hidden="true">
      <rect
        x="40"
        y="20"
        width="120"
        height="90"
        rx="10"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeDasharray="6 5"
      />
      <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M100 78 V44" />
        <path d="M86 58 L100 44 L114 58" />
      </g>
      <rect x="74" y="84" width="52" height="6" rx="3" fill="var(--accent)" opacity="0.3" />
    </svg>
  );
}

// STEP 2 — 가사 자동 추출 (AI 칩 + 가사 줄 + 연필 수정 표시)
function IllustExtract() {
  return (
    <svg viewBox="0 0 200 130" width={200} height={CARD.height} aria-hidden="true">
      <rect x="34" y="14" width="132" height="102" rx="10" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.5" />
      <rect x="46" y="26" width="30" height="16" rx="8" fill="var(--accent)" />
      <text x="61" y="38" textAnchor="middle" fill="#fff" style={{ font: "700 10px 'JetBrains Mono', monospace" }}>
        AI
      </text>
      <g fill="var(--ink)" opacity="0.78">
        <rect x="46" y="56" width="78" height="6" rx="3" />
        <rect x="46" y="70" width="92" height="6" rx="3" />
        <rect x="46" y="84" width="66" height="6" rx="3" />
      </g>
      {/* 연필(✎) = 틀린 글자 직접 수정 */}
      <g transform="translate(132 78)">
        <circle cx="11" cy="11" r="13" fill="var(--accent)" opacity="0.14" />
        <path
          d="M6 14 L14 6 L17 9 L9 17 L5 18 Z"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

// STEP 3 — 묶음(칩) 눌러서 콘티 만들기 (후렴은 여러 번 → 반복)
// 위: 칩 3개 중 가운데(후렴) 탭 → 아래 콘티에 그 묶음이 두 번 담김(반복).
function IllustChips() {
  return (
    <svg viewBox="0 0 200 130" width={200} height={CARD.height} aria-hidden="true">
      {/* 칩 3개 */}
      <rect x="14" y="12" width="40" height="17" rx="8.5" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.2" />
      <rect x="62" y="12" width="40" height="17" rx="8.5" fill="var(--accent)" />
      <rect x="110" y="12" width="40" height="17" rx="8.5" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.2" />
      {/* 가운데 칩(후렴) 탭 표시 — 손가락 대신 작은 링 */}
      <circle cx="82" cy="20" r="13" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.5" />
      {/* 아래로 내려가는 화살표 (가운데 칩 → 콘티) */}
      <g stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M82 34 V46" />
        <path d="M77 41 L82 46 L87 41" />
      </g>
      {/* 콘티 패널 — 같은 묶음(후렴)이 두 번 들어가 반복을 보여줌 */}
      <rect x="40" y="52" width="120" height="66" rx="7" fill="var(--paper)" stroke="var(--rule)" strokeWidth="1.2" />
      <g>
        <rect x="50" y="62" width="70" height="6" rx="3" fill="var(--ink)" opacity="0.3" />
        <rect x="50" y="76" width="84" height="6" rx="3" fill="var(--accent)" opacity="0.9" />
        <rect x="50" y="90" width="58" height="6" rx="3" fill="var(--ink)" opacity="0.3" />
        <rect x="50" y="104" width="84" height="6" rx="3" fill="var(--accent)" opacity="0.9" />
      </g>
    </svg>
  );
}

// STEP 4 — PPT 다운로드 (어두운 슬라이드 + 테마 점 + 내려받기 화살표)
function IllustDownload() {
  return (
    <svg viewBox="0 0 200 130" width={200} height={CARD.height} aria-hidden="true">
      <rect x="40" y="14" width="120" height="74" rx="8" fill="var(--ink)" />
      <circle cx="148" cy="26" r="16" fill="var(--accent)" opacity="0.3" />
      <g fill="#fff">
        <rect x="64" y="42" width="72" height="6" rx="3" />
        <rect x="76" y="56" width="48" height="6" rx="3" />
      </g>
      <g>
        <circle cx="62" cy="102" r="6" fill="var(--ink)" />
        <circle cx="82" cy="102" r="6" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.5" />
        <circle cx="102" cy="102" r="6" fill="var(--accent)" />
      </g>
      <g transform="translate(128 92)" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M12 2 V18" />
        <path d="M5 12 L12 19 L19 12" />
      </g>
    </svg>
  );
}

const SLIDES: GuideSlide[] = [
  {
    kind: 'intro',
    title: '악보 한 장으로 시작해요',
    desc: '찬양 악보를 넣으면, 가사를 자동으로 뽑아 콘티와 예배용 PPT까지 만들어요. 옆으로 넘겨 네 단계로 살펴보세요.',
    illust: <IllustOverview />,
  },
  {
    kind: 'step',
    num: 1,
    title: '악보를 올려요',
    desc: '찬양 악보를 사진이나 PDF로 올려요. 한 번에 12장까지 한꺼번에 올릴 수 있어요.',
    illust: <IllustUpload />,
  },
  {
    kind: 'step',
    num: 2,
    title: 'AI가 가사를 뽑아줘요',
    desc: '‘가사 추출하기’를 누르면 AI가 가사만 자동으로 뽑아줘요. 틀린 글자는 연필(✎) 버튼으로 바로 고칠 수 있어요.',
    illust: <IllustExtract />,
  },
  {
    kind: 'step',
    num: 3,
    title: '눌러서 콘티를 만들어요',
    desc: '가사 묶음(칩)을 누르면 콘티에 담겨요. 후렴처럼 반복되는 부분은 여러 번 누르면 그만큼 반복돼요.',
    illust: <IllustChips />,
  },
  {
    kind: 'step',
    num: 4,
    title: 'PPT로 내려받아요',
    desc: '배경과 글꼴을 고르고 ‘PPT 다운로드’를 누르면, 예배용 PPT가 바로 완성돼요.',
    illust: <IllustDownload />,
  },
];
