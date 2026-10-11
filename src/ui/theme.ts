import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'pdfgoat.theme';
const dark = () => window.matchMedia('(prefers-color-scheme: dark)');

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function effective(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === 'light' || set === 'dark') return set;
  return dark().matches ? 'dark' : 'light';
}

function paint() {
  const color = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

/** Applies a saved choice before the first render; without one the system setting decides. */
export function applyStoredTheme() {
  const theme = stored();
  if (theme) document.documentElement.dataset.theme = theme;
  paint();
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(effective);

  useEffect(() => {
    const query = dark();
    const follow = () => {
      if (stored()) return;
      setTheme(effective());
      paint();
    };
    query.addEventListener('change', follow);
    return () => query.removeEventListener('change', follow);
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice then only lasts until the page is reloaded.
    }
    setTheme(next);
    paint();
  }, []);

  return [theme, toggle];
}
