// 로컬 파일(이미지/PDF) 하나를 현재 프로덕션 설정(Gemini Flash)으로 추출해 결과를 보여준다.
// 채점 안 함(데모/확인용). 정답 대조 채점은 run.mjs. 프로덕션·DB 안 건드림.
// 사용: node scripts/eval/extract.mjs "<이미지 또는 PDF 경로>"
//   PDF면 pdftoppm로 페이지별 JPEG(≈프로덕션 pdf.js scale 1.5, 108dpi)로 변환 후 한 번에 보냄.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
const ACCURACY = '가사를 한 글자도 빠뜨리지 말고 신중히 추출하세요.';
const SYSTEM_PROMPT = fs.readFileSync(path.join(ROOT, 'lib', 'prompts', 'score-analysis-rules.md'), 'utf8');

const file = process.argv[2];
if (!file) { console.error('사용: node scripts/eval/extract.mjs "<이미지 또는 PDF 경로>"'); process.exit(1); }
if (!fs.existsSync(file)) { console.error('파일 없음:', file); process.exit(1); }

// 페이지 "파일 경로" 준비 (PDF면 페이지별 JPEG, 이미지면 그 파일)
let pagePaths = [];
let tmpDir = null;
if (/\.pdf$/i.test(file)) {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'contipdf-'));
  execFileSync('pdftoppm', ['-jpeg', '-jpegopt', 'quality=85', '-r', '108', file, path.join(tmpDir, 'page')]);
  pagePaths = fs.readdirSync(tmpDir).filter((f) => /\.jpg$/i.test(f)).sort().map((f) => path.join(tmpDir, f));
  console.log(`PDF ${pagePaths.length}페이지 변환됨`);
} else {
  pagePaths = [file];
}
const b64 = (p) => fs.readFileSync(p).toString('base64');

const key = process.env.GEMINI_API_KEY || (() => {
  const m = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').match(/^GEMINI_API_KEY=(.*)$/m);
  if (!m) throw new Error('GEMINI_API_KEY 없음'); return m[1].trim().replace(/^["']|["']$/g, '');
})();
const model = new GoogleGenerativeAI(key).getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: { responseMimeType: 'application/json', temperature: 0.05 },
  systemInstruction: SYSTEM_PROMPT,
});
const parts = [
  ...pagePaths.map((p) => ({ inlineData: { data: b64(p), mimeType: 'image/jpeg' } })),
  { text: `이 악보를 분석해 JSON으로만 응답하세요. ${ACCURACY}` },
];

const raw = (await model.generateContent({ contents: [{ role: 'user', parts }] })).response.text();
if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });

const f = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
const jsonStr = f ? f[1].trim() : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
let parsed;
try { parsed = JSON.parse(jsonStr); } catch { console.error('JSON 파싱 실패:\n', raw); process.exit(1); }
for (const song of parsed.songs || []) {
  console.log(`\n━━━ ${song.title || '(제목없음)'} ━━━`);
  (song.sections || []).forEach((s, i) => {
    const text = typeof s === 'string' ? s : (s && s.text) || '';
    console.log(`\n[묶음 ${i + 1}]\n${text.trim()}`);
  });
}
console.log(`\n총 ${(parsed.songs || []).length}곡 추출.`);
