// 홀리 배경 생성 스크립트 v4 — "움직이는" 배경 (한 번만 실행하는 자산 생성기)
//
// 사용자가 '새벽'의 구성(어두운 베이스 + 큰 글로우 + 빛망울 9개)을 가장 좋아해서,
// 그 구성을 표준 틀(makeGlowFrame)로 만들고 색 계열만 바꿔 6종을 찍어낸다:
//   새벽(자주·호박) / 푸른빛 / 초록빛 / 금빛 / 분홍빛 / 보랏빛
// 빛내림(광선 다발)만 별도 구성이다.
//
// 만드는 방식: 각 프레임을 SVG로 그려 sharp로 PNG 변환 → ffmpeg 팔레트 방식으로 GIF.
// 모든 움직임은 sin/cos(t), t=0..2π → GIF가 끊김 없이 무한 반복된다.
// 입자 배치는 시드 고정 난수라 다시 돌려도 똑같이 나온다(재현성).
// 깜빡이는 별·글린트는 전부 제거됨(사용자: 눈 아프다) — 떠다니고 숨 쉬는 움직임만.
//
// ⚠️ SVG 렌더러(librsvg) 함정: 그라데이션 stop의 currentColor는 참조하는 도형의 색을
//    못 받아 검정이 된다 → 색마다 그라데이션을 따로 만들어야 한다(bokehDefs).
//
// ⚠️ PowerPoint 제약: GIF를 '배경 채우기'로 넣으면 첫 프레임 정지화면만 나온다.
//    그래서 lib/pptx.ts가 이 GIF를 슬라이드 맨 뒤 전면 이미지(addImage)로 깐다.
//    재생은 슬라이드쇼(발표) 모드에서만 된다 — 편집 화면에선 정지로 보이는 게 정상.
//
// 실행: node scripts/gen-holy-bg.mjs   (ffmpeg 필요 — brew install ffmpeg)
// 결과: public/pptx-bg-{light,dawn,serene,green,gold,pink,violet}.gif

