// 짧은 영상(≤10초) → 움직이는 GIF 배경 변환 — 전부 브라우저 안에서 (서버 비용 0).
//
// 원리: <video>를 화면 밖에서 열고, 0.17초(6fps) 간격으로 장면을 캔버스에 그려
// 한 장씩 캡처한 뒤 GIF로 묶는다. 원본 영상은 어디에도 업로드되지 않는다.
//
// 용량 가드: 960×540·6fps로 먼저 뽑고, 8MB를 넘으면 800×450·5fps로 줄여 한 번 재시도.
// 그래도 크면 그대로 반환하고 호출 측에서 막는다(10MB 하드캡은 호출 측).

import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const MAX_SECONDS = 10;       // 이보다 긴 영상은 앞 10초만 사용
const TARGET_BYTES = 8 * 1024 * 1024;

type ConvertResult = {
  dataUrl: string;
  bytes: number;
  seconds: number;   // 실제 변환된 길이
  trimmed: boolean;  // 원본이 10초보다 길어 잘렸는지
};

// 영상 파일을 메타데이터까지 로드된 <video> 엘리먼트로
function loadVideo(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => reject(new Error('영상을 열 수 없어요'));
  });
}

// 특정 시점으로 이동하고 그 프레임이 준비될 때까지 대기
function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('영상 탐색 실패')); };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = t;
  });
}

async function encodeOnce(
  video: HTMLVideoElement,
  seconds: number,
  width: number,
  height: number,
  fps: number,
  onProgress: (pct: number) => void
): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  // 영상 비율 유지하면서 캔버스를 꽉 채우는 cover 크롭 계산
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale, dh = vh * scale;
  const dx = (width - dw) / 2, dy = (height - dh) / 2;

  const totalFrames = Math.max(2, Math.round(seconds * fps));
  const gif = GIFEncoder();
  let palette: ReturnType<typeof quantize> | null = null;

  for (let i = 0; i < totalFrames; i++) {
    await seekTo(video, (i / fps) + 0.01);
    ctx.drawImage(video, dx, dy, dw, dh);
    const { data } = ctx.getImageData(0, 0, width, height);
    // 팔레트는 중간 프레임에서 한 번만 뽑아 전체에 공유 — 깜빡임 방지 + 속도
    if (!palette && i >= Math.floor(totalFrames / 2)) {
      palette = quantize(data, 160);
    }
    if (!palette && i === 0) palette = quantize(data, 160);
    const index = applyPalette(data, palette!);
    gif.writeFrame(index, width, height, {
      palette: i === 0 ? palette! : undefined,
      delay: Math.round(1000 / fps),
    });
    onProgress(Math.round(((i + 1) / totalFrames) * 100));
  }
  gif.finish();
  return gif.bytes();
}

export async function videoFileToGif(
  file: File,
  onProgress: (pct: number, label: string) => void
): Promise<ConvertResult> {
  const video = await loadVideo(file);
  const trimmed = video.duration > MAX_SECONDS;
  const seconds = Math.min(video.duration, MAX_SECONDS);

  let bytes = await encodeOnce(video, seconds, 960, 540, 6, (p) => onProgress(p, '변환 중'));
  // 8MB 초과 → 한 단계 줄여 재시도
  if (bytes.length > TARGET_BYTES) {
    bytes = await encodeOnce(video, seconds, 800, 450, 5, (p) => onProgress(p, '용량 줄이는 중'));
  }
  URL.revokeObjectURL(video.src);

  // Uint8Array → dataURL (기존 customBg 흐름과 같은 형식)
  // 새 ArrayBuffer로 복사 — TS가 SharedArrayBuffer 가능성 때문에 Blob 인자로 거부해서
  const copied = new Uint8Array(bytes.length);
  copied.set(bytes);
  const blob = new Blob([copied.buffer], { type: 'image/gif' });
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { dataUrl, bytes: bytes.length, seconds, trimmed };
}
