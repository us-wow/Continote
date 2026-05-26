// 외부 슬라이드 도구로 콘티를 가져갈 수 있게 두 가지 텍스트 형식으로 export.
//
// 1. Plain Slides (.txt) — ProPresenter 7 / EasyWorship 등 대부분의 도구가
//    "텍스트 import"로 받음. 슬라이드 사이는 빈 줄, 슬라이드 시작은 [Section Label].
//
// 2. OpenSong XML — 표준 가사 형식. ProPresenter, OpenLP 등 다양한 도구
//    호환성 좋음. <song><lyrics>[V1]\n가사…</lyrics></song> 구조.

import type { PptSlide } from './pptx';

// PptSlide가 union 타입(title | memo | lyric)으로 바뀌어, 외부 export 시 한 줄 배열로
// 평탄화하는 작은 헬퍼. title은 [제목, 부제], memo는 [본문] 한 줄, lyric은 기존 lines 그대로.
function slideToLines(slide: PptSlide): string[] {
  if (slide.kind === 'title') {
    return slide.subtitle ? [slide.title, slide.subtitle] : [slide.title];
  }
  if (slide.kind === 'memo') return [slide.text];
  return slide.lines;
}

// doc 기반으로 만든 슬라이드 배열 + 곡 제목 리스트를 받아 형식별 텍스트 생성.
export type ExportInput = {
  slides: PptSlide[];
  songTitles: string[]; // 첫 곡 제목을 OpenSong title로 사용
};

// ===== Plain Slides .txt =====
// 형식 예:
//   [Slide 1]
//   가사 1줄
//   가사 2줄
//
//   [Slide 2]
//   ...
export function buildPlainSlidesTxt(input: ExportInput): string {
  const lines: string[] = [];
  input.slides.forEach((slide, i) => {
    lines.push(`[Slide ${i + 1}]`);
    for (const line of slideToLines(slide)) lines.push(line);
    lines.push(''); // 슬라이드 사이 빈 줄
  });
  return lines.join('\n');
}

// ===== OpenSong XML =====
// 형식: <?xml ?> + <song> + <title> + <lyrics> + 슬라이드별 [V1]/[V2] 마커
export function buildOpenSongXml(input: ExportInput): string {
  const title = (input.songTitles[0] || 'Untitled')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const lyricsBody: string[] = [];
  input.slides.forEach((slide, i) => {
    // OpenSong 표준은 [V1] [C] [B] 같은 마커. 일단 순서 기반 [V{i+1}]로 통일.
    lyricsBody.push(`[V${i + 1}]`);
    for (const line of slideToLines(slide)) {
      lyricsBody.push(
        line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
      );
    }
    lyricsBody.push('');
  });
  const lyrics = lyricsBody.join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<song>
  <title>${title}</title>
  <author></author>
  <copyright></copyright>
  <ccli></ccli>
  <lyrics>
${lyrics}
  </lyrics>
</song>
`;
}

// 다운로드 트리거 — 브라우저 only
export function downloadText(content: string, fileName: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
