// 콘티노트 브랜드 마크 — C+N+음표 로고 심볼 (헤더·모바일 공용).
// 로고는 투명 PNG라 크림 칩 위에 얹어 어느 테마에서도 또렷하게 보이게 한다.

export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.26)),
        background: '#FCF8EF', // 로고 원본과 같은 크림 → 투명 심볼이 자연스럽게 얹힌다
        border: '1px solid rgba(0,0,0,0.06)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        overflow: 'hidden',
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      <img
        src="/logo-mark.png"
        alt=""
        style={{ display: 'block', width: '74%', height: '74%', objectFit: 'contain' }}
      />
    </span>
  );
}
