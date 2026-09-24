import { en } from './locales/en';
import { th } from './locales/th';

export type Language = 'th' | 'en';
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number | Message>;
export const LANGUAGE_STORAGE_KEY = '@stepable/language';
export const locales = { th: 'th-TH', en: 'en-US' } as const;
export const catalogs = { th, en };

export function isLanguage(value: unknown): value is Language {
  return value === 'th' || value === 'en';
}

export function translate(language: Language, key: TranslationKey, params: TranslationParams = {}): string {
  return catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name)
      ? typeof params[name] === 'object'
        ? translate(language, params[name].key, params[name].params)
        : String(params[name])
      : placeholder);
}

// One locale store for this client application. Services and speech callbacks
// read the current locale; React consumers subscribe through useLanguage.
let language: Language = 'th';
const listeners = new Set<() => void>();
export const getLanguage = () => language;
export const getLocale = () => locales[language];
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function applyLanguage(next: Language) {
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}
export function t(key: TranslationKey, params?: TranslationParams) {
  return translate(language, key, params);
}

export type Message = { key: TranslationKey; params?: TranslationParams };
export const message = (key: TranslationKey, params?: TranslationParams): Message => ({ key, params });
export type MessageValue = string | Message;
export function renderMessage(value: MessageValue): string {
  if (typeof value !== 'string') return t(value.key, value.params);
  // Some platform/provider callers forward an already rendered fixed message.
  // Translate only exact application-owned messages, never arbitrary user text.
  for (const key of Object.keys(en) as TranslationKey[]) {
    if (value === en[key] || value === th[key]) return t(key);
  }
  return value;
}
export class LocalizedError extends Error {
  constructor(public readonly localizedMessage: Message) {
    super(renderMessage(localizedMessage));
    this.name = 'LocalizedError';
  }
}
export function errorMessage(error: unknown, fallback: TranslationKey): MessageValue {
  return error instanceof LocalizedError ? error.localizedMessage : message(fallback);
}
