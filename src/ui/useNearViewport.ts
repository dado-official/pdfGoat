import { useEffect, useState, type RefObject } from 'react';

/** True while the element is in or close to the visible area. */
export function useNearViewport(element: RefObject<Element | null>, margin = 800): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      rootMargin: `${margin}px 0px`,
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [element, margin]);
  return near;
}
