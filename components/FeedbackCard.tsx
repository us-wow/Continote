'use client';

// 베타 피드백 카드 — 첫 다운로드/공유 전에 '게이트'로 한 번 뜬다(required 모드).
// 앱에 실제 도움 되는 빠른 선택지(가사 정확도·난이도)를 복수 선택받고, 한 줄 의견은 선택.
// Supabase beta_feedback 테이블에 저장한다. 익명도 가능(로그인 안 한 사람도 남김).

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { FEEDBACK_SURVEY_URL } from '@/lib/beta';

// 베타에 실제 도움 되는 빠른 선택지(복수 선택 가능). 정확도·난이도 신호를 모은다.
const FB_CHIPS = ['가사가 정확했어요', '오타가 좀 있었어요', '만들기 쉬웠어요', '좀 헷갈렸어요'];
// 부정 신호 칩 — sentiment(up/down) 추정과 색(틸/주황) 구분에 쓴다.
const FB_NEGATIVE = ['오타가 좀 있었어요', '좀 헷갈렸어요'];

export default function FeedbackCard({
  open,
  onClose,
  userId,
  required = false,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
  required?: boolean;       // true면 '다운로드 게이트' 모드 — 최소 1개 선택해야 통과
  onSubmitted?: () => void; // 게이트 모드에서 제출 성공 시 호출(부모가 다운로드 진행)
}) {
  const [picks, setPicks] = useState<string[]>([]); // 고른 칩 목록(복수 선택)
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  // 칩 토글 — 이미 골랐으면 빼고, 아니면 더한다.
  const toggle = (chip: string) =>
    setPicks((cur) => (cur.includes(chip) ? cur.filter((c) => c !== chip) : [...cur, chip]));

  const submit = async () => {
    // 게이트 모드: 최소 하나는 골라야 통과
    if (required && picks.length === 0) return;
    // 일반 모드: 아무것도 없으면 그냥 닫기
    if (!required && picks.length === 0 && !message.trim()) { onClose(); return; }

    setSending(true);
    // ponytail: 칩 + 자유의견을 한 message로 합쳐 저장(컬럼 추가 없이). 분석 세분화 필요해지면 tags 컬럼 분리.
    const combined = [picks.join(', '), message.trim()].filter(Boolean).join(' — ');
    // 부정 칩만 있으면 down, 긍정 칩만 있으면 up, 섞이면 null로 둔다(세부는 message에 그대로 남음).
    const hasNeg = picks.some((p) => FB_NEGATIVE.includes(p));
    const hasPos = picks.some((p) => !FB_NEGATIVE.includes(p));
    const sentiment = hasNeg && !hasPos ? 'down' : hasPos && !hasNeg ? 'up' : null;
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('beta_feedback').insert({
          sentiment,
          message: combined || null,
          user_id: userId,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        });
      }
    } catch {
      // 피드백 실패는 사용자 흐름을 막지 않는다 — 조용히 넘어간다.
    }
    setSending(false);
    if (required) {
      // 게이트 모드: 감사 화면 생략하고 바로 부모에게 알려 다운로드를 진행시킨다.
      onSubmitted?.();
      return;
    }
    setDone(true);
    // 감사 메시지를 잠깐 보여주고 닫기
    setTimeout(onClose, 1600);
  };

  return (
    <div className="fb-wrap" role="dialog" aria-label="베타 피드백">
      <div className="fb-card">
        {done ? (
          <div className="fb-thanks">
            고마워요! 의견이 콘티노트를 더 좋게 만들어요 🙏
          </div>
        ) : (
          <>
            <button type="button" className="fb-x" onClick={onClose} aria-label="닫기">×</button>
            <div className="fb-title">{required ? '다운로드 전에, 방금 만든 PPT 어땠어요?' : '방금 만든 PPT, 어땠어요?'}</div>
            <div className="fb-sub">{required ? '해당되는 걸 눌러주세요 (여러 개 OK). 하나만 골라도 바로 다운로드돼요.' : '베타 기간이에요. 해당되는 걸 눌러주세요.'}</div>

            <div className="fb-chips">
              {FB_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`fb-chip ${picks.includes(chip) ? 'is-on' : ''} ${FB_NEGATIVE.includes(chip) ? 'neg' : 'pos'}`}
                  onClick={() => toggle(chip)}
                  aria-pressed={picks.includes(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="fb-input"
              placeholder="더 하고 싶은 말 (선택)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={300}
            />

            <button
              type="button"
              className="btn btn-primary btn-sm fb-send"
              onClick={submit}
              disabled={sending || (required && picks.length === 0)}
            >
              {sending ? '보내는 중…' : required ? '보내고 다운로드' : '보내기'}
            </button>

            {FEEDBACK_SURVEY_URL && (
              <a className="fb-survey" href={FEEDBACK_SURVEY_URL} target="_blank" rel="noopener noreferrer">
                자세한 의견 남기기 (1분 설문) →
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
