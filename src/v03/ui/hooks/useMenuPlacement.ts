import { useCallback, useLayoutEffect, useRef } from 'react';

/** Keep the compact menu below its trigger, including CSS/browser zoom and font changes. */
export function useMenuPlacement() {
  const ref = useRef<HTMLDetailsElement>(null);
  const place = useCallback(() => {
    const menu = ref.current;
    const panel = menu?.querySelector<HTMLElement>(':scope > div');
    const trigger = menu?.querySelector('summary');
    if (!panel || !trigger) return;
    const zoom = Number.parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    document.documentElement.style.setProperty('--ui-scale', String(zoom));
    const header = menu?.closest('header');
    const alert = header?.parentElement?.querySelector(':scope > .v03-alert');
    const bottom = Math.max(
      header?.getBoundingClientRect().bottom ?? 0,
      alert?.getBoundingClientRect().bottom ?? 0,
    );
    document.documentElement.style.setProperty('--toast-top', `${bottom / zoom + 8}px`);
    if (window.matchMedia('(max-width:800px)').matches) {
      panel.style.top = `${trigger.getBoundingClientRect().bottom / zoom + 4}px`;
    } else panel.style.top = '100%';
  }, []);
  useLayoutEffect(place);
  useLayoutEffect(() => {
    place();
    window.addEventListener('resize', place);
    const observer = new ResizeObserver(place);
    const header = ref.current?.closest('header');
    if (header) observer.observe(header);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [place]);
  return { ref, onToggle: place };
}
