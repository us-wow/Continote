// 콘티노트 브랜드 마크 — mockup 디자인의 SVG 로고.
// 사각 배경 + 페이지 모서리 접힘 + 음표 두 개로 "악보 + 페이지" 의미 결합.

export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span style={{ lineHeight: 0, display: 'inline-block', flexShrink: 0 }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 34 34">
        {/* 테라코타 사각 배경 — 현재 테마의 --accent 변수 사용 */}
        <rect x="2" y="2" width="30" height="30" rx="7" fill="var(--accent)" />
        {/* 페이지 모서리 접힘 */}
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
        {/* 음표 두 개 — 4분음표 머리 + 막대 + 깃발 */}
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
    </span>
  );
}
