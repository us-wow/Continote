// 콘티노트 마스코트(병아리) 4포즈 자동 생성 스크립트
// Replicate Flux 1.1 Pro 사용 — 새벽로파이 파이프라인과 동일한 모델
//
// 실행:
//   node scripts/generate-mascot.js
//
// 결과:
//   public/mascot/idle.png       — 빈 상태용
//   public/mascot/listening.png  — 추출 중(로딩) 상태용
//   public/mascot/reading.png    — 분석 중 상태용
//   public/mascot/done.png       — 완료 상태용
//
// 비용: 한 컷당 약 $0.04, 총 4컷 = 약 $0.16 (200원 정도)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// .env.local 직접 파싱 (별도 패키지 없이 가볍게)
// 이유: 작은 스크립트에 dotenv 패키지를 추가하는 건 과함
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = Object.fromEntries(
  envText
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const TOKEN = env.REPLICATE_API_TOKEN;
if (!TOKEN) {
  console.error('REPLICATE_API_TOKEN이 .env.local에 없음');
  process.exit(1);
}

// Flux 1.1 Pro 모델 엔드포인트 (Replicate가 권장하는 직접 호출 URL)
const PREDICT_URL =
  'https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions';

// 모든 포즈에 공통으로 들어가는 캐릭터 정체성 묘사
// 변경 X — 이게 흔들리면 4컷 캐릭터가 따로 놀게 됨
const CHARACTER_BASE = `A charming Korean app mascot character: a small round baby chick with fluffy butter-yellow body, big simple round eyes with a single tiny white highlight, small triangular beak, soft pink dot cheeks, wearing oversized over-ear headphones in dusty terracotta color (#C77A56). Modern app mascot illustration in the spirit of Line Friends Sally, KakaoFriends, Toss app characters, and Duolingo — a cohesive IP character designed for a digital product. Clean confident single-weight outline in warm dark brown, flat cel-shaded coloring with at most one soft shadow per shape, no airbrush gradients, no glossy highlights, no 3D rendering. Three-quarter view, full body, balanced upright proportions (head roughly 40% of total height). Pure white #FFFFFF background, isolated character only, no environment, no ground shadow, no glow, no halo. NOT chibi, NOT photoreal, NOT watercolor, NOT pencil sketch, NOT children's book illustration, NOT mobile-game render. Refined, warm, calm, intentional design.`;

// 4가지 포즈 — 각각 다른 UI 상태에 사용
const POSES = [
  {
    name: 'idle',
    description:
      'Standing calmly upright, holding a small folded sheet of music tucked under one wing, eyes open with a soft curious expression, small friendly closed-mouth smile, looking forward.',
  },
  {
    name: 'listening',
    description:
      'Eyes gently closed, head tilted slightly to one side as if absorbed in music, a few small terracotta-colored music notes floating softly near the headphones, peaceful contented expression, body relaxed.',
  },
  {
    name: 'reading',
    description:
      'Leaning forward slightly, both small wings holding up an open music sheet close to its face, focused attentive expression, eyes looking down at the sheet, small parted beak as if humming.',
  },
  {
    name: 'done',
    description:
      'Holding up a small finished page proudly with both wings, tiny proud smile, eyes slightly squinted with satisfaction, body in a confident upright pose.',
  },
];

// 캐릭터 일관성을 위해 같은 시드 사용 — Flux는 시드+프롬프트 조합으로 비슷한 특징 유지
// 마음에 안 드는 포즈만 SEED 값 바꿔서 재실행하면 됨
const SEED = 42;

// 1컷 생성 요청 → 폴링 → 다운로드까지 한 함수에서 처리
async function generatePose(pose) {
  // 이미 만들어진 파일은 건너뜀 — 중간에 멈춘 뒤 재실행할 때 유용
  // 다시 뽑고 싶으면 해당 PNG 직접 삭제 후 재실행
  const savePath = path.join(__dirname, '..', 'public', 'mascot', `${pose.name}.png`);
  if (fs.existsSync(savePath)) {
    console.log(`[${pose.name}] 이미 존재 — 건너뜀 (${savePath})`);
    return;
  }

  console.log(`\n[${pose.name}] 생성 시작...`);

  const fullPrompt = `${CHARACTER_BASE}\n\nPose: ${pose.description}`;

  const payload = {
    input: {
      prompt: fullPrompt,
      aspect_ratio: '1:1', // 정사각형 — UI에서 자유롭게 배치
      output_format: 'png',
      output_quality: 95,
      safety_tolerance: 2,
      prompt_upsampling: false, // 우리가 이미 다듬은 프롬프트라 자동 보정 끔
      seed: SEED,
    },
  };

  // Prefer: wait — 응답 완료까지 기다림(보통 10~20초)
  // 타임아웃은 90초로 여유있게 (Flux가 가끔 느림)
  // 429(rate limit) 만나면 retry_after 기다린 뒤 자동 재시도, 최대 5회
  let data;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(PREDICT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90000),
    });

    // Replicate가 일시적으로 막을 때 — 응답에 retry_after 있으면 그만큼 기다림
    if (response.status === 429) {
      let waitSec = 15;
      try {
        const j = await response.json();
        waitSec = parseInt(j.retry_after) || 15;
      } catch {}
      console.log(`[${pose.name}] Rate limit 429 — ${waitSec + 3}초 후 재시도 (${attempt + 1}/5)`);
      await new Promise((r) => setTimeout(r, (waitSec + 3) * 1000));
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`[${pose.name}] API 실패 ${response.status}: ${errText}`);
    }

    data = await response.json();
    break;
  }
  if (!data) throw new Error(`[${pose.name}] 재시도 5회 초과`);

  // Prefer: wait 안 통하고 아직 처리 중이면 폴링으로 폴백
  let output = data.output;
  if (!output && data.id) {
    output = await pollUntilDone(data.id, pose.name);
  }
  if (!output) {
    throw new Error(`[${pose.name}] 출력 없음`);
  }

  const imageUrl = Array.isArray(output) ? output[0] : output;
  await downloadImage(imageUrl, savePath);
  console.log(`[${pose.name}] 저장 완료 → ${savePath}`);
}

