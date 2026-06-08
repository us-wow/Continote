// 홀리 그라데이션 배경 생성 스크립트 (한 번만 실행하는 자산 생성기)
//
// PowerPoint 슬라이드 배경은 그라데이션을 직접 못 받는다 → 이미지(JPEG)로 구워서 public/에 둔다.
// 미리보기(PreviewModal)와 PPT 출력(lib/pptx.ts)이 둘 다 이 .jpg를 참조하므로 자동으로 일치한다.
//
// sharp(0.34, Next.js가 이미 설치)로 SVG → JPEG 변환. 새 의존성 없음.
// 실행: node scripts/gen-holy-bg.mjs

import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');
// 슬라이드 비율 16:9 (13.333 × 7.5인치)에 맞춘 해상도.
const W = 1920;
const H = 1080;

// 각 배경을 SVG 문자열로 정의한다. 색 정의가 곧 단일 진실(single source).
// 정렬 기능(상/중/하)을 고려해 한 배경 안에서 톤을 일관되게 유지 → 가사가 어디 와도 읽힘.
const SVGS = {
  // 빛내림 — 짙은 네이비 + 위에서 내려오는 빛무리(성령 임재). 글자: 흰색.
  // 광채 정점을 '중간 금빛(#D8BE82)'으로 눌러서, 상단정렬 가사도 흰 글자가 읽히도록 함.
  light: `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="3%" r="88%">
        <stop offset="0%" stop-color="#D8BE82"/>
        <stop offset="16%" stop-color="#6E6486"/>
        <stop offset="40%" stop-color="#20264C"/>
        <stop offset="72%" stop-color="#0E1330"/>
        <stop offset="100%" stop-color="#070B1E"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#070B1E"/>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`,

  // 새벽 — 깊은 자주빛→따뜻한 호박색, 아래에서 떠오르는 여명 글로우. 글자: 흰색.
  // 하단 베이스를 깊은 갈색(#5E2E18)으로 낮추고 글로우 불투명도를 줄여, 하단정렬 가사도 읽히게.
  dawn: `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#20102C"/>
        <stop offset="38%" stop-color="#361829"/>
        <stop offset="70%" stop-color="#4E241F"/>
        <stop offset="100%" stop-color="#5E2E18"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="100%" r="72%">
        <stop offset="0%" stop-color="#C2702E" stop-opacity="0.35"/>
        <stop offset="50%" stop-color="#C2702E" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#C2702E" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#base)"/>
    <rect width="${W}" height="${H}" fill="url(#glow)"/>
  </svg>`,

  // 고요한 빛 — 차가운 새벽빛(상단 푸른빛)→따뜻한 아이보리. 밝은 예배실용. 글자: 진한 먹색.
  // 기존 '종이 톤(paper)'은 따뜻한 단색 → 이건 푸른빛이 섞여 확실히 구분됨.
  serene: `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="50%" cy="0%" r="120%">
        <stop offset="0%" stop-color="#DDE6F2"/>
        <stop offset="22%" stop-color="#ECEBE9"/>
        <stop offset="60%" stop-color="#EDE8DC"/>
        <stop offset="100%" stop-color="#E9E3D2"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="#E9E3D2"/>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
  </svg>`,
};

for (const [name, svg] of Object.entries(SVGS)) {
  const out = join(OUT, `pptx-bg-${name}.jpg`);
  // quality 90 — 그라데이션은 JPEG로 잘 압축되어 파일이 작다(수십 KB).
  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(out);
  console.log('생성 완료:', out);
}
