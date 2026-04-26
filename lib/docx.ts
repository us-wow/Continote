'use client';

import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';

export async function exportToDocx(content: string, filename: string) {
  // 콘티 텍스트를 docx로 변환
  // 줄 단위로 파싱: [Verse 1] 같은 라벨은 굵게, 본문은 일반
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    if (line.trim() === '') {
      paragraphs.push(new Paragraph({ children: [new TextRun('')] }));
      continue;
    }

    // 곡 구분선 (━━━ 곡명 ━━━)
    if (/^━+\s*.+\s*━+$/.test(line)) {
      const title = line.replace(/━/g, '').trim();
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 200 },
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 32, // 16pt
              font: '맑은 고딕',
            }),
          ],
        })
      );
      continue;
    }

    // [Verse 1] 같은 섹션 라벨
    if (/^\[.+\]$/.test(line.trim())) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 200, after: 100 },
          children: [
            new TextRun({
              text: line.trim(),
              bold: true,
              size: 24, // 12pt
              color: 'D97941',
              font: '맑은 고딕',
            }),
          ],
        })
      );
      continue;
    }

    // 일반 가사
    paragraphs.push(
      new Paragraph({
        spacing: { line: 360 }, // 줄간격 1.5
        children: [
          new TextRun({
            text: line,
            size: 26, // 13pt
            font: '맑은 고딕',
          }),
        ],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
