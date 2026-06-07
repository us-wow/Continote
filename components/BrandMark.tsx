// 콘티노트 브랜드 마크 — 실제 병아리 캐릭터 이미지를 사용.

export default function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(8, Math.round(size * 0.24)),
        background: '#FFF3D4',
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
        src="/mascot/idle.png"
        alt=""
        width={Math.round(size * 1.12)}
        height={Math.round(size * 1.12)}
        style={{
          display: 'block',
          width: '112%',
          height: '112%',
          objectFit: 'contain',
          transform: 'translateY(2%)',
        }}
      />
    </span>
  );
}
