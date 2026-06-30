// dropEchoedSections 동작 검증. 실행: npx tsx scripts/eval/test-dedup.ts
import assert from 'node:assert';
import { dropEchoedSections, type Section } from '../../lib/dedup-sections';

const s = (text: string): Section => ({ type: 'verse', label: '', verseNum: null, text });

// 1) 에코 버그: 거의 같은 4줄 묶음 둘 → 하나로 합쳐지고 더 완전한(긴) 쪽이 남는다
{
  const verseA =
    '마지막 날에 내가 나의 영으로\n모든 백성에게 부어 주리라\n자녀들은 예언할 것이요 청년들은 환상을 보고\n아비들은 꿈을 꾸리라 주의 영 임하면';
  const verseB =
    '마지막 날에 내가 나의 영으로\n모든 백성에게 부어 주리라\n자녀들은 예언할 것이요 청년들은 환상을 보고\n아비들은 꿈을 꾸리라 면';
  const r = dropEchoedSections([s(verseA), s(verseB), s('성령이여 임하소서'), s('성령이여 우리에게 임하소서')]);
  assert.equal(r.length, 3, '에코 중복 제거 → 3묶음이어야');
  assert.equal(r[0].text, verseA, '더 완전한(긴) 절이 남아야');
}

// 2) 1줄짜리 반복(진짜 후렴 반복)은 보존 — 절대 지우면 안 됨
{
  const r = dropEchoedSections([s('주님만 의지해요'), s('주님만 의지해요'), s('예 주님')]);
  assert.equal(r.length, 3, '1줄 반복은 보존돼야');
}

// 3) 서로 다른 절은 합치지 않는다
{
  const v1 = '우리는 하나님의 자녀\n주 사랑 안에 우리 거할 때';
  const v2 = '우리는 주의 몸된 교회\n모든 지체가 하나 될 때';
  const r = dropEchoedSections([s(v1), s(v2)]);
  assert.equal(r.length, 2, '다른 절은 둘 다 남아야');
}

console.log('✓ dedup-sections 통과 — 에코제거 / 1줄반복보존 / 다른절보존');
