// SSOT(BACKGROUNDS) 파생 맵이 기존 리터럴 맵과 100% 동일한지 자동 대조한다.
// 통과하면 pptx.ts / slide-visual.ts를 파생 방식으로 바꿔도 동작이 안 변한다는 증거.
import { BACKGROUNDS } from '../lib/bg-catalog.ts';
import { PPT_THEME_LABELS, THEME_CONFIG } from '../lib/pptx.ts';
import { THEME_BG, THEME_FG, THEME_OVERLAY } from '../lib/slide-visual.ts';

let fail = 0;
// 키 순서는 무관(Record 조회는 순서를 안 탐) → 정렬해서 값만 대조.
const norm = (v) => (v && typeof v === 'object' && !Array.isArray(v))
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v;
const eq = (name, a, b) => {
  const sa = JSON.stringify(norm(a)), sb = JSON.stringify(norm(b));
  if (sa !== sb) { fail++; console.error(`✗ ${name}\n   기존: ${sa}\n   파생: ${sb}`); }
};

// ── 파생 맵 만들기 (앞으로 pptx.ts / slide-visual.ts가 쓸 로직과 동일) ──
const labels = {}, config = {}, bg = {}, fg = {}, overlay = {};
for (const d of BACKGROUNDS) {
  labels[d.key] = d.label;
  if (d.solid) {
    config[d.key] = { kind: 'solid', bg: d.solid.bg, text: d.solid.text };
    bg[d.key] = '#' + d.solid.bg;
    fg[d.key] = '#' + d.solid.text;
  } else {
    const im = d.image;
    const c = { kind: 'image', path: im.path, text: im.text };
    if (!im.overlay) c.overlay = false;        // 오버레이 없는 이미지는 명시적 false (기존과 동일)
    if (d.animated) c.animated = true;
    if (im.fallback) c.fallback = im.fallback;
    config[d.key] = c;
    bg[d.key] = im.path === '' ? im.previewColor                       // custom = 색만
      : `url('${im.path}') center/cover, ${im.previewColor}`;
    fg[d.key] = '#' + im.text;
    if (im.overlay) overlay[d.key] = im.overlay;
  }
}

// ── 대조 ──
// custom의 기존 THEME_CONFIG는 { overlay: true }로 명시돼 있어 키 순서가 다를 수 있으니 테마별로 비교.
for (const k of Object.keys(THEME_CONFIG)) {
  const old = { ...THEME_CONFIG[k] };
  // 기존 custom은 overlay:true 명시 → 파생은 생략(둘 다 useOverlay=true로 동작). 비교 위해 정규화.
  if (old.overlay === true) delete old.overlay;
  eq(`THEME_CONFIG.${k}`, old, config[k]);
}
eq('THEME_CONFIG keys', Object.keys(THEME_CONFIG).sort(), Object.keys(config).sort());
eq('PPT_THEME_LABELS', PPT_THEME_LABELS, labels);
eq('THEME_BG', THEME_BG, bg);
eq('THEME_FG', THEME_FG, fg);
eq('THEME_OVERLAY', THEME_OVERLAY, overlay);

if (fail === 0) console.log('✅ 모든 파생 맵이 기존 리터럴과 동일 — 안전하게 교체 가능');
else { console.error(`\n❌ 불일치 ${fail}건 — 교체 중단`); process.exit(1); }
