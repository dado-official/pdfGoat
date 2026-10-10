// Pure translation helpers: no React, no DOM.
import { AppError } from '../core/errors';
import { de, type MessageKey } from './de';
import { en } from './en';

export type Lang = 'de' | 'en';
export type Params = Record<string, string | number>;

/** Keys that exist as "<base>.one" and "<base>.other". */
export type PluralBase = MessageKey extends infer K ? (K extends `${infer B}.one` ? B : never) : never;

export const LANGS: readonly Lang[] = ['de', 'en'];
export const messages: Record<Lang, Record<MessageKey, string>> = { de, en };

const isLang = (value: unknown): value is Lang => LANGS.includes(value as Lang);

/** The stored choice wins; otherwise the first supported browser language; otherwise English. */
export function detectLang(stored: string | null, browserLangs: readonly string[]): Lang {
  if (isLang(stored)) return stored;
  for (const tag of browserLangs) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLang(primary)) return primary;
  }
  return 'en';
}

/** Looks up a text and fills in `{name}` placeholders. Unknown placeholders stay visible. */
export function translate(lang: Lang, key: MessageKey, params: Params = {}): string {
  return messages[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}

/** Picks the singular or plural text; `{count}` is filled in automatically. */
export function translatePlural(lang: Lang, base: PluralBase, count: number, params: Params = {}): string {
  return translate(lang, `${base}.${count === 1 ? 'one' : 'other'}`, { count, ...params });
}

/** A readable message for anything that was thrown. */
export function errorText(lang: Lang, err: unknown): string {
  if (err instanceof AppError) return translate(lang, `error.${err.code}`, err.params);
  const message = err instanceof Error ? err.message : String(err);
  return translate(lang, 'error.failed', { message });
}