// 폴링: 5초 간격으로 status 확인. 최대 2분
async function pollUntilDone(predictionId, name) {
  const url = `https://api.replicate.com/v1/predictions/${predictionId}`;
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const data = await resp.json();
    console.log(`[${name}] 폴링 ${i + 1}회 — status: ${data.status}`);
    if (data.status === 'succeeded') return data.output;
    if (data.status === 'failed' || data.status === 'canceled') {
      throw new Error(`[${name}] 생성 실패: ${data.error}`);
    }
  }
  throw new Error(`[${name}] 폴링 타임아웃`);
}

// 이미지 URL → 로컬 파일 저장
async function downloadImage(url, savePath) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`다운로드 실패 ${resp.status}`);
  const buffer = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(savePath, buffer);
}

// 4컷 순차 처리
// 병렬도 가능하지만 Replicate rate limit 고려해 안전하게 순차
async function main() {
  console.log('=== 콘티노트 마스코트 생성 시작 ===');
  console.log(`모델: black-forest-labs/flux-1.1-pro`);
  console.log(`시드: ${SEED} (캐릭터 일관성용)`);
  console.log(`총 ${POSES.length}컷 생성 예정\n`);

  for (const pose of POSES) {
    try {
      await generatePose(pose);
    } catch (err) {
      console.error(`[${pose.name}] 에러:`, err.message);
    }
    // 포즈 간 3초 딜레이 — Replicate rate limit 회피
    // 마지막 포즈 뒤엔 굳이 안 기다려도 되지만 단순화 위해 항상 적용
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('\n=== 완료 ===');
  console.log('확인: ls public/mascot/');
}

main();
