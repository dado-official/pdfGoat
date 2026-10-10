import { useEffect, useRef, type RefObject } from 'react';

/**
 * Calls `onVisible` once when the element comes close to the visible area.
 * Does nothing while `enabled` is false.
 */
export function useWhenVisible(element: RefObject<Element | null>, enabled: boolean, onVisible: () => void) {
  const callback = useRef(onVisible);
  useEffect(() => {
    callback.current = onVisible;
  }, [onVisible]);

  useEffect(() => {
    const target = element.current;
    if (!enabled || !target) return;
    // Start a little before the element scrolls into view, so previews are ready in time.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        callback.current();
      },
      { rootMargin: '400px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, enabled]);
}
