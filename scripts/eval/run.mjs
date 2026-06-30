// 악보 → 가사 추출 "대조 실험대".
// 프로덕션(/api/analyze)·Supabase 전혀 안 건드린다. 완전히 독립 실행되는 검증용 스크립트.
//
// 목적: 같은 샘플 악보로 여러 "버전(variant)"을 돌려, 손으로 적은 정답(.txt)과
//      나란히 비교한다. 검증되기 전엔 프로덕션을 절대 안 바꾼다는 원칙을 위한 도구.
//
// 사용법:
//   1) scripts/eval/samples/ 에 악보 이미지 + 같은 이름의 .txt(정답 가사)를 넣는다.
//        예) 함께지어져가네.png  +  함께지어져가네.txt
//      .txt 형식: 묶음(절/후렴 등)은 빈 줄로 구분, 각 줄은 가사 한 줄.
//   2) node scripts/eval/run.mjs
//   3) scripts/eval/results/report.md 를 연다. (콘솔에도 요약 표가 찍힘)
//
// 새 버전 추가: 아래 VARIANTS 배열에 한 줄 추가하면 끝. (예: Pro 모델, 자가검증 2패스)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES = path.join(DIR, 'samples');
const RESULTS = path.join(DIR, 'results');
const ROOT = path.resolve(DIR, '..', '..');

// 프로덕션과 "완전히 같은" 프롬프트를 쓴다 → current 버전이 진짜 기준선이 되도록.
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(ROOT, 'lib', 'prompts', 'score-analysis-rules.md'),
  'utf8'
);
const ACCURACY = '가사를 한 글자도 빠뜨리지 말고 신중히 추출하세요.'; // route.ts와 동일

// .env.local 에서 GEMINI_API_KEY 읽기 (Next 없이 단독 실행하므로 직접 파싱)
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = env.match(/^GEMINI_API_KEY=(.*)$/m);
  if (!m) throw new Error('GEMINI_API_KEY 없음 — .env.local 확인');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

// ── 이미지 전처리(버전별) ──────────────────────────────────────────────
// 원본 그대로 보내기 (= 지금 프로덕션 동작)
const passthrough = (buf, mime) => ({ data: buf.toString('base64'), mimeType: mime });

// 맥 내장 sips로 긴 변을 maxPx로 줄인다. 의존성 0.
// 프로덕션은 브라우저 canvas로 줄이게 되지만, 결과 픽셀은 동일하므로 비용절감안 검증의 프록시로 충분.
function downscale(maxPx) {
  return (buf, mime, name) => {
    const tmp = path.join(RESULTS, `_tmp_${name}`);
    fs.writeFileSync(tmp, buf);
    execFileSync('sips', ['-Z', String(maxPx), tmp]); // -Z: 비율 유지, 긴 변 기준
    const out = fs.readFileSync(tmp);
    fs.unlinkSync(tmp);
    return { data: out.toString('base64'), mimeType: mime };
  };
}

// 비교할 버전들. 지금은 "현재(기준선)" vs "다운스케일(비용절감안)" 둘로 시작.
// 품질이 부족하면 여기 'pro'·'selfcheck' 추가해서 같은 표에서 비교한다.
const VARIANTS = [
  { name: 'current',  model: 'gemini-2.5-flash', temp: 0.05, pre: passthrough },
  { name: 'down1800', model: 'gemini-2.5-flash', temp: 0.05, pre: downscale(1800) },
];

// ── Gemini 호출 (route.ts와 동일 구성) ────────────────────────────────
const genAI = new GoogleGenerativeAI(loadKey());
async function extract(variant, parts) {
  const model = genAI.getGenerativeModel({
    model: variant.model,
    generationConfig: { responseMimeType: 'application/json', temperature: variant.temp },
    systemInstruction: SYSTEM_PROMPT,
  });
  const res = await model.generateContent({ contents: [{ role: 'user', parts }] });
  return res.response.text();
}

// route.ts의 extractJSON 동일 — 코드펜스/중괄호 사이만 잘라낸다
function extractJSON(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  return a !== -1 && b > a ? text.slice(a, b + 1) : text.trim();
}

// ── 채점 ──────────────────────────────────────────────────────────────
// 줄 정규화: 앞뒤공백 제거 + 연속공백 1칸 + 빈 줄 제거 (정답·추출 양쪽 동일 처리)
const normLines = (t) =>
  t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);

// 레벤슈타인(글자 단위 편집거리) — 글자일치율 계산용. 의존성 없이 직접 구현.
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function score(expText, gotText) {
  const exp = normLines(expText), got = normLines(gotText);
  const ef = exp.join('\n'), gf = got.join('\n');
  const max = Math.max(ef.length, gf.length);
  // 글자일치: 전체 가사 텍스트의 글자 단위 유사도 (OCR 오인 감지)
  const charSim = max ? 1 - lev(ef, gf) / max : 1;
  const gotSet = new Set(got), expSet = new Set(exp);
  // recall: 정답 줄 중 추출이 맞춘 비율 (절 빠짐·절 섞임이면 떨어짐)
  const recall = exp.length ? exp.filter((l) => gotSet.has(l)).length / exp.length : 0;
  // precision: 추출 줄 중 정답에 있는 비율 (헛것·중복 생성이면 떨어짐)
  const precision = got.length ? got.filter((l) => expSet.has(l)).length / got.length : 0;
  return { charSim, recall, precision };
}

