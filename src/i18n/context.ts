import { createContext, useContext } from 'react';
import type { MessageKey } from './de';
import type { Lang, Params, PluralBase } from './translate';

export interface I18n {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Text for a key, with `{name}` placeholders filled in. */
  t: (key: MessageKey, params?: Params) => string;
  /** Singular or plural text for a count. */
  tn: (base: PluralBase, count: number, params?: Params) => string;
  /** Readable message for anything that was thrown. */
  errorText: (err: unknown) => string;
}

export const I18nContext = createContext<I18n | null>(null);

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside <I18nProvider>');
  return value;
}
