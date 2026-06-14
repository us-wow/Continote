'use client';

// 요금제 안내 모달 — 잠긴 유료 기능(왕관)을 누르면 열린다.
// 아직 결제는 오픈 전이라 "준비 중" 안내까지만. 결제 연동 시 CTA를 결제 버튼으로 교체.

import { useEffect } from 'react';

type PricingModalProps = {
  open: boolean;
  onClose: () => void;
};

// 기능 비교표 — 한 줄 = [기능, 무료, 프리미엄]
// (예배 순서 빌더는 운영자 전용 기능이라 이 표에서 제외)
const ROWS: [string, string, string][] = [
  ['가사 추출 · 콘티 · PPT 만들기', '✓', '✓'],
  ['기본 배경 6종 (단색·십자가·성경·초원)', '✓', '✓'],
  ['곡 라이브러리 (다듬은 곡 자동 재사용)', '5곡', '무제한'],
  ['절기·컨셉 배경 (부활·사순·성탄·추수감사·종려…)', '—', '50여 종'],
  ['움직이는 배경 (빛·물결·구름·촛불…)', '—', '30여 종'],
  ['곡별 배경 (한 PPT 안에서 곡마다 다른 배경)', '—', '✓'],
  ['배경 즐겨찾기 (자주 쓰는 배경 맨 위 고정)', '—', '✓'],
  ['내 교회 배경 등록 (사진·영상→배경 변환)', '—', '✓'],
  ['배경 저장 5개 (어느 기기서나)', '—', '✓'],
];

export default function PricingModal({ open, onClose }: PricingModalProps) {
  // ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="요금제 안내"
      style={{
        position: 'fixed', inset: 0, zIndex: 220,
        background: 'rgba(31, 27, 22, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--rule)', boxShadow: '0 20px 60px -10px rgba(0,0,0,0.3)',
          maxWidth: 480, width: '100%', padding: '26px 26px 22px', position: 'relative',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <button
          onClick={onClose}
          aria-label="닫기"
          style={{
            position: 'absolute', top: 12, right: 12, width: 32, height: 32,
            borderRadius: '50%', border: '1px solid var(--rule)',
            background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer', fontSize: 14,
          }}
        >
          ✕
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="20" height="17" viewBox="0 0 24 21" fill="none" aria-hidden="true">
            <path d="M3 18 L3 6 L8.5 10.5 L12 3 L15.5 10.5 L21 6 L21 18 Z" stroke="#F2C14E" strokeWidth="2.4" strokeLinejoin="miter" fill="none" />
          </svg>
          <h2 className="h-display" style={{ margin: 0, fontSize: 21 }}>콘티노트 프리미엄</h2>
        </div>
        <p style={{ marginTop: 8, fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, wordBreak: 'keep-all' }}>
          절기마다 어울리는 배경, 살아 움직이는 배경, 곡마다 다른 배경에 우리 교회만의 배경까지.
        </p>

        <table style={{ width: '100%', marginTop: 14, borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: 'var(--ink-3)', fontSize: 12 }}>
              <th style={{ textAlign: 'left', fontWeight: 500, padding: '6px 0' }}>기능</th>
              <th style={{ width: 56, fontWeight: 500 }}>무료</th>
              <th style={{ width: 72, fontWeight: 600, color: 'var(--accent-ink)' }}>프리미엄</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, free, premium]) => (
              <tr key={feature} style={{ borderTop: '1px solid var(--rule)' }}>
                <td style={{ padding: '8px 0', wordBreak: 'keep-all' }}>{feature}</td>
                <td style={{ textAlign: 'center', color: free === '—' ? 'var(--ink-3)' : 'var(--ink)' }}>{free}</td>
                <td style={{ textAlign: 'center', color: 'var(--accent-ink)', fontWeight: 600 }}>{premium}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: 16, padding: '12px 14px', borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in oklab, var(--accent) 8%, transparent)',
            border: '1px solid color-mix(in oklab, var(--accent) 25%, transparent)',
            fontSize: 13.5, lineHeight: 1.6, wordBreak: 'keep-all',
          }}
        >
          <b>월 4,900원 · 연 39,000원 (예정)</b>
          <div style={{ marginTop: 4, color: 'var(--ink-2)', fontSize: 12.5 }}>
            결제는 준비 중이에요. 오픈하면 이 자리에서 바로 시작할 수 있어요 🙏
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
          style={{ width: '100%', marginTop: 14 }}
        >
          알겠어요 — 기다릴게요
        </button>
      </div>
    </div>
  );
}