import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { mkdirSync, rmSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public');

const W = 1280;
const H = 720;
const FRAMES = 32;  // 32프레임 ÷ 8fps = 4초 루프
const FPS = 8;

// 시드 고정 난수 — 입자 배치가 실행할 때마다 같게 (mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 색 팔레트별 보케(빛망울) 그라데이션 defs — 가운데 밝고 가장자리로 사라지는 원
function bokehDefs(prefix, palette) {
  return palette
    .map(
      (c, i) => `<radialGradient id="${prefix}${i}" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="${c}" stop-opacity="0.95"/>
        <stop offset="50%" stop-color="${c}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>`
    )
    .join('\n');
}

// 보케 입자 한 세트 — 위치·크기·색·위상은 시드로 고정, 프레임마다 살짝 떠다닌다.
// 좌우 가장자리 위주 배치(가운데 글자 영역 보호) — '새벽' 구성 그대로.
function makeBokeh(seed, count, paletteSize, { rMin, rMax, opMin, opMax }) {
  const rnd = mulberry32(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const side = rnd() < 0.5;
    const x = side ? rnd() * 0.30 * W : (0.70 + rnd() * 0.30) * W;
    parts.push({
      x,
      y: rnd() * H,
      r: rMin + rnd() * (rMax - rMin),
      colorIdx: Math.floor(rnd() * paletteSize),
      driftX: 10 + rnd() * 18,
      driftY: 8 + rnd() * 14,
      phase: rnd() * Math.PI * 2,
      opBase: opMin + rnd() * (opMax - opMin),
    });
  }
  return parts;
}

function bokehSvg(parts, t, prefix) {
  return parts
    .map((p) => {
      const x = p.x + p.driftX * Math.sin(t + p.phase);
      const y = p.y + p.driftY * Math.cos(t * 0.9 + p.phase);
      const op = Math.max(0.05, p.opBase * (0.75 + 0.25 * Math.sin(t + p.phase * 1.7)));
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="url(#${prefix}${p.colorIdx})" opacity="${op.toFixed(3)}"/>`;
    })
    .join('\n');
}

// ── 빛내림 — 칠흑 배경 + 왼쪽 상단(43%)에서 쏟아지는 광선 다발 ─────────────────
const RAY_COLORS = ['#F8EFD4', '#CFE8E2', '#EAD9F2'];
function rayDefs() {
  // 82%에서 완전히 사라지게 — 광선 끝(폴리곤 모서리)이 절대 안 보여 "빛이 잦아드는" 느낌
  return RAY_COLORS.map(
    (c, i) => `<linearGradient id="ray${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${c}" stop-opacity="1"/>
      <stop offset="55%" stop-color="${c}" stop-opacity="0.45"/>
      <stop offset="82%" stop-color="${c}" stop-opacity="0"/>
    </linearGradient>`
  ).join('\n');
}
// 흰금이 다수, 청록/연보라가 사이사이 (프리즘 힌트)
const RAY_COLOR_IDX = [0, 0, 1, 0, 2, 0, 1, 0, 0];
function makeRays(seed, count) {
  const rnd = mulberry32(seed);
  return Array.from({ length: count }, (_, k) => ({
    // 광원이 왼쪽(43%)에 있어 오른쪽으로 갈 공간이 더 넓다 → 부채꼴을 오른쪽으로 약간 더 벌림
    angle: -0.85 + (1.95 * k) / (count - 1) + (rnd() - 0.5) * 0.10,
    // 사선마다 길이가 제각각 — 짧은 빛(0.5H)부터 화면 밖(1.35H)까지
    baseLen: H * (0.5 + rnd() * 0.85),
    // 얇아야 빛 같다 (두꺼우면 부채)
    wBot: 20 + rnd() * 26,
    phase: rnd() * Math.PI * 2,
    colorIdx: RAY_COLOR_IDX[k % RAY_COLOR_IDX.length],
  }));
}
const LIGHT_RAYS = makeRays(11, 13);

function lightFrame(t) {
  const cx = W * 0.43; // 가운데보다 살짝 왼쪽
  const rays = LIGHT_RAYS.map((r) => {
    const L = r.baseLen * (1 + 0.07 * Math.sin(t + r.phase));
    const op = Math.max(0.07, 0.22 + 0.10 * Math.sin(t + r.phase));
    const dx = Math.sin(r.angle), dy = Math.cos(r.angle);
    const px = Math.cos(r.angle), py = -Math.sin(r.angle);
    const wTop = 5;
    const pts = [
      [cx - px * wTop, 0 - py * wTop],
      [cx + px * wTop, 0 + py * wTop],
      [cx + dx * L + px * r.wBot, dy * L + py * r.wBot],
      [cx + dx * L - px * r.wBot, dy * L - py * r.wBot],
    ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    return `<polygon points="${pts}" fill="url(#ray${r.colorIdx})" opacity="${op.toFixed(3)}"/>`;
  }).join('\n');

  const coreR = 8; // 광원은 고정 크기 — 커졌다 작아지는 펄스 없음(사용자 피드백)
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      ${rayDefs()}
      <radialGradient id="bg" cx="43%" cy="0%" r="110%">
        <stop offset="0%" stop-color="#10162B"/>
        <stop offset="45%" stop-color="#090E1D"/>
        <stop offset="100%" stop-color="#04060D"/>
      </radialGradient>
      <radialGradient id="core" cx="43%" cy="0%" r="${coreR}%">
        <stop offset="0%" stop-color="#FFF7DE" stop-opacity="0.85"/>
        <stop offset="50%" stop-color="#E8D6A4" stop-opacity="0.28"/>
        <stop offset="100%" stop-color="#E8D6A4" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="6"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <g filter="url(#soft)">${rays}</g>
    <rect width="${W}" height="${H}" fill="url(#core)"/>
  </svg>`;
}

// ── 글로우+보케 패밀리 — '새벽' 구성 고정, 색 계열만 교체 ─────────────────────
// 구성: 어두운 대각 그라데이션 베이스 + 우상단 큰 글로우(좌우 이동+호흡)
//      + 좌하단 은은한 보조 글로우 + 가장자리 위주 보케 9개.
// 전부 어두운 배경이라 PPT 글자는 흰색.
const GLOW_THEMES = {
  // 새벽 — 자주+호박 (원조, 사용자가 "느낌이 딱 좋다"고 한 기준)
  dawn: {
    seed: 21,
    base: ['#1F0F20', '#341723', '#45202B'],
    glowA: '#F2B468', glowB: '#E8A35C', accent: '#B05A7A',
    palette: ['#E8A35C', '#D98498', '#C9A0E0', '#E8C08A'],
  },
  // 푸른빛 — 새벽 구성 그대로, 푸른 계열로
  serene: {
    seed: 31,
    base: ['#0A142B', '#13234A', '#0E1B38'],
    glowA: '#9FC4F0', glowB: '#7FB2E8', accent: '#3E66A8',
    palette: ['#6FA0E8', '#8FBCF0', '#4F7FC9', '#B8D4F4'],
  },
  // 초록빛 — 깊은 숲
  green: {
    seed: 41,
    base: ['#0A1F14', '#143524', '#0E2818'],
    glowA: '#A8E8C0', glowB: '#7FD8A8', accent: '#3E8F6A',
    palette: ['#7FD8A8', '#A8E8C0', '#4FA878', '#D0F0B8'],
  },
  // 금빛 — 감사·영광
  gold: {
    seed: 51,
    base: ['#241804', '#3A2A0C', '#2E2008'],
    glowA: '#F8D880', glowB: '#F2C14E', accent: '#C08A28',
    palette: ['#F2C14E', '#F8D880', '#E8A35C', '#F8E8B0'],
  },
  // 분홍빛 — 따뜻한 사랑
  pink: {
    seed: 61,
    base: ['#260D1B', '#3E1830', '#301226'],
    glowA: '#F8B8CC', glowB: '#F08FB0', accent: '#C05A8A',
    palette: ['#F08FB0', '#F8B8CC', '#D870A0', '#F0D0E0'],
  },
  // 보랏빛 — 경건한 묵상
  violet: {
    seed: 71,
    base: ['#150E2E', '#241A4A', '#1A1338'],
    glowA: '#C8B0F0', glowB: '#A88FE8', accent: '#6A4AB8',
    palette: ['#A88FE8', '#C8B0F0', '#8A6AD8', '#D8C8F8'],
  },
};

function makeGlowFrame(cfg) {
  const prefix = `bk${cfg.seed}`;
  const bokeh = makeBokeh(cfg.seed, 9, cfg.palette.length, {
    rMin: 36, rMax: 105, opMin: 0.14, opMax: 0.32,
  });
  return (t) => {
    const glowCx = 78 + 2.5 * Math.cos(t);
    const glowOp = 0.32 + 0.08 * Math.sin(t);
    const accentOp = 0.16 + 0.05 * Math.sin(t + 2.1);
    return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${bokehDefs(prefix, cfg.palette)}
        <linearGradient id="bg" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stop-color="${cfg.base[0]}"/>
          <stop offset="50%" stop-color="${cfg.base[1]}"/>
          <stop offset="100%" stop-color="${cfg.base[2]}"/>
        </linearGradient>
        <radialGradient id="glow" cx="${glowCx.toFixed(2)}%" cy="16%" r="42%">
          <stop offset="0%" stop-color="${cfg.glowA}" stop-opacity="${glowOp.toFixed(3)}"/>
          <stop offset="55%" stop-color="${cfg.glowB}" stop-opacity="${(glowOp * 0.35).toFixed(3)}"/>
          <stop offset="100%" stop-color="${cfg.glowB}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="accent" cx="12%" cy="96%" r="45%">
          <stop offset="0%" stop-color="${cfg.accent}" stop-opacity="${accentOp.toFixed(3)}"/>
          <stop offset="100%" stop-color="${cfg.accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>
      <rect width="${W}" height="${H}" fill="url(#glow)"/>
      <rect width="${W}" height="${H}" fill="url(#accent)"/>
      ${bokehSvg(bokeh, t, prefix)}
    </svg>`;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 패밀리 3 — 신규 6종 (구성이 각자 다름 · 스펙은 docs/animated-bg-design.md)
// ═══════════════════════════════════════════════════════════════════════════

// ── 물결 — 레퍼런스(달빛 바다 사진) 기반 v2 ──────────────────────────────────
// 실제 달빛 반사는 가지런한 줄이 아니라 "잘게 부서진 반짝이 군집"이다:
// 수평선 바로 아래 밝은 반짝이 풀(pool) + 아래로 갈수록 성기고 넓어지는 꼬리.
// 화면 전체는 깊은 단색 블루 모노톤.
const WAVE_MOON_X = W * 0.68;
const WAVE_HORIZON = H * 0.52;
const WAVE_GLINTS = (() => {
  const rnd = mulberry32(82);
  const glints = [];
  // 1) 수평선 바로 아래 밀집 풀 — 빽빽해야 "반짝이는 빛 웅덩이"로 보인다 (45개는 성겼음)
  for (let i = 0; i < 85; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd()); // 중심 밀집
    glints.push({
      x: WAVE_MOON_X + Math.cos(a) * rr * 165,
      y: WAVE_HORIZON + 12 + Math.abs(Math.sin(a)) * rr * 40 + rnd() * 8,
      w: 10 + rnd() * 42,
      h: 1.6 + rnd() * 2.2,
      op: 0.45 + rnd() * 0.45,
      phase: rnd() * Math.PI * 2,
      sway: 2 + rnd() * 5,
    });
  }
  // 2) 아래로 내려오는 꼬리 — 달 기둥(glitter path)처럼 좁게 모여서 내려온다
  for (let i = 0; i < 42; i++) {
    const depth = rnd(); // 0=수평선 근처, 1=화면 하단
    glints.push({
      x: WAVE_MOON_X + (rnd() - 0.5) * (50 + depth * 170),
      y: WAVE_HORIZON + 56 + depth * (H - WAVE_HORIZON - 96),
      w: 16 + depth * 44 + rnd() * 16,
      h: 1.8 + depth * 2.0,
      op: 0.14 + (1 - depth) * 0.30 + rnd() * 0.12,
      phase: rnd() * Math.PI * 2,
      sway: 3 + rnd() * 7,
    });
  }
  return glints;
})();
function waveFrame(t) {
  const moonOp = 0.85 + 0.04 * Math.sin(t); // 크기 고정, 불투명도만 미세 호흡
  const streaks = WAVE_GLINTS.map((g) => {
    // 반짝임이 아니라 "일렁임" — 바닥(0.55)을 둬서 꺼지지 않고 부드럽게 오르내린다
    const op = g.op * (0.7 + 0.3 * Math.sin(2 * t + g.phase));
    if (op < 0.03) return '';
    const x = g.x + g.sway * Math.sin(t + g.phase);
    return `<ellipse cx="${x.toFixed(1)}" cy="${g.y.toFixed(1)}" rx="${(g.w / 2).toFixed(1)}" ry="${g.h.toFixed(1)}" fill="url(#streak)" opacity="${op.toFixed(3)}"/>`;
  }).join('\n');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#070F20"/>
        <stop offset="80%" stop-color="#11203A"/>
        <stop offset="100%" stop-color="#16263F"/>
      </linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#101F36"/>
        <stop offset="35%" stop-color="#0A1626"/>
        <stop offset="100%" stop-color="#03070E"/>
      </linearGradient>
      <!-- userSpaceOnUse: %단위 radialGradient는 16:9 화면에 맞춰 타원으로 눌린다(달이 계란됨) → 픽셀 좌표로 진원 유지 -->
      <radialGradient id="moonhalo" gradientUnits="userSpaceOnUse" cx="${WAVE_MOON_X.toFixed(0)}" cy="${(H * 0.18).toFixed(0)}" r="210">
        <stop offset="0%" stop-color="#C8DCF0" stop-opacity="${(moonOp * 0.40).toFixed(3)}"/>
        <stop offset="100%" stop-color="#C8DCF0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="mooncore" gradientUnits="userSpaceOnUse" cx="${WAVE_MOON_X.toFixed(0)}" cy="${(H * 0.18).toFixed(0)}" r="40">
        <stop offset="0%" stop-color="#F4F8FC" stop-opacity="${moonOp.toFixed(3)}"/>
        <stop offset="55%" stop-color="#E8F0F8" stop-opacity="${(moonOp * 0.55).toFixed(3)}"/>
        <stop offset="100%" stop-color="#E8F0F8" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="streak" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#CFE2F8" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#CFE2F8" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${WAVE_HORIZON.toFixed(0)}" fill="url(#sky)"/>
    <rect y="${WAVE_HORIZON.toFixed(0)}" width="${W}" height="${(H - WAVE_HORIZON).toFixed(0)}" fill="url(#sea)"/>
    <rect width="${W}" height="${H}" fill="url(#moonhalo)"/>
    <rect width="${W}" height="${H}" fill="url(#mooncore)"/>
    ${streaks}
  </svg>`;
}

// ── 안개 — 레퍼런스(새벽 운해 사진) 기반 v2 ──────────────────────────────────
// 실제 안개 풍경 = 어두운 산 능선 사이 골짜기에 "빛나는 운해 띠"가 깔려 있고,
// 능선 위로 옅은 안개 자락이 걸쳐 흐른다. 떠다니는 덩어리가 아니다.
// 능선 실루엣 폴리곤 — 다중 사인 합성으로 자연스러운 산세 (고정, 산은 안 움직인다)
function ridgePath(yBase, amp, k, phase) {
  const N = 28;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (W * i) / N;
    const u = (i / N) * Math.PI * 2;
    const y = yBase - amp * (0.55 * Math.sin(u * k + phase) + 0.3 * Math.sin(u * 2 * k + phase * 1.7) + 0.15 * Math.sin(u * 3.3 * k + phase * 0.6));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`;
}
const MIST_RIDGE_FAR = ridgePath(H * 0.46, 46, 1.2, 1.8);
const MIST_RIDGE_NEAR = ridgePath(H * 0.76, 60, 0.9, 4.5);
// 능선 위에 걸친 안개 자락 4개 — 좌우로 천천히 흐른다
const MIST_WISPS = (() => {
  const rnd = mulberry32(93);
  return Array.from({ length: 4 }, (_, i) => ({
    x: W * (0.12 + i * 0.26) + rnd() * 60,
    y: H * (0.42 + (i % 2) * 0.28) + rnd() * 30,
    rx: 260 + rnd() * 200,
    ry: 26 + rnd() * 22,
    sway: 26 + rnd() * 18,
    phase: rnd() * Math.PI * 2,
    op: 0.10 + rnd() * 0.08,
  }));
})();
function mistFrame(t) {
  // 운해 띠의 윗면이 천천히 숨 쉰다 (수면처럼 일렁이는 윗선)
  // 좌우·아래를 화면 밖까지 끌어내 블러 때문에 네모 가장자리가 보이는 걸 막는다(1차 시도 실패)
  const bankTopPts = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const x = -90 + ((W + 180) * i) / N;
    const y = H * 0.60 + 14 * Math.sin((i / N) * Math.PI * 3 + t) + 8 * Math.sin((i / N) * Math.PI * 7 + t * 2 + 1.2);
    bankTopPts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const bankPath = `M -90,${(H + 60).toFixed(0)} L ${bankTopPts.join(' L ')} L ${(W + 90).toFixed(0)},${(H + 60).toFixed(0)} Z`;
  const wisps = MIST_WISPS.map((f) => {
    const x = f.x + f.sway * Math.sin(t + f.phase);
    const op = f.op * (0.85 + 0.15 * Math.sin(t + f.phase * 1.7));
    return `<ellipse cx="${x.toFixed(1)}" cy="${f.y.toFixed(1)}" rx="${f.rx.toFixed(0)}" ry="${f.ry.toFixed(0)}" fill="url(#fog)" opacity="${op.toFixed(3)}"/>`;
  }).join('\n');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#26313F"/>
        <stop offset="55%" stop-color="#1B2533"/>
        <stop offset="100%" stop-color="#10161F"/>
      </linearGradient>
      <radialGradient id="dawnlight" cx="50%" cy="-5%" r="70%">
        <stop offset="0%" stop-color="#AFC4DC" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#AFC4DC" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="bank" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#D4DEE8" stop-opacity="0.55"/>
        <stop offset="45%" stop-color="#B8C6D4" stop-opacity="0.30"/>
        <stop offset="80%" stop-color="#B8C6D4" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="fog" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#C8D4E0" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#C8D4E0" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft10" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="10"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#dawnlight)"/>
    <path d="${MIST_RIDGE_FAR}" fill="#1A2433"/>
    <g filter="url(#soft10)"><path d="${bankPath}" fill="url(#bank)"/></g>
    <path d="${MIST_RIDGE_NEAR}" fill="#0D131D"/>
    ${wisps}
  </svg>`;
}

// ── 촛불 — 레퍼런스(어둠 속 불꽃 사진) 기반 v2 ────────────────────────────────
// 실제 촛불: 배경은 거의 칠흑. 불꽃은 물방울형(흰 심지광 → 노랑 → 주황 가장자리),
// 불빛이 닿는 바닥만 따뜻하게 빛나고 falloff가 가파르다. 멀리 흐릿한 온기 점 1~2개.
function candleFrame(t) {
  // 3화음 합성 — 단일 sin의 기계적 펄스를 피한다 (모두 t의 정수배라 루프 안전)
  const f = 0.6 * Math.sin(t) + 0.3 * Math.sin(2 * t + 1.3) + 0.2 * Math.sin(3 * t + 2.7);
  const fx = W * 0.5 + 4.5 * f;             // 불꽃 좌우 흔들림
  const fy = H * 0.78;
  const stretch = 1 + 0.07 * f;             // 불꽃 키가 살짝 늘었다 줄었다
  const haloOp = 0.5 + 0.06 * f;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#050302"/>
        <stop offset="75%" stop-color="#0C0704"/>
        <stop offset="100%" stop-color="#160C05"/>
      </linearGradient>
      <radialGradient id="floor" gradientUnits="userSpaceOnUse" cx="${fx.toFixed(1)}" cy="${(H * 1.02).toFixed(0)}" r="${(W * 0.42).toFixed(0)}">
        <stop offset="0%" stop-color="#E8A35C" stop-opacity="${(haloOp * 0.7).toFixed(3)}"/>
        <stop offset="55%" stop-color="#A86428" stop-opacity="${(haloOp * 0.25).toFixed(3)}"/>
        <stop offset="100%" stop-color="#A86428" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="190">
        <stop offset="0%" stop-color="#F8C878" stop-opacity="${(haloOp * 0.55).toFixed(3)}"/>
        <stop offset="100%" stop-color="#F8C878" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="flameouter" cx="50%" cy="58%" r="50%">
        <stop offset="0%" stop-color="#F8A838" stop-opacity="0.95"/>
        <stop offset="70%" stop-color="#E87818" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#E87818" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="flamecore" cx="50%" cy="62%" r="50%">
        <stop offset="0%" stop-color="#FFF8E0" stop-opacity="1"/>
        <stop offset="60%" stop-color="#FFE9A8" stop-opacity="0.7"/>
        <stop offset="100%" stop-color="#FFE9A8" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft4" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="4"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#floor)"/>
    <rect width="${W}" height="${H}" fill="url(#halo)"/>
    <!-- 멀리 흐릿한 온기 점 — 다른 촛불의 보케 -->
    <circle cx="${(W * 0.30).toFixed(0)}" cy="${(H * 0.70).toFixed(0)}" r="14" fill="#E8A35C" opacity="${(0.10 + 0.02 * f).toFixed(3)}" filter="url(#soft4)"/>
    <circle cx="${(W * 0.76).toFixed(0)}" cy="${(H * 0.74).toFixed(0)}" r="10" fill="#E8A35C" opacity="${(0.08 - 0.02 * f).toFixed(3)}" filter="url(#soft4)"/>
    <!-- 불꽃 — 물방울형(아래 둥글고 위로 갈수록 뾰족), 키가 일렁임 -->
    <g filter="url(#soft4)">
      <ellipse cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" rx="17" ry="${(38 * stretch).toFixed(1)}" fill="url(#flameouter)"/>
      <ellipse cx="${fx.toFixed(1)}" cy="${(fy + 6).toFixed(1)}" rx="8.5" ry="${(20 * stretch).toFixed(1)}" fill="url(#flamecore)"/>
    </g>
  </svg>`;
}

// ── 빛가루 — 빛 입자가 아주 천천히 가라앉는다 (낙하+페이드, 깜빡임 아님) ────────
// 입자가 너무 작고 희미하면 빈 화면처럼 보인다(1차 시도) → 또렷한 입자 34개 +
// 크고 흐릿한 광점 6개를 섞어 원근감을 준다.
const GRACE_PARTICLES = (() => {
  const rnd = mulberry32(101);
  const small = Array.from({ length: 34 }, () => ({
    x: rnd() * W,
    y0: rnd() * H,
    fall: 80 + rnd() * 60,        // 4초 동안 내려가는 거리(px) — 천천히
    drift: 8 + rnd() * 10,        // 좌우 미세 드리프트
    r: 2.2 + rnd() * 2.6,
    phase: rnd(),                 // 진행도 오프셋 (0..1)
    op: 0.55 + rnd() * 0.35,
  }));
  const big = Array.from({ length: 6 }, () => ({
    x: rnd() * W,
    y0: rnd() * H,
    fall: 60 + rnd() * 40,        // 큰 광점은 더 느리게 (가까이 떠 있는 느낌)
    drift: 12 + rnd() * 10,
    r: 7 + rnd() * 6,
    phase: rnd(),
    op: 0.22 + rnd() * 0.15,
  }));
  // 초점 밖 초대형 보케 원반 — 레퍼런스(보케 사진)의 "겹치는 큰 빛 원반" 깊이감
  const xl = Array.from({ length: 4 }, () => ({
    x: rnd() * W,
    y0: rnd() * H,
    fall: 40 + rnd() * 25,        // 제일 가까이 = 제일 느리게
    drift: 14 + rnd() * 8,
    r: 26 + rnd() * 22,
    phase: rnd(),
    op: 0.09 + rnd() * 0.07,
  }));
  return [...small, ...big, ...xl];
})();
function graceFrame(t) {
  const p01 = t / (2 * Math.PI); // 진행도 0..1
  const dots = GRACE_PARTICLES.map((g) => {
    const p = (p01 + g.phase) % 1;          // 입자별 수명 진행도
    const y = g.y0 + p * g.fall;
    const x = g.x + g.drift * Math.sin(2 * Math.PI * p + g.phase * 6.28);
    const op = g.op * Math.sin(Math.PI * p); // 스르륵 나타났다 사라짐 → 루프 안 보임
    if (op < 0.02) return '';
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${g.r.toFixed(1)}" fill="url(#mote)" opacity="${op.toFixed(3)}"/>`;
  }).join('\n');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#181030"/>
        <stop offset="100%" stop-color="#0E0A1E"/>
      </linearGradient>
      <radialGradient id="heaven" cx="50%" cy="-5%" r="65%">
        <stop offset="0%" stop-color="#C8B0F0" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#C8B0F0" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="mote" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#F8ECC0" stop-opacity="1"/>
        <stop offset="55%" stop-color="#F0D890" stop-opacity="0.55"/>
        <stop offset="100%" stop-color="#E8C878" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#heaven)"/>
    ${dots}
  </svg>`;
}

// ── 오로라 — 레퍼런스(오로라 사진) 기반 v2 ───────────────────────────────────
// 실제 오로라 = 가로 리본이 아니라 "세로 광주(光柱) 커튼": 지평선 근처가 초록으로
// 밝고, 위로 갈수록 보라로 옅어지는 수직 기둥들이 나란히 서서 일렁인다.
// 하늘은 깊은 보라·남색, 별은 고정(깜빡임 금지), 바닥엔 검은 능선 실루엣.
const AURORA_STARS = (() => {
  const rnd = mulberry32(111);
  return Array.from({ length: 34 }, () => ({
    x: rnd() * W, y: rnd() * H * 0.55, r: 0.8 + rnd() * 0.9, op: 0.12 + rnd() * 0.2,
  }));
})();
const AURORA_PILLARS = (() => {
  const rnd = mulberry32(112);
  return Array.from({ length: 15 }, (_, i) => ({
    x: W * (0.04 + (0.92 * i) / 14) + (rnd() - 0.5) * 40,
    baseY: H * 0.62 - 16 * Math.sin((i / 14) * Math.PI * 2 + 1.1), // 밑변이 살짝 굽이침
    len: 170 + rnd() * 250,
    w: 26 + rnd() * 36,
    tilt: -0.10 + (rnd() - 0.5) * 0.08,   // 거의 평행한 미세 기울기 — 커튼 주름
    phase: rnd() * Math.PI * 2,
    opBase: 0.22 + rnd() * 0.20,
  }));
})();
const AURORA_GROUND = (() => {
  // 바닥 검은 능선 (고정)
  const N = 24;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (W * i) / N;
    const u = (i / N) * Math.PI * 2;
    const y = H * 0.88 - 22 * (0.6 * Math.sin(u * 1.3 + 0.8) + 0.4 * Math.sin(u * 2.7 + 2.2));
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`;
})();
function auroraFrame(t) {
  const stars = AURORA_STARS.map(
    (s) => `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="${s.r.toFixed(1)}" fill="#C8D8E8" opacity="${s.op.toFixed(2)}"/>`
  ).join('\n');
  const pillars = AURORA_PILLARS.map((p) => {
    const len = p.len * (1 + 0.10 * Math.sin(t + p.phase));        // 기둥 키가 일렁
    const op = Math.max(0.06, p.opBase + 0.14 * Math.sin(t + p.phase * 1.6)); // 커튼 주름이 밝아졌다 어두워졌다
    const x = p.x + 7 * Math.sin(t + p.phase * 0.7);
    const dx = Math.sin(p.tilt) * len;
    const topY = p.baseY - Math.cos(p.tilt) * len;
    const wTop = p.w * 0.55;
    return `<polygon points="${(x - p.w / 2).toFixed(1)},${p.baseY.toFixed(1)} ${(x + p.w / 2).toFixed(1)},${p.baseY.toFixed(1)} ${(x + dx + wTop / 2).toFixed(1)},${topY.toFixed(1)} ${(x + dx - wTop / 2).toFixed(1)},${topY.toFixed(1)}" fill="url(#pillar)" opacity="${op.toFixed(3)}"/>`;
  }).join('\n');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#0C0820"/>
        <stop offset="55%" stop-color="#141033"/>
        <stop offset="100%" stop-color="#0A0E22"/>
      </linearGradient>
      <!-- 광주: 아래 초록(밝음) → 중간 틸 → 위 보라(소멸) — 실제 오로라의 수직 색 구배 -->
      <linearGradient id="pillar" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stop-color="#8FE89A" stop-opacity="0.9"/>
        <stop offset="40%" stop-color="#4FD8B8" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#9A6AE8" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="horizonGlow" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#7FE89A" stop-opacity="0"/>
        <stop offset="100%" stop-color="#7FE89A" stop-opacity="${(0.16 + 0.04 * Math.sin(t)).toFixed(3)}"/>
      </linearGradient>
      <filter id="soft9" x="-25%" y="-25%" width="150%" height="150%">
        <feGaussianBlur stdDeviation="9"/>
      </filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${stars}
    <rect y="${(H * 0.38).toFixed(0)}" width="${W}" height="${(H * 0.26).toFixed(0)}" fill="url(#horizonGlow)"/>
    <g filter="url(#soft9)">${pillars}</g>
    <path d="${AURORA_GROUND}" fill="#04060C"/>
  </svg>`;
}

// ── 십자가빛 — 레퍼런스(노을 역광 실루엣 사진) 기반 v2 ─────────────────────────
// 실제 역광 풍경 = 하늘이 주인공: 위는 어두운 청남색 → 아래로 갈수록 따뜻한 호박색
// 노을 그라데이션. 지는 해의 글로우가 지평선 근처에 있고, 십자가는 언덕 위 검은 실루엣.
const CROSS_X = W * 0.30;
const CROSS_HILL = (() => {
  // 십자가가 선 언덕 실루엣 (고정) — 십자가 위치에서 봉긋하고 양옆으로 낮아진다
  const N = 28;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (W * i) / N;
    const d = (x - CROSS_X) / W;
    const y = H * 0.86 - 52 * Math.exp(-d * d * 22) - 14 * Math.sin((i / N) * Math.PI * 2 * 1.4 + 0.9);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return { path: `M 0,${H} L ${pts.join(' L ')} L ${W},${H} Z`, topAtCross: H * 0.86 - 52 };
})();
function crosslightFrame(t) {
  const sunOp = 0.55 + 0.05 * Math.sin(t); // 해 글로우 — 크기 고정, 밝기만 호흡
  const hillTop = CROSS_HILL.topAtCross;
  // 십자가 실루엣 — 언덕 꼭대기에 서 있다
  const vW = 24, vH = 215;
  const baseY = hillTop + 6;
  const topY = baseY - vH;
  const hW = 124, hH = 24, hY = topY + 52;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- 노을 하늘: 어두운 청남색 → 장미빛 → 호박색 → 지평선의 밝은 금빛 -->
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1C2440"/>
        <stop offset="42%" stop-color="#5C4054"/>
        <stop offset="68%" stop-color="#A85C3E"/>
        <stop offset="86%" stop-color="#E89048"/>
        <stop offset="100%" stop-color="#F4B05C"/>
      </linearGradient>
      <radialGradient id="sun" gradientUnits="userSpaceOnUse" cx="${CROSS_X.toFixed(0)}" cy="${(H * 0.80).toFixed(0)}" r="300">
        <stop offset="0%" stop-color="#FFE0A0" stop-opacity="${sunOp.toFixed(3)}"/>
        <stop offset="45%" stop-color="#F8B868" stop-opacity="${(sunOp * 0.45).toFixed(3)}"/>
        <stop offset="100%" stop-color="#F8B868" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#sun)"/>
    <!-- 얇은 노을 구름 띠 — 아주 천천히 흐른다 -->
    <ellipse cx="${(W * 0.62 + 14 * Math.sin(t)).toFixed(1)}" cy="${(H * 0.46).toFixed(0)}" rx="300" ry="11" fill="#3A2A3E" opacity="0.45"/>
    <ellipse cx="${(W * 0.40 + 18 * Math.sin(t + 2.2)).toFixed(1)}" cy="${(H * 0.56).toFixed(0)}" rx="380" ry="9" fill="#4A2E34" opacity="0.40"/>
    <ellipse cx="${(W * 0.74 + 12 * Math.sin(t + 4.1)).toFixed(1)}" cy="${(H * 0.66).toFixed(0)}" rx="260" ry="7" fill="#6A3A2A" opacity="0.35"/>
    <path d="${CROSS_HILL.path}" fill="#140C08"/>
    <g fill="#120B07">
      <rect x="${(CROSS_X - vW / 2).toFixed(1)}" y="${topY.toFixed(1)}" width="${vW}" height="${vH}" rx="2"/>
      <rect x="${(CROSS_X - hW / 2).toFixed(1)}" y="${hY.toFixed(1)}" width="${hW}" height="${hH}" rx="2"/>
    </g>
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 생성 — 테마별 프레임 함수 + GIF 색수(복합 그라데이션은 200색)
// ═══════════════════════════════════════════════════════════════════════════
const THEME_DEFS = {
  light: { frame: lightFrame, colors: 160 },
  ...Object.fromEntries(
    Object.entries(GLOW_THEMES).map(([k, cfg]) => [k, { frame: makeGlowFrame(cfg), colors: 160 }])
  ),
  wave: { frame: waveFrame, colors: 200 },
  mist: { frame: mistFrame, colors: 200 },
  candle: { frame: candleFrame, colors: 200 },
  grace: { frame: graceFrame, colors: 200 },
  aurora: { frame: auroraFrame, colors: 200 },
  crosslight: { frame: crosslightFrame, colors: 200 },
};

for (const [name, { frame: frameFn, colors }] of Object.entries(THEME_DEFS)) {
  const tmpDir = `/tmp/holy-anim-${name}`;
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // 1) 프레임 PNG 생성 — t를 한 바퀴(2π) 돌려 끊김 없는 루프
  for (let i = 0; i < FRAMES; i++) {
    const t = (2 * Math.PI * i) / FRAMES;
    await sharp(Buffer.from(frameFn(t))).png().toFile(join(tmpDir, `f${String(i).padStart(2, '0')}.png`));
  }

  // 2) ffmpeg 팔레트 2패스 — GIF 256색 한계에서 그라데이션 밴딩 최소화
  const out = join(OUT, `pptx-bg-${name}.gif`);
  execFileSync('ffmpeg', [
    '-y', '-framerate', String(FPS), '-i', join(tmpDir, 'f%02d.png'),
    '-vf', `split[a][b];[a]palettegen=max_colors=${colors}:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a`,
    '-loop', '0',
    out,
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  rmSync(tmpDir, { recursive: true, force: true });
  console.log('생성 완료:', out, '→', (statSync(out).size / 1048576).toFixed(2), 'MB');
}
