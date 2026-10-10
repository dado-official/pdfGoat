import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, type I18n } from './context';
import { detectLang, errorText, translate, translatePlural, type Lang } from './translate';

const STORAGE_KEY = 'pdfgoat.lang';

// Storage can be blocked (private mode, strict settings); the app must work without it.
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // The choice then only lasts until the page is reloaded.
  }
}

export default function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectLang(readStored(), navigator.languages ?? []));

  // Keep the document itself in the chosen language (screen readers, tab title, search engines).
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = translate(lang, 'meta.title');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', translate(lang, 'meta.description'));
  }, [lang]);

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang: (next) => {
        store(next);
        setLangState(next);
      },
      t: (key, params) => translate(lang, key, params),
      tn: (base, count, params) => translatePlural(lang, base, count, params),
      errorText: (err) => errorText(lang, err),
    }),
    [lang],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}
