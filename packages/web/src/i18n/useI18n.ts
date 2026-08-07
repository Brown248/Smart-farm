import { createContext, useContext } from 'react';
import { TH } from './th';
import { EN } from './en';
import type { Dict, Lang } from './keys';

export const DICT: Readonly<Record<Lang, Dict>> = { th: TH, en: EN };

export interface I18nValue {
  readonly lang: Lang;
  readonly t: Dict;
  readonly setLang: (lang: Lang) => void;
  readonly toggleLang: () => void;
}

export const I18nContext = createContext<I18nValue | null>(null);

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
