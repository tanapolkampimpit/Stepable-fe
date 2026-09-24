import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyLanguage, getLanguage, isLanguage, LANGUAGE_STORAGE_KEY, locales, renderMessage, subscribeLanguage, type Language, type MessageValue } from './core';

type LanguageActions = { setLanguage: (language: Language) => Promise<void> };
const LanguageContext = createContext<LanguageActions | null>(null);
const actions: LanguageActions = {
  async setLanguage(language) {
    if (!isLanguage(language)) throw new Error('Unsupported language');
    // Publish only after persistence succeeds. A failed save leaves the current
    // language intact and is surfaced by the language picker.
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    applyLanguage(language);
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'th' as const);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY).then((saved) => {
      if (active && isLanguage(saved)) applyLanguage(saved);
    }).catch(() => undefined).finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = language;
  }, [language]);
  if (!ready) return null;
  return <LanguageContext.Provider value={actions}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used inside LanguageProvider');
  const language = useSyncExternalStore(subscribeLanguage, getLanguage, () => 'th' as const);
  return { language, locale: locales[language], ...context };
}

/** Store message keys, so visible notices change language without losing state. */
export function useMessageState(initial: MessageValue = '') {
  useLanguage();
  const [value, setValue] = useState<MessageValue>(initial);
  return [renderMessage(value), setValue] as const;
}
