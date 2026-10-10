import { useEffect, useState } from 'react';

export type LegalRoute = 'privacy' | 'imprint' | 'licenses';

const ROUTES: Record<string, LegalRoute> = { '#/datenschutz': 'privacy', '#/impressum': 'imprint', '#/lizenzen': 'licenses' };

/** Where the links lead. The address is the same in both languages. */
export const ROUTE_HASH: Record<LegalRoute, string> = { privacy: '#/datenschutz', imprint: '#/impressum', licenses: '#/lizenzen' };

/** The legal page that the address asks for, or null for the app itself. */
export function useLegalRoute(): LegalRoute | null {
  const [route, setRoute] = useState<LegalRoute | null>(() => ROUTES[location.hash] ?? null);
  useEffect(() => {
    const onChange = () => setRoute(ROUTES[location.hash] ?? null);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