const mimeOf = (f) => {
  const e = f.toLowerCase().split('.').pop();
  return e === 'png' ? 'image/png' : e === 'webp' ? 'image/webp' : 'image/jpeg';
};
const pct = (x) => `${Math.round(x * 100)}%`;

// ── 실행 ──────────────────────────────────────────────────────────────
fs.mkdirSync(RESULTS, { recursive: true });
const files = fs.existsSync(SAMPLES) ? fs.readdirSync(SAMPLES) : [];
const images = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
if (!images.length) {
  console.log('샘플 없음 → scripts/eval/samples/ 에 이미지 + 같은 이름 .txt(정답)를 넣어줘.');
  process.exit(0);
}

const rows = [];
for (const img of images) {
  const base = img.replace(/\.[^.]+$/, '');
  const txtPath = path.join(SAMPLES, `${base}.txt`);
  if (!fs.existsSync(txtPath)) {
    console.warn(`정답 없음 → 건너뜀: ${img}  (필요: ${base}.txt)`);
    continue;
  }
  const expText = fs.readFileSync(txtPath, 'utf8');
  const expBlocks = expText.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean).length;
  const buf = fs.readFileSync(path.join(SAMPLES, img));
  const mime = mimeOf(img);

  for (const v of VARIANTS) {
    process.stdout.write(`▶ ${base} / ${v.name} ... `);
    let gotText = '', gotBlocks = 0, err = null;
    try {
      const { data, mimeType } = v.pre(buf, mime, img);
      const parts = [
        { inlineData: { data, mimeType } },
        { text: `이 악보를 분석해 JSON으로만 응답하세요. ${ACCURACY}` },
      ];
      const parsed = JSON.parse(extractJSON(await extract(v, parts)));
      const song = (parsed.songs && parsed.songs[0]) || { sections: [] };
      const secs = (song.sections || [])
        .map((s) => (typeof s === 'string' ? s : (s && s.text) || ''))
        .map((s) => s.trim())
        .filter(Boolean);
      gotBlocks = secs.length;
      gotText = secs.join('\n\n');
      fs.writeFileSync(path.join(RESULTS, `${base}__${v.name}.txt`), gotText);
    } catch (e) {
      err = e.message;
    }
    const sc = err ? null : score(expText, gotText);
    rows.push({ song: base, variant: v.name, expBlocks, gotBlocks, err, gotText, ...sc });
    console.log(err ? `오류: ${err}` : `글자일치 ${pct(sc.charSim)}`);
  }
}

// ── 리포트 ────────────────────────────────────────────────────────────
let md = `# 악보 → 가사 추출 대조 리포트\n\n비교 버전: ${VARIANTS.map((v) => v.name).join(', ')}\n\n## 요약\n\n`;
md += `| 곡 | 버전 | 글자일치 | 줄 recall | 줄 precision | 묶음(정답→추출) | 오류 |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  md += `| ${r.song} | ${r.variant} | ${r.err ? '-' : pct(r.charSim)} | ${r.err ? '-' : pct(r.recall)} | ${r.err ? '-' : pct(r.precision)} | ${r.expBlocks}→${r.gotBlocks} | ${r.err || ''} |\n`;
}
md +=
  `\n> **글자일치** = 정답과 추출 가사의 글자 단위 유사도(OCR 오인 잡음).\n` +
  `> **줄 recall** = 정답 줄 중 추출이 맞춘 비율(절 빠짐·절 섞임이면 하락).\n` +
  `> **줄 precision** = 추출 줄 중 정답에 있는 비율(헛것·중복 생성이면 하락).\n` +
  `> **묶음** = 절/후렴 개수(정답→추출).\n`;

md += `\n---\n\n## 상세 (정답 vs 추출)\n`;
for (const s of [...new Set(rows.map((r) => r.song))]) {
  md += `\n### ${s}\n\n**정답**\n\n\`\`\`\n${fs.readFileSync(path.join(SAMPLES, `${s}.txt`), 'utf8').trim()}\n\`\`\`\n`;
  for (const r of rows.filter((r) => r.song === s)) {
    md += `\n**${r.variant}** ${r.err ? `(오류: ${r.err})` : `(글자일치 ${pct(r.charSim)})`}\n\n\`\`\`\n${(r.gotText || '').trim()}\n\`\`\`\n`;
  }
}
fs.writeFileSync(path.join(RESULTS, 'report.md'), md);
console.log(`\n리포트 → scripts/eval/results/report.md`);
