'use client';

// 사용법 단계 가이드 — 4단계를 "한 장씩 넘겨 보는" 비주얼 캐러셀.
//
// 어디서 쓰나:
//   ① 헤더/메뉴의 "사용법" 버튼 → 언제든 다시 열기
//   ② 데스크톱 첫 방문 → 자동으로 한 번 (localStorage 'onboarding-seen')
//
// 왜 캐러셀인가:
//   예전 도움말은 긴 글 목록이라 초보자가 안 읽었다.
//   한 단계에 "그림 1개 + 한 줄 설명"만 두면 부담이 작다.
//   (찬양팀 로테이션 앱의 단계별 온보딩 방식을 콘티노트에 맞춰 차용)

import { useEffect, useState } from 'react';

// 각 단계 = 그림 + 단계번호 + 한 줄 제목 + 한 줄 설명.
type GuideStep = {
  num: number;
  title: string;
  desc: string;
  illust: React.ReactNode;
};

export default function OnboardingGuide({ onClose }: { onClose: () => void }) {
  // 지금 보여줄 단계 (0부터 시작). 점 인디케이터/다음 버튼으로 이동.
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

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
          <div
            className="mono"
            style={{ color: 'var(--accent)', fontSize: 12, letterSpacing: '0.06em' }}
          >
            STEP {current.num} / {STEPS.length}
          </div>
          <h3 style={{ margin: '6px 0 8px', fontSize: 20, lineHeight: 1.3, wordBreak: 'keep-all' }}>
            {current.title}
          </h3>
          {/* minHeight: 단계마다 설명 길이가 달라도 카드 높이가 안 흔들리게 고정. */}
          <p
            style={{
              color: 'var(--ink-2)',
              fontSize: 14,
              lineHeight: 1.65,
              margin: 0,
              minHeight: 66,
              wordBreak: 'keep-all',
            }}
          >
            {current.desc}
          </p>
        </div>

        {/* 점 인디케이터 — 현재 단계는 길쭉한 막대로. 누르면 그 단계로 점프. */}
        <div
          style={{
            display: 'flex',
            gap: 7,
            justifyContent: 'center',
            margin: '16px 0',
          }}
        >
          {STEPS.map((s, i) => (
            <button
              key={s.num}
              aria-label={`${i + 1}단계 보기`}
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

        {/* 이전 / 다음(마지막 단계에서는 시작하기) */}
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
// 4단계 내용 + 그림
//   - 글은 음악 용어 없이, 처음 쓰는 사람이 바로 이해할 말로.
//   - 그림은 단순 SVG (외부 이미지 X → 빠르고 가볍다).
// ────────────────────────────────────────────────────────────────────────

// 공통 카드 테두리 스타일 — 그림 SVG를 감싸는 작은 종이/슬라이드 느낌.
const CARD = {
  width: 200,
  height: 130,
};

// STEP 1 — 악보 올리기
function IllustUpload() {
  return (
    <svg viewBox="0 0 200 130" width={CARD.width} height={CARD.height} aria-hidden="true">
      {/* 점선 업로드 박스 */}
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
      {/* 위로 향한 화살표 = 업로드 */}
      <g stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M100 78 V44" />
        <path d="M86 58 L100 44 L114 58" />
      </g>
      <rect x="74" y="84" width="52" height="6" rx="3" fill="var(--accent)" opacity="0.3" />
    </svg>
  );
}

// STEP 2 — 가사 자동 추출 (AI 칩 + 가사 줄 + 체크)
function IllustExtract() {
  return (
    <svg viewBox="0 0 200 130" width={CARD.width} height={CARD.height} aria-hidden="true">
      <rect x="34" y="14" width="132" height="102" rx="10" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.5" />
      {/* AI 칩 */}
      <rect x="46" y="26" width="30" height="16" rx="8" fill="var(--accent)" />
      <text x="61" y="38" textAnchor="middle" fill="#fff" style={{ font: "700 10px 'JetBrains Mono', monospace" }}>
        AI
      </text>
      {/* 가사 줄들 */}
      <g fill="var(--ink)" opacity="0.78">
        <rect x="46" y="56" width="90" height="6" rx="3" />
        <rect x="46" y="70" width="108" height="6" rx="3" />
        <rect x="46" y="84" width="78" height="6" rx="3" />
        <rect x="46" y="98" width="96" height="6" rx="3" />
      </g>
      {/* 완료 체크 */}
      <g transform="translate(142 24)">
        <circle cx="9" cy="9" r="9" fill="var(--accent)" opacity="0.16" />
        <path d="M5 9.5 L8 12.5 L13.5 6.5" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// STEP 3 — 빈 줄로 슬라이드 나누기 (핵심 개념)
// 왼쪽: 가사 줄 사이에 "빈 줄" 간격 → 오른쪽: 두 장의 슬라이드로 갈라짐.
function IllustSplit() {
  return (
    <svg viewBox="0 0 200 130" width={CARD.width} height={CARD.height} aria-hidden="true">
      {/* 왼쪽 가사 묶음 1 */}
      <g fill="var(--ink)" opacity="0.7">
        <rect x="14" y="22" width="48" height="5" rx="2.5" />
        <rect x="14" y="32" width="40" height="5" rx="2.5" />
      </g>
      {/* 빈 줄 표시 — 점선 간격 */}
      <line x1="12" y1="50" x2="66" y2="50" stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="4 4" />
      <text x="39" y="47" textAnchor="middle" fill="var(--accent)" style={{ font: "600 7px 'JetBrains Mono', monospace" }}>
        빈 줄
      </text>
      {/* 왼쪽 가사 묶음 2 */}
      <g fill="var(--ink)" opacity="0.7">
        <rect x="14" y="62" width="44" height="5" rx="2.5" />
        <rect x="14" y="72" width="50" height="5" rx="2.5" />
      </g>
      {/* 화살표 */}
      <g stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M84 50 H106" />
        <path d="M100 44 L106 50 L100 56" />
      </g>
      {/* 오른쪽 슬라이드 2장 (앞뒤로 살짝 겹침) */}
      <rect x="128" y="34" width="56" height="40" rx="5" fill="var(--ink)" opacity="0.18" transform="rotate(4 156 54)" />
      <rect x="124" y="28" width="56" height="40" rx="5" fill="var(--ink)" />
      <g fill="#fff">
        <rect x="136" y="42" width="32" height="4" rx="2" />
        <rect x="140" y="52" width="24" height="4" rx="2" />
      </g>
    </svg>
  );
}

// STEP 4 — PPT 다운로드 (어두운 슬라이드 + 테마 점 + 내려받기 화살표)
function IllustDownload() {
  return (
    <svg viewBox="0 0 200 130" width={CARD.width} height={CARD.height} aria-hidden="true">
      {/* 슬라이드 */}
      <rect x="40" y="14" width="120" height="74" rx="8" fill="var(--ink)" />
      <circle cx="148" cy="26" r="16" fill="var(--accent)" opacity="0.3" />
      <g fill="#fff">
        <rect x="64" y="42" width="72" height="6" rx="3" />
        <rect x="76" y="56" width="48" height="6" rx="3" />
      </g>
      {/* 테마 점 3개 */}
      <g>
        <circle cx="62" cy="102" r="6" fill="var(--ink)" />
        <circle cx="82" cy="102" r="6" fill="var(--surface)" stroke="var(--rule)" strokeWidth="1.5" />
        <circle cx="102" cy="102" r="6" fill="var(--accent)" />
      </g>
      {/* 내려받기 화살표 */}
      <g transform="translate(128 92)" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M12 2 V18" />
        <path d="M5 12 L12 19 L19 12" />
      </g>
    </svg>
  );
}

const STEPS: GuideStep[] = [
  {
    num: 1,
    title: '악보를 올려요',
    desc: '찬양 악보를 사진이나 PDF로 올려요. 한 번에 12장까지 한꺼번에 올릴 수 있어요.',
    illust: <IllustUpload />,
  },
  {
    num: 2,
    title: '가사가 자동으로 나와요',
    desc: '‘가사 추출하기’를 누르면, AI가 악보에서 가사만 뽑아서 글로 보여줘요.',
    illust: <IllustExtract />,
  },
  {
    num: 3,
    title: '빈 줄로 슬라이드를 나눠요',
    desc: '가사에서 줄을 한 번 띄우면(빈 줄), 그 자리에서 슬라이드가 나뉘어요. 한 묶음이 한 장이 돼요.',
    illust: <IllustSplit />,
  },
  {
    num: 4,
    title: 'PPT로 내려받아요',
    desc: '배경과 글꼴을 고르고 ‘PPT 다운로드’를 누르면, 예배용 PPT가 바로 완성돼요.',
    illust: <IllustDownload />,
  },
];
