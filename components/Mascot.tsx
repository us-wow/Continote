'use client';

// 콘티노트 마스코트 컴포넌트
// public/mascot/{idle,listening,reading,done}.png 를 그대로 표시
// (Replicate Flux로 생성한 PNG → Mac 빠른작업으로 배경 제거)
//
// 사용 예:
//   <Mascot pose="idle" size={140} />
//   <MascotMini size={28} />        // 로고 옆이나 footer 작은 자리

type Pose = 'idle' | 'listening' | 'reading' | 'done';

const POSE_FILES: Record<Pose, string> = {
  idle: '/mascot/idle.png',
  listening: '/mascot/listening.png',
  reading: '/mascot/reading.png',
  done: '/mascot/done.png',
};

interface MascotProps {
  pose?: Pose;
  size?: number;
  className?: string;
}

export default function Mascot({ pose = 'idle', size = 140, className }: MascotProps) {
  // Next.js Image 대신 일반 <img> 사용 — public/ 의 정적 파일이라
  // 별도 최적화 설정 없이 바로 동작. 4컷이라 무게 부담 없음.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={POSE_FILES[pose]}
      // 이 이미지는 장식 용도이므로 스크린리더에서 무시되도록 alt를 비웠다.
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  );
}

// 작은 마스코트 — 헤더 로고 옆이나 footer에서 사용
// 항상 idle 포즈로 고정
export function MascotMini({ size = 28 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={POSE_FILES.idle}
      // 이 이미지는 장식 용도이므로 스크린리더에서 무시되도록 alt를 비웠다.
      alt=""
      width={size}
      height={size}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}
