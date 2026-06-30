'use client';

// PDF.js를 통한 PDF → 이미지 변환 (클라이언트 사이드)
// 각 페이지를 PNG base64로 반환

export type PdfPageImage = {
  data: string; // base64 (헤더 제외)
  // JPEG로 통일 — PNG 대비 60~70% 작음, Gemini가 더 빨리 처리
  mimeType: 'image/jpeg';
  pageNumber: number;
};

let pdfjsLib: any = null;

async function getPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  // 동적 import (SSR 회피)
  const lib = await import('pdfjs-dist');
  // worker는 CDN에서 로드
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`;
  pdfjsLib = lib;
  return lib;
}

// scale 1.5 + JPEG 0.85로 페이로드 크게 축소
// 이유: scale=2 PNG는 가사 OCR 용도엔 과한 화질. 1.5 + JPEG로 60~70% 작아지고
// Gemini도 더 빨리 처리 → 추출 시간 5~9초 단축
export async function pdfToImages(file: File, scale?: number): Promise<PdfPageImage[]> {
  const lib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  // 작은 PDF는 scale 2로 렌더링해 OCR 정확도를 높인다.
  // 큰 PDF나 페이지가 많은 PDF에서 같은 해상도를 쓰면 이미지 페이로드가 급증하므로
  // 기존 기본값인 1.5를 유지해 처리 시간과 메모리 사용량을 제한한다.
  const effectiveScale = scale ?? (file.size <= 8 * 1024 * 1024 && pdf.numPages <= 4 ? 2 : 1.5);

  const images: PdfPageImage[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: effectiveScale });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context 생성 실패');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    // JPEG quality 0.85 — 가사 OCR엔 시각적 차이 무시할 수 있고 용량 절반 이하
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];
    images.push({ data: base64, mimeType: 'image/jpeg', pageNumber: i });
  }

  return images;
}

// PDF 첫 페이지만 작게 렌더링 — 업로드 영역 썸네일용
// 전체 페이지 변환(pdfToImages)보다 훨씬 빠름. 큰 PDF도 1초 이내
export async function pdfFirstPageThumb(file: File, scale = 0.5): Promise<string> {
  const lib = await getPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context 생성 실패');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// 업로드 이미지를 보내기 전 긴 변 기준 1800px로 줄인다(JPEG 0.85).
// 이유: 가사 추출엔 그 이상 해상도가 의미 없는데, 폰 사진 원본(3~4천 px·수 MB)을
//       그대로 보내면 토큰·전송량·추출 시간만 커진다. 대조 실험(down1800)에서
//       품질 손실 0(오히려 같거나 나음) 확인됨.
const MAX_EDGE = 1800;

export async function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  // 원본 그대로 읽기 — 다운스케일이 안 되는 환경(캔버스 미지원·HEIC 등)에서의 안전한 폴백
  const readOriginal = () =>
    new Promise<{ data: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: (reader.result as string).split(',')[1], mimeType: file.type });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  try {
    // imageOrientation: 'from-image' — 폰 사진의 EXIF 회전을 반영해 똑바로 세운다.
    // (canvas는 EXIF를 안 들고 가므로 이걸 안 주면 옆으로 누운 채 전송될 수 있다.)
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) { bitmap.close?.(); return await readOriginal(); } // 이미 작으면 재인코딩 안 함

    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close?.(); return await readOriginal(); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { data: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
  } catch {
    return await readOriginal(); // 무슨 일이 있어도 원본 전송으로 떨어져 기능은 안 막힘
  }
}
