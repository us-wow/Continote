'use client';

// 베타 피드백 카드 — 첫 PPT 다운로드 직후 화면 하단에 한 번만 뜬다.
// 좋아요/아쉬워요(직접 그린 SVG 엄지, 기본 이모지 아님) + 한 줄 의견을 받아
// Supabase beta_feedback 테이블에 저장한다. 익명도 가능(로그인 안 한 사람도 남김).

import { useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';
import { FEEDBACK_SURVEY_URL } from '@/lib/beta';

// ── 직접 그린 엄지 아이콘 (라인 스타일, 앱의 다른 아이콘과 톤 통일) ──
// down은 같은 path를 180도 뒤집어 재사용한다.
function ThumbIcon({ down = false, filled = false, size = 22 }: { down?: boolean; filled?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: down ? 'rotate(180deg)' : 'none' }}
    >
      {/* 손목(엄지 아래 네모) */}
      <path d="M7 10v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
      {/* 엄지 + 손바닥 */}
      <path d="M7 10l3.2-6.4a2 2 0 0 1 3.8 .9V8h4.3a2 2 0 0 1 2 2.4l-1.3 6.6a2 2 0 0 1-2 1.6H7" />
    </svg>
  );
}

export default function FeedbackCard({
  open,
  onClose,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  userId: string | null;
}) {
  const [sentiment, setSentiment] = useState<'up' | 'down' | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) return null;

  // 한 번 닫으면 다시 안 뜨도록 기록은 호출 측(onClose)에서 한다.
  const submit = async () => {
    if (!sentiment && !message.trim()) {
      // 아무것도 안 골랐으면 그냥 닫기
      onClose();
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabaseClient();
      if (supabase) {
        await supabase.from('beta_feedback').insert({
          sentiment,
          message: message.trim() || null,
          user_id: userId,
          ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
        });
      }
    } catch {
      // 피드백 실패는 사용자 흐름을 막지 않는다 — 조용히 넘어간다.
    }
    setSending(false);
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
            <div className="fb-title">방금 만든 PPT, 어땠어요?</div>
            <div className="fb-sub">베타 기간이에요. 한 마디면 개선에 큰 힘이 돼요.</div>

            <div className="fb-thumbs">
              <button
                type="button"
                className={`fb-thumb ${sentiment === 'up' ? 'is-on up' : ''}`}
                onClick={() => setSentiment('up')}
                aria-pressed={sentiment === 'up'}
              >
                <ThumbIcon filled={sentiment === 'up'} />
                <span>좋아요</span>
              </button>
              <button
                type="button"
                className={`fb-thumb ${sentiment === 'down' ? 'is-on down' : ''}`}
                onClick={() => setSentiment('down')}
                aria-pressed={sentiment === 'down'}
              >
                <ThumbIcon down filled={sentiment === 'down'} />
                <span>아쉬워요</span>
              </button>
            </div>

            <input
              type="text"
              className="fb-input"
              placeholder="불편했던 점·바라는 점 (선택)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={300}
            />

            <button type="button" className="btn btn-primary btn-sm fb-send" onClick={submit} disabled={sending}>
              {sending ? '보내는 중…' : '보내기'}
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
