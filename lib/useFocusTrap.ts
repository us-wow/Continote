import { useEffect, type RefObject } from 'react';

// 모달 접근성 — 열려 있는 동안 Tab 포커스를 모달 안에 가둔다(밖으로 못 나감).
// 열릴 때 첫 요소로 포커스를 옮기고, 닫힐 때 직전에 포커스가 있던 곳으로 되돌린다.
// 키보드·스크린리더 사용자가 모달 뒤 배경 요소로 새지 않게 하는 표준 패턴.
// active=false면 트랩을 걸지 않는다(모달이 항상 마운트된 채 open으로만 토글되는 경우 대응).
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const prevFocused = document.activeElement as HTMLElement | null;

    // 모달 안에서 탭으로 갈 수 있는 요소들(비활성·숨김 제외).
    const SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(el.querySelectorAll<HTMLElement>(SELECTOR)).filter(
        (n) => !n.hasAttribute('disabled') && n.offsetParent !== null
      );

    // 열릴 때 첫 포커스(없으면 컨테이너 자체).
    const initial = focusables()[0] ?? el;
    initial.focus?.();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      // 끝에서 다음(또는 처음에서 이전)으로 가려 하면 반대편으로 순환시켜 모달 안에 가둔다.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      prevFocused?.focus?.(); // 닫히면 원래 자리로 포커스 복귀
    };
  }, [ref, active]);
}
