'use client';

// 콘티노트 헤더 — 브랜드 + 디자인 토글 + 사용법 + 내 보관함 + Google 로그인
//
// 기존 동작 그대로 살리는 핵심 props:
//  - authUser/authBusy/onSignIn/onSignOut → Supabase Google 로그인 (Stage A)
//  - onOpenMenu → 메뉴 드로어 (콘티 모음/곡 라이브러리/교회 템플릿 3개)
//  - onOpenHelp → 사용법 모달
//  - theme/onChangeTheme → paper ↔ wanted 디자인 시스템 토글
//
// 헤더 전용 CSS는 globals.css 의 .cn-header* 규칙으로 정의되어 있다.

import BrandMark from './BrandMark';
import type { User } from '@supabase/supabase-js';

export type DesignTheme = 'paper' | 'wanted';

type HeaderProps = {
  theme: DesignTheme;
  onChangeTheme: (next: DesignTheme) => void;
  onOpenMenu: () => void;
  onOpenHelp: () => void;
  supabaseEnabled: boolean;
  authUser: User | null;
  authBusy: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
};

export default function Header({
  theme,
  onChangeTheme,
  onOpenMenu,
  onOpenHelp,
  supabaseEnabled,
  authUser,
  authBusy,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  // paper ↔ wanted 토글 — 한 번 누르면 반대 테마로
  const nextTheme: DesignTheme = theme === 'paper' ? 'wanted' : 'paper';

  return (
    <header className="cn-header">
      <div className="cn-header-inner">
        <div className="brand">
          <BrandMark />
          <div className="brand-text">
            <div className="brand-name">콘티노트</div>
            <div className="brand-sub">ContiNote · 찬양팀 PPT 도우미</div>
          </div>
        </div>

        <nav className="cn-nav">
          <button
            type="button"
            className="btn btn-text theme-switch-btn"
            onClick={() => onChangeTheme(nextTheme)}
            aria-label="디자인 변경"
            title={`디자인 변경 (현재: ${theme === 'paper' ? '종이톤' : 'Wanted'})`}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"
                fill="currentColor"
              />
            </svg>
            <span>디자인 변경</span>
          </button>

          <button type="button" className="btn btn-text" onClick={onOpenHelp}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path
                d="M6 6.2c.2-1.1 1-1.7 2-1.7 1.2 0 2 .7 2 1.7 0 .8-.5 1.2-1.2 1.6-.6.3-.8.6-.8 1.2v.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="8" cy="11.4" r="0.8" fill="currentColor" />
            </svg>
            <span>사용법</span>
          </button>

          <button type="button" className="btn btn-text" onClick={onOpenMenu}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M2 4.5 C2 3.7 2.7 3 3.5 3 H6.2 L7.4 4.2 H12.5 C13.3 4.2 14 4.9 14 5.7 V12 C14 12.8 13.3 13.5 12.5 13.5 H3.5 C2.7 13.5 2 12.8 2 12 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span>내 보관함</span>
          </button>

          {supabaseEnabled && (
            <>
              <div className="nav-divider" aria-hidden="true" />
              {authUser ? (
                <div className="auth-pill" title={authUser.email ?? ''}>
                  <span className="auth-pill-email">
                    {authUser.email?.split('@')[0] ?? '로그인됨'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-text auth-logout"
                    onClick={onSignOut}
                    disabled={authBusy}
                  >
                    로그아웃
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm login-btn"
                  onClick={onSignIn}
                  disabled={authBusy}
                  aria-label="Google 계정으로 로그인"
                >
                  <span className="g-mark" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 18 18">
                      <path
                        fill="#4285F4"
                        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
                      />
                      <path
                        fill="#34A853"
                        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M3.96 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04z"
                      />
                      <path
                        fill="#EA4335"
                        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3 2.32C4.68 5.16 6.66 3.58 9 3.58z"
                      />
                    </svg>
                  </span>
                  {authBusy ? '연결 중…' : '로그인'}
                </button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
