import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DICT, I18nContext } from './useI18n';
import type { I18nValue } from './useI18n';
import type { Lang } from './keys';

/**
 * ภาษาเก็บไว้ใน React state ล้วน — ไม่ใช้ localStorage/sessionStorage (กฎเหล็กข้อ 7)
 * ต้นแบบจำภาษาไว้ข้ามการรีเฟรช แต่สเปกโปรเจกต์นี้สั่งห้ามใช้ storage
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('th');

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t: DICT[lang],
      setLang,
      toggleLang: () => setLang((prev) => (prev === 'th' ? 'en' : 'th')),
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** เผื่อไว้ให้เทสหรือ storybook ตั้งภาษาเริ่มต้นเองได้ */
export function useLangState(initial: Lang = 'th') {
  const [lang, setLang] = useState<Lang>(initial);
  const toggle = useCallback(() => setLang((p) => (p === 'th' ? 'en' : 'th')), []);
  return { lang, setLang, toggle };
}
