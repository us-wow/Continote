// 인접한 "거의 같은" 가사 묶음을 제거한다.
//
// 잡는 것: 1./2. ending 등에서 AI가 같은 절을 한 번 더 통째로 출력하는 "에코 버그".
//   (대조 실험에서 '마지막 날에'가 절을 두 번 토해내 글자정확도 58%로 추락 → 0원에 교정)
//
// 안 건드리는 것: 악보에 실제로 여러 번 적힌 반복(점수 규칙 §3-3)을 날리면 안 되므로 보수적으로 —
//   · 인접한 쌍만   · 양쪽 다 2줄 이상인 묶음만   · 글자 유사도 0.9 이상일 때만 합친다.
//   1줄짜리 후렴 반복은 건드리지 않는다.
//
// ponytail: 드물게 "진짜 인접 반복"을 지울 수 있음(둘 다 사용자가 에디터에서 한 번에 되돌림).
//   거짓양성이 잦아지면 "삭제" 대신 "플래그 → 사용자 확인"으로 올리는 게 업그레이드 경로.

export type Section = { type: string; label: string; verseNum: number | null; text: string };

// 줄 정규화: 앞뒤공백 정리 + 연속공백 1칸 + 빈 줄 제거
function norm(t: string): string {
  return t.split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
}

// 글자 단위 편집거리(레벤슈타인)
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array<number>(n + 1);
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

// 0~1 유사도 (긴 쪽 기준이라 보수적)
function similar(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - lev(a, b) / max;
}

export function dropEchoedSections(sections: Section[]): Section[] {
  const out: Section[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    if (prev) {
      const a = norm(prev.text);
      const b = norm(s.text);
      const bothMultiline = a.includes('\n') && b.includes('\n');
      if (bothMultiline && similar(a, b) >= 0.9) {
        // 더 완전한(긴) 쪽을 남기고 중복은 버린다
        if (b.length > a.length) out[out.length - 1] = s;
        continue;
      }
    }
    out.push(s);
  }
  return out;
}
